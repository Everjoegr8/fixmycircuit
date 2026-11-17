// XZZ PCB (.pcb) reader, common for phone boardviews. Ported from OpenBoardView
// XZZPCBFile.cpp (MIT). Part blocks are DES encrypted; the user supplies the key
// in Settings (OpenBoardView does not ship one either).
import { bytesToLatin1, emptyBoard, u32le, fixText, SIDE } from './util.js';
import { desECB } from './des.js';

const SCALE = 10000;
const MAGIC = 'XZZPCB';

export function isXZZ(bytes) {
  if (bytes.length < 6) return false;
  if (bytesToLatin1(bytes.subarray(0, 6)) === MAGIC) return true;
  if (bytes.length > 0x10 && bytes[0x10] !== 0) {
    const k = bytes[0x10];
    return Array.from(bytes.subarray(0, 6), (b) => String.fromCharCode(b ^ k)).join('') === MAGIC;
  }
  return false;
}

export function parseXZZKey(text) {
  if (text == null || text === '') return null;
  const t = String(text).trim().replace(/^0x/i, '').replace(/[\s:-]/g, '');
  if (!/^[0-9a-fA-F]{1,16}$/.test(t)) return null;
  return BigInt('0x' + t);
}

export function checkXZZKey(key) {
  const parity = [1, 1, 1, 1, 1, 1, 1, 0];
  for (let i = 0; i < 8; i++) {
    let t = Number((key >> BigInt(i * 8)) & 0xffn);
    t ^= t >> 4; t ^= t >> 2; t ^= t >> 1;
    if (((~t) & 1) !== parity[i]) return false;
  }
  return true;
}

const str = (b, start, len) => {
  if (start + len > b.length) throw new Error('Corrupt XZZ file');
  return fixText(bytesToLatin1(b.subarray(start, start + len)));
};

function arcToSegments(start, end, r, cx, cy) {
  if (start > end) [start, end] = [end, start];
  if (end - start > 180) start += 360;
  const n = 10;
  const a0 = (start * Math.PI) / 180;
  const a1 = (end * Math.PI) / 180;
  const step = (a1 - a0) / (n - 1);
  const segs = [];
  let prev = { x: Math.trunc(cx + r * Math.cos(a0)), y: Math.trunc(cy + r * Math.sin(a0)) };
  for (let i = 1; i < n; i++) {
    const a = a0 + i * step;
    const p = { x: Math.trunc(cx + r * Math.cos(a)), y: Math.trunc(cy + r * Math.sin(a)) };
    segs.push([prev, p]);
    prev = p;
  }
  return segs;
}

