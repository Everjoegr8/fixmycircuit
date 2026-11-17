// A small, entirely synthetic "demo phone" board and writers that serialise it
// into each supported boardview format. Nothing here comes from a real OEM file;
// it exists so the parsers can be tested and the app has a sample to open.
import { deflate } from 'pako';
import { encodeBDV } from '../../src/parsers/bdv.js';
import { desECB } from '../../src/parsers/des.js';

export function demoBoard() {
  const parts = [];
  const pins = [];
  const add = (name, side, pinList) => {
    const part = parts.length;
    parts.push({ name, side });
    for (const [snum, x, y, net] of pinList) pins.push({ part, snum, x, y, net, side });
  };
  // PMIC: 6x6 BGA
  const pmicNets = ['VBAT', 'GND', 'PP1V8', 'PP3V3', 'I2C_SCL', 'I2C_SDA'];
  const bga = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) bga.push([`${'ABCDEF'[r]}${c + 1}`, 800 + c * 20, 1800 + r * 20, pmicNets[(r * 6 + c) % pmicNets.length]]);
  add('U1', 'top', bga);
  // Charging IC
  add('U2', 'top', [
    ['1', 1300, 1000, 'VBUS'], ['2', 1300, 1030, 'VBAT'], ['3', 1300, 1060, 'GND'],
    ['4', 1360, 1000, 'CHG_EN'], ['5', 1360, 1030, 'I2C_SCL'], ['6', 1360, 1060, 'I2C_SDA'],
  ]);
  // USB connector
  const jNets = ['VBUS', 'USB_DP', 'USB_DM', 'CC1', 'GND', 'VBUS', 'USB_DP', 'USB_DM', 'CC2', 'GND'];
  add('J1', 'top', jNets.map((n, i) => [String(i + 1), 900 + (i % 5) * 40, 300 + Math.floor(i / 5) * 60, n]));
  // Passives
  const caps = [['C1', 'VBAT'], ['C2', 'VBUS'], ['C3', 'PP1V8'], ['C4', 'PP3V3'], ['C5', 'VBAT']];
  caps.forEach(([n, net], i) => add(n, 'top', [['1', 600 + i * 80, 1500, net], ['2', 600 + i * 80, 1530, 'GND']]));
  add('R1', 'top', [['1', 1200, 1300, 'I2C_SCL'], ['2', 1230, 1300, 'PP1V8']]);
  add('R2', 'top', [['1', 1200, 1350, 'I2C_SDA'], ['2', 1230, 1350, 'PP1V8']]);
  add('L1', 'top', [['1', 1000, 1300, 'VBAT'], ['2', 1060, 1300, 'PP1V8']]);
  add('F1', 'top', [['1', 1100, 600, 'VBUS'], ['2', 1140, 600, 'VBUS_PROT']]);
  // Bottom side parts
  add('U3', 'bottom', [['1', 500, 3000, 'PP1V8'], ['2', 560, 3000, 'GND'], ['3', 500, 3060, 'I2C_SCL'], ['4', 560, 3060, 'I2C_SDA']]);
  add('C20', 'bottom', [['1', 700, 3000, 'PP1V8'], ['2', 700, 3030, 'GND']]);
  add('NC1', 'bottom', [['1', 800, 3200, 'UNCONNECTED'], ['2', 830, 3200, 'UNCONNECTED']]);
  const outline = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }, { x: 0, y: 0 }];
  const nails = [{ probe: 1, x: 1500, y: 2500, side: 'top', net: 'VBAT' }, { probe: 2, x: 1500, y: 2600, side: 'bottom', net: 'GND' }];
  return { parts, pins, outline, nails };
}

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const partEnd = (b) => b.parts.map((_, i) => b.pins.reduce((n, p, j) => (p.part === i ? j + 1 : n), 0));

