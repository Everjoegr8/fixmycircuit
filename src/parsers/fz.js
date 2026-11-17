// FZ (ASUS) reader. Ported from OpenBoardView FZFile.cpp (MIT).
// Encrypted FZ files need the user's own 44-word RC6 key (Settings). Plain
// zlib FZ files open without a key.
import { Inflate } from 'pako';
import { bytesToLatin1, splitLines, emptyBoard, genOutline, fixText, addNailsAsPins, SIDE } from './util.js';

const KEY_PARITY = [0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1];

/** Parse a key typed by the user: 44 hex numbers separated by spaces/commas/newlines. */
export function parseFZKey(text) {
  if (!text) return null;
  const words = String(text).match(/(0x)?[0-9a-fA-F]{1,8}/g) || [];
  if (words.length !== 44) return null;
  return words.map((w) => parseInt(w.replace(/^0x/i, ''), 16) >>> 0);
}

export function checkFZKey(key) {
  if (!key || key.length !== 44) return false;
  return key.every((w, i) => {
    let t = w >>> 0;
    t ^= t >>> 16; t ^= t >>> 8; t ^= t >>> 4; t ^= t >>> 2; t ^= t >>> 1;
    return ((~t) & 1) === KEY_PARITY[i];
  });
}

const rotl = (a, b) => ((a << (b & 31)) | (a >>> (32 - (b & 31)))) >>> 0;

/** RC6-based stream decryption used by FZ (in place). */
export function fzDecode(buf, key) {
  const r = 20;
  let A = 0, B = 0, C = 0, D = 0;
  const ibuf = new Uint8Array(16);
  for (let pos = 0; pos < buf.length; pos++) {
    B = (B + key[0]) >>> 0;
    D = (D + key[1]) >>> 0;
    for (let i = 1; i <= r; i++) {
      const t = rotl(Math.imul(B, (2 * B + 1) >>> 0) >>> 0, 5);
      const u = rotl(Math.imul(D, (2 * D + 1) >>> 0) >>> 0, 5);
      A = (rotl((A ^ t) >>> 0, u) + key[2 * i]) >>> 0;
      C = (rotl((C ^ u) >>> 0, t) + key[2 * i + 1]) >>> 0;
      const tmp = A; A = B; B = C; C = D; D = tmp;
    }
    A = (A + key[2 * r + 2]) >>> 0;
    const cur = buf[pos];
    buf[pos] = cur ^ (A & 0xff);
    ibuf.copyWithin(0, 1);
    ibuf[15] = cur;
    const w = (o) => (ibuf[o] | (ibuf[o + 1] << 8) | (ibuf[o + 2] << 16) | (ibuf[o + 3] << 24)) >>> 0;
    A = w(0); B = w(4); C = w(8); D = w(12);
  }
  return buf;
}

/** Inflate one zlib stream, ignoring any bytes after the end of the stream. */
function inflate(data) {
  // pako treats trailing bytes as a second stream and then reports a header
  // error, so collect output chunks ourselves and keep what the first stream gave.
  // Inflating as raw deflate (skipping the 2 byte zlib header) avoids that.
  if (data.length < 3 || (data[0] & 0x0f) !== 8) throw new Error('not a zlib stream');
  const inf = new Inflate({ raw: true });
  const chunks = [];
  inf.onData = (c) => chunks.push(c);
  inf.push(data.subarray(2), true);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error(inf.msg || 'zlib error');
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function inflateLoose(data) {
  try {
    return inflate(data);
  } catch (e) {
    throw new Error('FZ file could not be decompressed (wrong key?)');
  }
}

export function parseFZ(bytes, keyText) {
  const buf = new Uint8Array(bytes);
  if (buf.length < 8) throw new Error('FZ file is too small');
  const isZlib = buf[4] === 0x78 && (buf[5] === 0x9c || buf[5] === 0xda);
  if (!isZlib) {
    const key = parseFZKey(keyText);
    if (!key) throw new Error('This FZ file is encrypted. Add your FZ key (44 hex words) in Settings to open it.');
    if (!checkFZKey(key)) throw new Error('The FZ key in Settings is not valid (parity check failed).');
    fzDecode(buf, key);
  }
  const n = buf.length;
  const descrSize = (buf[n - 4] | (buf[n - 3] << 8) | (buf[n - 2] << 16) | (buf[n - 1] << 24)) >>> 0;
  if (descrSize > n) throw new Error('FZ file could not be decoded (wrong key?)');
  const contentSize = n - descrSize + 4;
  const content = inflateLoose(buf.subarray(4, Math.min(n, 4 + contentSize)));
  let descr = null;
  try { descr = inflate(buf.subarray(contentSize, n - 4)); } catch { descr = null; }

  const board = emptyBoard('FZ');
  const partIds = new Map();
  let multiplier = 1;
  let block = 0;
  const text = bytesToLatin1(content);
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'UNIT:millimeters') multiplier = 25.4;
    if (line[0] === 'A') {
      const h = line.slice(2);
      block = h.startsWith('REFDES') ? 1 : h.startsWith('NET_NAME') ? 2 : h.startsWith('TESTVIA') ? 3 : -1;
      continue;
    }
    if (line[0] !== 'S') continue;
    const f = line.slice(2).split('!').map((s) => fixText(s.trimStart()));
    const num = (s) => parseFloat(String(s).replace(',', '.')) || 0;
    if (block === 1) {
      const name = f[0];
      board.parts.push({ name, side: f[3] === 'YES' ? SIDE.BOTTOM : SIDE.TOP, type: 'smd' });
      partIds.set(name, board.parts.length - 1);
    } else if (block === 2) {
      const [net, partName, snum, name] = f;
      const part = partIds.get(partName);
      if (part === undefined) continue;
      const nameIsPos = snum.length <= 1 && (snum === '' || snum === '0');
      let radius = num(f[7]) / 100;
      if (radius < 0.5) radius = 0.5;
      board.pins.push({
        net, part, snum: nameIsPos ? name : snum, name: nameIsPos ? name : name || snum,
        x: num(f[4]) * multiplier, y: num(f[5]) * multiplier, probe: parseInt(f[6], 10) || 0,
        radius: radius * multiplier, side: board.parts[part].side,
      });
    } else if (block === 3) {
      // f[0] is "Y"
      board.nails.push({ net: f[1], x: num(f[5]) * multiplier, y: num(f[6]) * multiplier, side: f[7] === 'T' ? SIDE.TOP : SIDE.BOTTOM });
    }
  }
  if (descr) {
    const lines = splitLines(bytesToLatin1(descr));
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line[0] === 's') continue;
      const f = line.split('\t');
      const description = fixText((f[1] || '').trim());
      for (const loc of (f[3] || '').split(/[\s,]+/)) {
        const id = partIds.get(loc);
        if (id !== undefined) board.parts[id].mfgcode = description;
      }
    }
  }
  if (!board.parts.length) throw new Error('FZ file decoded but contained no parts (wrong key?)');
  addNailsAsPins(board);
  genOutline(board);
  return board;
}
