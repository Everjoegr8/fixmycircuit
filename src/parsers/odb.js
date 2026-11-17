// ODB++ job archive (.tgz, .tar or .zip). Like a KiCad layout, ODB++ carries the
// real copper: every track, arc and pad on every signal layer, the parts and
// their pins, and which net each piece of copper belongs to. Coordinates are
// converted to mils with Y up, the same as the boardview formats.
import { inflateRaw, ungzip } from 'pako';
import { SIDE } from './util.js';

const td = new TextDecoder('utf-8');

// --- archives ------------------------------------------------------------------

/** Files in a tar archive: path -> bytes. */
export function readTar(bytes) {
  const out = new Map();
  let off = 0;
  let longName = '';
  while (off + 512 <= bytes.length) {
    const h = bytes.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, n) => { let s = ''; for (let i = a; i < a + n && h[i]; i++) s += String.fromCharCode(h[i]); return s; };
    let name = str(0, 100);
    const prefix = str(345, 155);
    if (prefix && !longName) name = prefix + '/' + name;
    if (longName) { name = longName; longName = ''; }
    const size = parseInt(str(124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const data = bytes.subarray(off + 512, off + 512 + size);
    if (type === 'L') longName = td.decode(data).replace(/\0+$/, '');
    else if (type === '0' || type === '\0') out.set(name, data);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Files in a zip archive: path -> bytes (stored or deflated entries). */
export function readZip(bytes) {
  const out = new Map();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Damaged zip file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const ds = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(ds, ds + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRaw(raw));
  }
  return out;
}

/** Unix "compress" (.Z, LZW) as used by many ODB++ exporters for features files. */
export function uncompressZ(data) {
  if (data[0] !== 0x1f || data[1] !== 0x9d) throw new Error('Not a .Z file');
  const maxbits = data[2] & 0x1f, block = (data[2] & 0x80) !== 0;
  const maxmax = 1 << maxbits;
  const prefix = new Uint16Array(maxmax), suffix = new Uint8Array(maxmax);
  for (let i = 0; i < 256; i++) suffix[i] = i;
  const total = (data.length - 3) * 8;
  let pos = 0, base = 0, nbits = 9, maxcode = (1 << nbits) - 1, free = block ? 257 : 256;
  let oldcode = -1, finchar = 0;
  const out = [];
  const stack = [];
  const align = () => { const g = nbits * 8; pos = base + Math.ceil((pos - base) / g) * g; base = pos; };
  while (pos + nbits <= total) {
    if (free > maxcode) {
      align();
      nbits++;
      maxcode = nbits === maxbits ? maxmax : (1 << nbits) - 1;
      continue;
    }
    const b = 3 + (pos >> 3);
    let code = ((data[b] | (data[b + 1] << 8) | (data[b + 2] << 16)) >>> (pos & 7)) & ((1 << nbits) - 1);
    pos += nbits;
    if (oldcode === -1) { if (code >= 256) throw new Error('Bad .Z data'); oldcode = finchar = code; out.push(code); continue; }
    if (code === 256 && block) {
      free = 256;
      align();
      nbits = 9; maxcode = (1 << nbits) - 1;
      continue;
    }
    const incode = code;
    if (code >= free) { if (code > free) throw new Error('Bad .Z data'); stack.push(finchar); code = oldcode; }
    while (code >= 256) { stack.push(suffix[code]); code = prefix[code]; }
    finchar = suffix[code];
    stack.push(finchar);
    while (stack.length) out.push(stack.pop());
    if (free < maxmax) { prefix[free] = oldcode; suffix[free] = finchar; free++; }
    oldcode = incode;
  }
  return Uint8Array.from(out);
}

export function isOdbArchive(bytes) {
  return (bytes[0] === 0x1f && bytes[1] === 0x8b) || (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes.length > 262 && String.fromCharCode(...bytes.subarray(257, 262)) === 'ustar');
}

function openArchive(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readZip(bytes);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return readTar(ungzip(bytes));
  return readTar(bytes);
}

// --- ODB++ ---------------------------------------------------------------------

const lines = (bytes) => td.decode(bytes).split(/\r?\n/);

function unitsOf(text, def = 'INCH') {
  const m = /^\s*(?:UNITS\s*=\s*|U\s+)(MM|INCH)/im.exec(text);
  return m ? m[1].toUpperCase() : def;
}

/** Symbol width in file units (mils for INCH files, microns for MM files). */
function symbolWidth(name) {
  const m = /^(?:r|s)([\d.]+)/i.exec(name) || /^(?:rect|oval)([\d.]+)x([\d.]+)/i.exec(name);
  if (!m) return 0;
  return m[2] ? Math.min(+m[1], +m[2]) : +m[1];
}

/**
 * @param {Uint8Array} bytes .tgz/.tar/.zip of an ODB++ job
 */
export function parseODB(bytes) {
  const files = openArchive(bytes);
  // Find the job root: the folder holding matrix/matrix.
  let root = null;
  for (const k of files.keys()) { const m = /^(.*?)matrix\/matrix$/i.exec(k); if (m) { root = m[1]; break; } }
  if (root == null) throw new Error('Not an ODB++ job: matrix/matrix not found in the archive.');
  const get = (rel) => {
    const want = (root + rel).toLowerCase();
    for (const [k, v] of files) {
      const kl = k.toLowerCase();
      if (kl === want) return v;
      if (kl === want + '.z') return uncompressZ(v);
    }
    return null;
  };

  // Matrix: steps and layers.
  const matrix = td.decode(get('matrix/matrix'));
  const blocks = [...matrix.matchAll(/(STEP|LAYER)\s*\{([^}]*)\}/g)].map((m) => {
    const o = { kind: m[1] };
    for (const l of m[2].split(/\r?\n/)) { const kv = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(l); if (kv) o[kv[1].toUpperCase()] = kv[2]; }
    return o;
  });
  const steps = blocks.filter((b) => b.kind === 'STEP').map((b) => b.NAME);
  const stepNames = new Set([...files.keys()].map((k) => (k.slice(root.length).match(/^steps\/([^/]+)\//i) || [])[1]).filter(Boolean));
  const step = steps.find((s) => /pcb/i.test(s) && stepNames.has(s)) || steps.find((s) => stepNames.has(s)) || [...stepNames][0];
  if (!step) throw new Error('ODB++ job has no step.');
  const signal = blocks.filter((b) => b.kind === 'LAYER' && /^(SIGNAL|POWER_GROUND|MIXED)$/i.test(b.TYPE || '') && (b.CONTEXT || 'BOARD').toUpperCase() === 'BOARD')
    .sort((a, b) => +a.ROW - +b.ROW).map((b) => b.NAME);
  const sideOfLayer = (name) => (name === signal[0] ? 'top' : name === signal[signal.length - 1] ? 'bottom' : 'inner');
  const S = `steps/${step}/`;

  // Nets and which copper features belong to them (eda/data).
  const netNames = [];
  const featNet = new Map(); // "layer|index" -> net
  const eda = get(S + 'eda/data');
  if (eda) {
    let lyr = [];
    let cur = '';
    for (const l of lines(eda)) {
      if (l.startsWith('LYR ')) lyr = l.slice(4).trim().split(/\s+/);
      else if (l.startsWith('NET ')) { cur = l.slice(4).split(';')[0].trim(); netNames.push(cur); }
      else if (l.startsWith('FID ')) { const f = l.split(/\s+/); const ln = lyr[+f[2]]; if (ln) featNet.set(`${ln.toLowerCase()}|${+f[3]}`, cur); }
    }
  }
  const netOfNum = (n) => { const v = netNames[+n]; return v && !/^\$NONE\$$/i.test(v) ? v : ''; };

  // Parts and pins.
  const parts = [], pins = [];
  for (const [layer, side] of [['comp_+_top', SIDE.TOP], ['comp_+_bot', SIDE.BOTTOM]]) {
    const f = get(S + `layers/${layer}/components`);
    if (!f) continue;
    const text = td.decode(f);
    const k = unitsOf(text) === 'MM' ? 1 / 0.0254 : 1000;
    let pi = -1;
    for (const l of text.split(/\r?\n/)) {
      const t = l.split(';')[0].trim().split(/\s+/);
      if (t[0] === 'CMP') { pi = parts.length; parts.push({ name: t[6] || `CMP${pi}`, side, mfgcode: t[7] || '' }); }
      else if (t[0] === 'TOP' && pi >= 0) pins.push({ part: pi, snum: t[8] || t[1], name: t[8] || t[1], x: +t[2] * k, y: +t[3] * k, net: netOfNum(t[6]), side });
    }
  }

  // Copper on every signal layer.
  const traces = [];
  const pads = [];
  for (const layer of signal) {
    const f = get(S + `layers/${layer.toLowerCase()}/features`) || get(S + `layers/${layer}/features`);
    if (!f) continue;
    const text = td.decode(f);
    const mm = unitsOf(text) === 'MM';
    const k = mm ? 1 / 0.0254 : 1000; // coordinates -> mils
    const kw = mm ? 1 / 25.4 : 1; // symbol sizes (microns or mils) -> mils
    const syms = [];
    const side = sideOfLayer(layer);
    let idx = -1;
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l[0] === '#') continue;
      if (l[0] === '$') { const m = /^\$(\d+)\s+(\S+)/.exec(l); if (m) syms[+m[1]] = symbolWidth(m[2]); continue; }
      const c = l[0];
      if (!'LPATBS'.includes(c) || l[1] !== ' ') continue;
      idx++;
      const t = l.split(';')[0].trim().split(/\s+/);
      const net = featNet.get(`${layer.toLowerCase()}|${idx}`) || '';
      if (c === 'L' && t[6] !== 'N') traces.push({ x1: +t[1] * k, y1: +t[2] * k, x2: +t[3] * k, y2: +t[4] * k, w: (syms[+t[5]] || 0) * kw, net, side });
      else if (c === 'A' && t[8] !== 'N') {
        const xs = +t[1], ys = +t[2], xe = +t[3], ye = +t[4], xc = +t[5], yc = +t[6], cw = t[10] === 'Y';
        const r = Math.hypot(xs - xc, ys - yc);
        let a0 = Math.atan2(ys - yc, xs - xc), a1 = Math.atan2(ye - yc, xe - xc);
        if (cw && a1 >= a0) a1 -= 2 * Math.PI;
        if (!cw && a1 <= a0) a1 += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 16)));
        let px = xs, py = ys;
        for (let i = 1; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n, qx = xc + r * Math.cos(a), qy = yc + r * Math.sin(a);
          traces.push({ x1: px * k, y1: py * k, x2: qx * k, y2: qy * k, w: (syms[+t[7]] || 0) * kw, net, side });
          px = qx; py = qy;
        }
      } else if (c === 'P') pads.push({ x: +t[1] * k, y: +t[2] * k, net, side });
    }
  }

  // Board outline from the step profile.
  const outlineSegments = [];
  const prof = get(S + 'profile');
  if (prof) {
    const text = td.decode(prof);
    const k = unitsOf(text) === 'MM' ? 1 / 0.0254 : 1000;
    let last = null;
    for (const l of text.split(/\r?\n/)) {
      const t = l.trim().split(/\s+/);
      if (t[0] === 'OB') last = { x: +t[1] * k, y: +t[2] * k };
      else if ((t[0] === 'OS' || t[0] === 'OC') && last) { const p = { x: +t[1] * k, y: +t[2] * k }; outlineSegments.push([last, p]); last = p; }
      else if (t[0] === 'OE') last = null;
    }
  }

  if (!parts.length) throw new Error('This ODB++ job has no component layers (comp_+_top / comp_+_bot).');
  return { format: 'ODB++', parts, pins, outline: [], outlineSegments, traces, vias: [], odbPads: pads.length, odbStep: step };
}