export function writeBRD(b, encoded = false) {
  const L = [];
  L.push('str_length:', '0', 'var_data:', `${b.outline.length} ${b.parts.length} ${b.pins.length} ${b.nails.length}`, 'Format:');
  for (const p of b.outline) L.push(`${p.x} ${p.y}`);
  L.push('Parts:');
  const ends = partEnd(b);
  b.parts.forEach((p, i) => L.push(`${p.name} ${p.side === 'top' ? 5 : 10} ${ends[i]}`));
  L.push('Pins:');
  for (const p of b.pins) L.push(`${p.x} ${p.y} -99 ${p.part + 1} ${p.net}`);
  L.push('Nails:');
  for (const n of b.nails) L.push(`${n.probe} ${n.x} ${n.y} ${n.side === 'top' ? 1 : 2} ${n.net}`);
  const bytes = enc(L.join('\r\n') + '\r\n');
  if (!encoded) return bytes;
  // Inverse of decodeBRD: decoded = ~(rotl2(c)) -> c = rotr2(~decoded)
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const d = bytes[i];
    if (d === 13 || d === 10 || d === 0) { out[i] = d; continue; }
    const n = ~d & 0xff;
    out[i] = ((n >> 2) | (n << 6)) & 0xff;
  }
  out.set([0x23, 0xe2, 0x63, 0x28], 0); // header used for detection
  return out;
}

function ascPins(b, partWord = 'Part', sep = ' ') {
  const L = [];
  b.parts.forEach((part, i) => {
    L.push(`${partWord} ${part.name} ${part.side === 'top' ? '(T)' : '(B)'}`);
    b.pins.forEach((p, j) => {
      if (p.part === i) L.push([j + 1, p.snum, (p.x / 1000).toFixed(3), (p.y / 1000).toFixed(3), 1, p.net, j + 1].join(sep));
    });
  });
  return L;
}
const HEADER8 = Array.from({ length: 8 }, (_, i) => `; header line ${i + 1}`);

export function writeBDVPlain(b) {
  const L = ['<<format.asc>>', ...HEADER8];
  for (const p of b.outline) L.push(`${(p.x / 1000).toFixed(3)} ${(p.y / 1000).toFixed(3)}`);
  L.push('<<pins.asc>>', ...HEADER8, ...ascPins(b));
  L.push('<<nails.asc>>', ...HEADER8.slice(0, 7));
  b.nails.forEach((n, i) => L.push(`$${n.probe} ${(n.x / 1000).toFixed(3)} ${(n.y / 1000).toFixed(3)} 1 A1 ${n.side === 'top' ? '(T)' : '(B)'} ${i + 1} ${n.net}`));
  return enc(L.join('\r\n') + '\r\n');
}
export const writeBDV = (b) => encodeBDV(writeBDVPlain(b));

export function writeASC(b) {
  const fmt = ['; format', ...HEADER8.slice(0, 7), ...b.outline.map((p) => `${(p.x / 1000).toFixed(3)} ${(p.y / 1000).toFixed(3)}`)];
  const pins = ['; pins', ...HEADER8.slice(0, 7), ...ascPins(b, 'Part', '   ')];
  const nails = ['; nails', ...HEADER8.slice(0, 6), ...b.nails.map((n, i) => `$${n.probe} ${(n.x / 1000).toFixed(3)} ${(n.y / 1000).toFixed(3)} 1 A1 ${n.side === 'top' ? '(T)' : '(B)'} ${i + 1} ${n.net}`)];
  return { 'format.asc': enc(fmt.join('\r\n')), 'pins.asc': enc(pins.join('\r\n')), 'nails.asc': enc(nails.join('\r\n')) };
}

export function writeBVR1(b) {
  const L = ['BVRAW_FORMAT_1', '<<Layout>>', 'x,y'];
  for (const p of b.outline) L.push(`${(p.x / 1000).toFixed(3)},${(p.y / 1000).toFixed(3)}`);
  L.push('<<Pin>>', 'header');
  b.pins.forEach((p, j) => {
    const part = b.parts[p.part];
    L.push([part.name, part.side === 'top' ? '(T)' : '(B)', j + 1, p.snum, (p.x / 1000).toFixed(3), (p.y / 1000).toFixed(3), 1, p.net].join('\t'));
  });
  L.push('<<Nail>>', 'header');
  b.nails.forEach((n, i) => L.push([`$${n.probe}`, (n.x / 1000).toFixed(3), (n.y / 1000).toFixed(3), 1, 'A1', n.side === 'top' ? '(T)' : '(B)', i + 1, n.net].join('\t')));
  return enc(L.join('\r\n'));
}

