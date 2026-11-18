import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard, searchBoard, parseRawBoard } from '../src/parsers/index.js';
import { des } from '../src/parsers/des.js';
import { parseASC } from '../src/parsers/bdv.js';
import { buildBoard } from '../src/parsers/index.js';
import * as W from './fixtures/demoBoard.js';

const demo = W.demoBoard();

function checkDemo(board, { nails = true, sides = true } = {}) {
  const real = board.parts.filter((p) => !p.testpoint && !p.name.startsWith('...'));
  assert.equal(real.length, demo.parts.length, 'part count');
  const u1 = board.parts.find((p) => p.name === 'U1');
  assert.ok(u1, 'U1 present');
  assert.equal(u1.pins.length, 36, 'U1 pin count');
  assert.equal(u1.side, 'top');
  if (sides) assert.equal(board.parts.find((p) => p.name === 'U3').side, 'bottom');
  // Net connectivity: VBAT connects U1, U2, C1, C5, L1 (+ nail)
  const vbatParts = new Set(board.nets.get('VBAT').map((i) => board.parts[board.pins[i].part].name));
  for (const n of ['U1', 'U2', 'C1', 'C5', 'L1']) assert.ok(vbatParts.has(n), `VBAT reaches ${n}`);
  assert.ok(!board.nets.has('UNCONNECTED'), 'unconnected pins are not a net');
  // I2C_SCL crosses sides
  const scl = new Set(board.nets.get('I2C_SCL').map((i) => board.parts[board.pins[i].part].name));
  assert.ok(scl.has('U3') && scl.has('U2') && scl.has('R1'));
  if (nails) assert.ok(board.pins.some((p) => p.testpoint && p.net === 'VBAT'), 'nail became a test point pin');
  // Coordinates scale is consistent: R1 pin 1 sits 30 units left of pin 2 (in file units)
  const r1 = board.parts.find((p) => p.name === 'R1').pins.map((i) => board.pins[i]);
  assert.equal(r1.length, 2);
  assert.ok(Math.abs(Math.abs(r1[0].x - r1[1].x) / Math.abs(board.bounds.maxx - board.bounds.minx) - 30 / 2000) < 0.02);
}

test('DES matches the FIPS test vector', () => {
  assert.equal(des(0x0123456789abcdefn, 0x133457799bbcdff1n, 'e'), 0x85e813540f0ab405n);
  assert.equal(des(0x85e813540f0ab405n, 0x133457799bbcdff1n, 'd'), 0x0123456789abcdefn);
});

test('BRD plain', () => checkDemo(loadBoard(W.writeBRD(demo), 'demo.brd')));
test('BRD encoded', () => checkDemo(loadBoard(W.writeBRD(demo, true), 'demo.brd')));
test('BRD2', () => checkDemo(loadBoard(W.writeBRD2(demo), 'demo.brd')));
test('BDV encoded', () => checkDemo(loadBoard(W.writeBDV(demo), 'demo.bdv')));
test('ASC (three files)', () => checkDemo(buildBoard(parseASC(W.writeASC(demo)))));
test('BVR1 (.bv)', () => checkDemo(loadBoard(W.writeBVR1(demo), 'demo.bv')));
test('BVR3', () => checkDemo(loadBoard(W.writeBVR3(demo), 'demo.bvr'), { nails: false }));
test('CST', () => checkDemo(loadBoard(W.writeCST(demo), 'demo.cst'), { nails: false }));
test('FZ (zlib, no key)', () => {
  const b = loadBoard(W.writeFZPlain(demo), 'demo.fz');
  checkDemo(b);
  assert.equal(b.parts.find((p) => p.name === 'U1').mfgcode, 'Demo PMIC');
});
test('FZ encrypted without key gives a clear error', () => {
  const bytes = W.writeFZPlain(demo);
  bytes[4] = 0; // break zlib signature so it is treated as encrypted
  assert.throws(() => loadBoard(bytes, 'x.fz'), /FZ key/);
});
test('XZZ with key', () => checkDemo(loadBoard(W.writeXZZ(demo), 'demo.pcb', { xzzKey: W.TEST_XZZ_KEY }), { nails: false, sides: false })); // XZZ has no side info yet (same as OBV)
test('XZZ without key gives a clear error', () => {
  assert.throws(() => parseRawBoard(W.writeXZZ(demo), 'demo.pcb', {}), /XZZ key/);
});
test('unknown format', () => assert.throws(() => loadBoard(new Uint8Array([1, 2, 3, 4, 5, 6]), 'x.brd'), /Unrecognised/));

test('search ranks exact matches first and finds nets', () => {
  const b = loadBoard(W.writeBRD(demo), 'demo.brd');
  const r = searchBoard(b, 'u1');
  assert.equal(r[0].name, 'U1');
  const n = searchBoard(b, 'vbus');
  assert.ok(n.some((x) => x.kind === 'net' && x.name === 'VBUS'));
  assert.ok(n.some((x) => x.kind === 'net' && x.name === 'VBUS_PROT'));
});

test('GenCAD: pins from shapes, real pad sizes, body outline, route copper', () => {
  const b = loadBoard(W.writeGenCAD(demo), 'demo.cad');
  assert.equal(b.format, 'GenCAD');
  checkDemo(b, { nails: false });
  const u1 = b.parts.find((p) => p.name === 'U1');
  assert.equal(b.pins[u1.pins[0]].shape, 'round');
  assert.ok(Math.abs(b.pins[u1.pins[0]].pw - 10) < 0.01, 'BGA ball is the 10 mil pad from $PADS');
  assert.ok(u1.outline && Math.abs(u1.body.w - 140) < 0.5, 'U1 body comes from the shape rectangle');
  const r1 = b.parts.find((p) => p.name === 'R1').pins.map((i) => b.pins[i]);
  assert.ok(Math.abs(r1[0].pw - 12) < 0.01 && Math.abs(r1[0].ph - 8) < 0.01, 'R1 pad from $PADS');
  assert.ok(b.traces.length === 1 && b.traces[0].net === 'VBAT' && b.vias.length === 1, 'routes give copper and vias');
});
test('Altium ASCII: pads with sizes, overlay body, keepout outline, copper', () => {
  const b = loadBoard(W.writeAltium(demo), 'demo.pcbdoc');
  assert.equal(b.format, 'Altium');
  checkDemo(b, { nails: false });
  const u1 = b.parts.find((p) => p.name === 'U1');
  assert.ok(Math.abs(u1.body.w - 140) < 0.5 && Math.abs(u1.body.h - 240) < 0.5, 'U1 body from overlay');
  assert.equal(b.outlinePolys.length, 1);
  assert.equal(b.traces.length, 1);
});
test('CAD panel export', () => {
  const b = loadBoard(W.writeCADPanel(demo), 'demo.cad');
  assert.equal(b.format, 'CAD');
  checkDemo(b);
  assert.equal(b.pins[b.parts.find((p) => p.name === 'U1').pins[0]].snum, 'A1');
});
test('CAE without key gives a clear error', () => {
  const bytes = W.writeFZPlain(demo);
  bytes[4] = 0;
  assert.throws(() => loadBoard(bytes, 'x.cae'), /CAE key/);
});
test('Allegro binaries get a helpful message', () => {
  const bytes = new Uint8Array(0x200);
  bytes.set([0x61, 0x6c, 0x6c], 0xf8);
  assert.throws(() => loadBoard(bytes, 'x.brd'), /Allegro/);
});
