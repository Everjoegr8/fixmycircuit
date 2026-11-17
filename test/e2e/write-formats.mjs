// Writes the synthetic demo board in every supported boardview format (plus a
// PNG photo) into a folder, for the end-to-end import test.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as W from '../fixtures/demoBoard.js';

const dir = process.argv[2];
fs.mkdirSync(path.join(dir, 'asc'), { recursive: true });
const b = W.demoBoard();
const files = {
  'demo-brd.brd': W.writeBRD(b),
  'demo-brd-encoded.brd': W.writeBRD(b, true),
  'demo-brd2.brd': W.writeBRD2(b),
  'demo-bdv.bdv': W.writeBDV(b),
  'demo-bvr1.bv': W.writeBVR1(b),
  'demo-bvr3.bvr': W.writeBVR3(b),
  'demo-cst.cst': W.writeCST(b),
  'demo-fz.fz': W.writeFZPlain(b),
  'demo-xzz.pcb': W.writeXZZ(b),
  'demo-kicad.kicad_pcb': W.writeKiCad(b),
  'demo-odb.tgz': W.writeODB(b),
};
for (const [n, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), bytes);
fs.writeFileSync(path.join(dir, 'demo-top.gtl'), W.writeGerberTop(b));
for (const [n, bytes] of Object.entries(W.writeASC(b))) fs.writeFileSync(path.join(dir, 'asc', n), bytes);

// A small real PNG (gradient) to test PNG photo import.
const w = 64, h = 48;
const raw = Buffer.alloc((w * 3 + 1) * h);
for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = 120; raw[o + 2] = y * 5; } }
const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.join(dir, 'demo-photo.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(JSON.stringify({ files: Object.keys(files), asc: Object.keys(W.writeASC(b)), xzzKey: W.TEST_XZZ_KEY }));