export function parseXZZ(bytes, keyText) {
  const key = parseXZZKey(keyText);
  if (key == null) throw new Error('This XZZ .pcb file needs a DES key. Add your XZZ key (16 hex digits) in Settings to open it.');
  if (!checkXZZKey(key)) throw new Error('The XZZ key in Settings is not valid (parity check failed).');

  const buf = new Uint8Array(bytes);
  if (buf.length < 0x30) throw new Error('XZZ file is too small');
  // XOR the header area up to the "v6v6555v6v6" marker if the file is obfuscated.
  if (buf[0x10] !== 0) {
    const marker = 'v6v6555v6v6';
    let end = buf.length;
    outer: for (let i = 0; i <= buf.length - marker.length; i++) {
      for (let j = 0; j < marker.length; j++) if (buf[i + j] !== marker.charCodeAt(j)) continue outer;
      end = i;
      break;
    }
    const k = buf[0x10];
    for (let i = 0; i < end; i++) buf[i] ^= k;
  }

  const board = emptyBoard('XZZ');
  const nets = new Map();
  const mainStart = u32le(buf, 0x20) + 0x20;
  const netStart = u32le(buf, 0x28) + 0x20;
  const mainSize = u32le(buf, mainStart);
  const netSize = u32le(buf, netStart);

  // Net block
  {
    const nb = buf.subarray(netStart + 4, netStart + 4 + netSize);
    let p = 0;
    while (p + 8 <= nb.length) {
      const size = u32le(nb, p);
      const idx = u32le(nb, p + 4);
      p += 8;
      if (size < 8) break;
      nets.set(idx, str(nb, p, size - 8));
      p += size - 8;
    }
  }
  const netName = (i) => {
    const n = nets.get(i);
    return n === undefined || n === 'NC' ? 'UNCONNECTED' : n;
  };

  const parsePin = (b, ptr) => {
    const size = u32le(b, ptr);
    const end = ptr + size + 4;
    ptr += 8;
    const x = u32le(b, ptr) / SCALE;
    const y = u32le(b, ptr + 4) / SCALE;
    ptr += 16;
    const nameSize = u32le(b, ptr);
    ptr += 4;
    const name = str(b, ptr, nameSize);
    ptr += nameSize + 32;
    const net = netName(u32le(b, ptr));
    return { pin: { x: Math.trunc(x), y: Math.trunc(y), name, snum: name, net, side: SIDE.TOP }, end };
  };

  const parsePart = (enc) => {
    const b = desECB(enc, key, 'd');
    let ptr = 0;
    const partSize = u32le(b, ptr);
    ptr += 4 + 18;
    const groupSize = u32le(b, ptr);
    ptr += 4 + groupSize;
    if (b[ptr] !== 0x06) throw new Error('XZZ part block could not be decrypted (wrong key?)');
    ptr += 31;
    const nameSize = u32le(b, ptr);
    ptr += 4;
    const name = str(b, ptr, nameSize);
    ptr += nameSize;
    const partIndex = board.parts.length;
    const limit = Math.min(partSize + 4, b.length);
    while (ptr < limit) {
      const t = b[ptr++];
      if (t === 0x01 || t === 0x05 || t === 0x06) ptr += u32le(b, ptr) + 4;
      else if (t === 0x09) {
        const { pin, end } = parsePin(b, ptr);
        pin.part = partIndex;
        board.pins.push(pin);
        ptr = end;
      }
    }
    board.parts.push({ name, side: SIDE.TOP, type: 'smd' });
  };

  const parseTestPad = (b) => {
    const x = u32le(b, 4) / SCALE;
    const y = u32le(b, 8) / SCALE;
    const nameLen = u32le(b, 20);
    const name = str(b, 24, nameLen);
    const netIdx = u32le(b, b.length - 4);
    let net = nets.get(netIdx) ?? '';
    if (net === 'UNCONNECTED' || net === 'NC') net = '';
    board.pins.push({ x: Math.trunc(x), y: Math.trunc(y), name, snum: name, net, side: SIDE.TOP, part: board.parts.length, testpoint: true });
    board.parts.push({ name: '...' + name, side: SIDE.TOP, type: 'smd', testpoint: true });
  };

  let ptr = mainStart + 4;
  const end = mainStart + 4 + mainSize;
  if (end > buf.length) throw new Error('Corrupt XZZ file');
  while (ptr < end) {
    const type = buf[ptr];
    const size = u32le(buf, ptr + 1);
    ptr += 5;
    const block = buf.subarray(ptr, ptr + size);
    ptr += size;
    if (type === 0x01) {
      const layer = u32le(block, 0);
      if (layer !== 28) continue;
      const [x, y, r, a0, a1] = [1, 2, 3, 4, 5].map((i) => Math.trunc(u32le(block, i * 4) / SCALE));
      board.outlineSegments.push(...arcToSegments(a0, a1, r, x, y));
    } else if (type === 0x05) {
      if (u32le(block, 0) !== 28) continue;
      const [x1, y1, x2, y2] = [1, 2, 3, 4].map((i) => Math.trunc(u32le(block, i * 4) / SCALE));
      board.outlineSegments.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    } else if (type === 0x07) parsePart(new Uint8Array(block));
    else if (type === 0x09) parseTestPad(block);
  }

  // Translate so the outline starts at 0,0.
  if (board.outlineSegments.length) {
    let tx = Infinity, ty = Infinity;
    for (const [a, b] of board.outlineSegments) { tx = Math.min(tx, a.x, b.x); ty = Math.min(ty, a.y, b.y); }
    for (const s of board.outlineSegments) for (const p of s) { p.x -= tx; p.y -= ty; }
    for (const p of board.pins) { p.x -= tx; p.y -= ty; }
  }
  return board;
}