export function writeBVR3(b) {
  const L = ['BVRAW_FORMAT_3'];
  b.parts.forEach((part, i) => {
    L.push(`PART_NAME ${part.name}`, `PART_SIDE ${part.side === 'top' ? 'T' : 'B'}`, 'PART_ORIGIN 0 0', 'PART_MOUNT SMD');
    for (const p of b.pins.filter((p) => p.part === i))
      L.push(`PIN_NUMBER ${p.snum}`, `PIN_NAME ${p.snum}`, `PIN_SIDE ${part.side === 'top' ? 'T' : 'B'}`, `PIN_ORIGIN ${p.x} ${p.y}`, `PIN_NET ${p.net}`, 'PIN_END');
    L.push('PART_END');
  });
  const segs = [];
  for (let i = 0; i + 1 < b.outline.length; i++) segs.push(`${b.outline[i].x} ${b.outline[i].y} ${b.outline[i + 1].x} ${b.outline[i + 1].y}`);
  L.push(`OUTLINE_SEGMENTED ${segs.reverse().join(' ')}`);
  return enc(L.join('\n'));
}

export function writeBRD2(b) {
  const netList = [...new Set(b.pins.map((p) => p.net).concat(b.nails.map((n) => n.net)))];
  const netId = (n) => netList.indexOf(n) + 1;
  const maxY = 4000;
  const L = [`BRDOUT: ${b.outline.length} 2000 ${maxY}`];
  for (const p of b.outline) L.push(`${p.x} ${p.y}`);
  L.push(`NETS: ${netList.length}`);
  netList.forEach((n, i) => L.push(`${i + 1} ${n}`));
  L.push(`PARTS: ${b.parts.length}`);
  let start = 0;
  b.parts.forEach((part, i) => {
    L.push(`${part.name} 0 0 0 0 ${start} ${part.side === 'top' ? 1 : 2}`);
    start += b.pins.filter((p) => p.part === i).length;
  });
  L.push(`PINS: ${b.pins.length}`);
  for (const p of b.pins) {
    const side = b.parts[p.part].side === 'top' ? 1 : 2;
    L.push(`${p.x} ${side === 1 ? p.y : maxY - p.y} ${netId(p.net)} ${side}`);
  }
  L.push(`NAILS: ${b.nails.length}`);
  for (const n of b.nails) L.push(`${n.probe} ${n.x} ${n.side === 'top' ? n.y : maxY - n.y} ${netId(n.net)} ${n.side === 'top' ? 1 : 2}`);
  return enc(L.join('\n'));
}

export function writeFZPlain(b) {
  const L = ['A!REFDES!COMP_INSERTION_CODE!SYM_NAME!SYM_MIRROR!SYM_ROTATE!'];
  for (const p of b.parts) L.push(`S!${p.name}!X!SYM!${p.side === 'top' ? 'NO' : 'YES'}!0!`);
  L.push('A!NET_NAME!REFDES!PIN_NUMBER!PIN_NAME!PIN_X!PIN_Y!TEST_POINT!RADIUS!');
  for (const p of b.pins) L.push(`S!${p.net}!${b.parts[p.part].name}!${p.snum}!${p.snum}!${p.x}!${p.y}!0!10!`);
  L.push('A!TESTVIA!');
  for (const n of b.nails) L.push(`S!Y!${n.net}!TP!0!X!${n.x}!${n.y}!${n.side === 'top' ? 'T' : 'B'}!10!`);
  const content = deflate(enc(L.join('\r\n')));
  const descr = deflate(enc('Demo board\r\nPARTNUMBER\tDESCRIPTION\tQTY\tLOCATION\tPN2\r\nPN-1\tDemo PMIC\t1\tU1\tX\r\n'));
  // Layout: 4 byte prefix, content, descr, 4 byte LE descr size (incl. the size field).
  const out = new Uint8Array(4 + content.length + descr.length + 4);
  out.set(content, 4);
  out.set(descr, 4 + content.length);
  const d = descr.length + 4 + 4; // descr_size so that content_size = n - descr_size + 4 = 4 + content.length
  const n = out.length;
  void n;
  new DataView(out.buffer).setUint32(out.length - 4, d, true);
  return out;
}

export function writeCST(b) {
  const bytes = [];
  const short = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff);
  const str = (s) => { for (const c of s) bytes.push(c.charCodeAt(0)); };
  short(b.parts.length);
  bytes.push(0, 0, 0, 0);
  short(5); str('CPart');
  b.parts.forEach((p) => {
    bytes.push(p.name.length); str(p.name);
    bytes.push(0, 0, 0, 0);
    bytes.push(p.side === 'top' ? 0x0c : 0x01);
    bytes.push(0, 0, 0, 0, 0, 0);
  });
  const nets = [...new Set(b.pins.map((p) => p.net))];
  bytes.length -= 2; // the reader steps back 2 bytes for the net count
  short(nets.length);
  for (const n of nets) { bytes.push(n.length); str(n); }
  short(b.pins.length);
  bytes.push(0, 0, 0, 0, 0, 0);
  str('CPad');
  for (const p of b.pins) {
    short(p.part); short(0); short(nets.indexOf(p.net)); short(p.x); short(p.y); short(0);
    bytes.push(0, 0, 0, 0);
  }
  return Uint8Array.from(bytes);
}

// --- XZZ ---------------------------------------------------------------
// A valid-parity test key (not a real vendor key).
export const TEST_XZZ_KEY = '0103030303030303';

export function writeXZZ(b, keyHex = TEST_XZZ_KEY) {
  const key = BigInt('0x' + keyHex);
  const SCALE = 10000;
  const u32 = (v) => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0, true); return [...a]; };
  const netList = [...new Set(b.pins.map((p) => p.net))];
  const blocks = [];
  // outline as layer 28 line segments
  for (let i = 0; i + 1 < b.outline.length; i++) {
    const a = b.outline[i], c = b.outline[i + 1];
    const body = [...u32(28), ...u32(a.x * SCALE), ...u32(a.y * SCALE), ...u32(c.x * SCALE), ...u32(c.y * SCALE), ...u32(SCALE), ...u32(0)];
    blocks.push(0x05, ...u32(body.length), ...body);
  }
  b.parts.forEach((part, i) => {
    const sub = [];
    const name = [...part.name].map((c) => c.charCodeAt(0));
    // 0x06 label sub block: type byte + 30 bytes, then name length + name
    const pinsData = [];
    for (const p of b.pins.filter((p) => p.part === i)) {
      const pn = [...p.snum].map((c) => c.charCodeAt(0));
      const inner = [...u32(0), ...u32(p.x * SCALE), ...u32(p.y * SCALE), ...new Array(8).fill(0), ...u32(pn.length), ...pn, ...new Array(32).fill(0), ...u32(netList.indexOf(p.net))];
      pinsData.push(0x09, ...u32(inner.length), ...inner);
    }
    const group = [];
    sub.push(...new Array(18).fill(0), ...u32(group.length), ...group, 0x06, ...new Array(30).fill(0), ...u32(name.length), ...name, ...pinsData);
    let plain = [...u32(sub.length), ...sub];
    while (plain.length % 8) plain.push(0);
    const encd = desECB(Uint8Array.from(plain), key, 'e');
    blocks.push(0x07, ...u32(encd.length), ...encd);
  });
  const netBlock = [];
  netList.forEach((n, i) => { const nb = [...n].map((c) => c.charCodeAt(0)); netBlock.push(...u32(nb.length + 8), ...u32(i), ...nb); });
  const header = new Array(0x30).fill(0);
  [...'XZZPCB V1.0'].forEach((c, i) => (header[i] = c.charCodeAt(0)));
  const mainStart = header.length;
  const main = [...u32(blocks.length), ...blocks];
  const netStart = mainStart + main.length;
  const out = [...header, ...main, ...u32(netBlock.length), ...netBlock];
  out.splice(0x20, 4, ...u32(mainStart - 0x20));
  out.splice(0x28, 4, ...u32(netStart - 0x20));
  return Uint8Array.from(out);
}
