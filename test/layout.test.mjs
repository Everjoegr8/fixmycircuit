import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard } from '../src/parsers/index.js';
import { parseGerber, alignGerber, placeGerber, guessGerberSide } from '../src/parsers/gerber.js';
import * as W from './fixtures/demoBoard.js';

const demo = W.demoBoard();
const pinKey = (b, p) => `${b.parts[p.part].name}.${p.snum}`;

test('KiCad layout: parts, pads (with rotation), nets and real copper', () => {
  const b = loadBoard(W.writeKiCad(demo), 'demo.kicad_pcb', {});
  assert.equal(b.format, 'KiCad');
  assert.equal(b.parts.length, demo.parts.length);
  const want = new Map(demo.pins.map((p) => [`${demo.parts[p.part].name}.${p.snum}`, p]));
  for (const p of b.pins) {
    const w = want.get(pinKey(b, p));
    assert.ok(w, pinKey(b, p));
    assert.ok(Math.abs(p.x - w.x) < 0.5 && Math.abs(p.y - w.y) < 0.5, `${pinKey(b, p)} at ${p.x},${p.y} want ${w.x},${w.y}`);
    if (w.net !== 'UNCONNECTED') assert.equal(p.net, w.net);
  }
  assert.equal(b.parts.find((p) => p.name === 'U3').side, 'bottom');
  assert.equal(b.parts.find((p) => p.name === 'U1').mfgcode, 'SYN-U1');
  const routes = W.demoRoutes(demo);
  assert.ok(b.traces.length >= routes.length, 'tracks and arc segments');
  assert.ok(b.traces.some((t) => t.net === 'PP1V8' && t.side === 'bottom'));
  assert.ok(b.traces.some((t) => t.side === 'inner'), 'arc on an inner layer');
  assert.equal(b.vias.length, 1);
  assert.equal(b.vias[0].net, 'VBAT');
  assert.ok(b.outlineSegments.length === 4);
  assert.ok(Math.abs(b.traces[0].w - 0.15 / 0.0254) < 0.01, 'width in mils');
});

test('Gerber X2 copper lines up with the boardview through pad attributes', () => {
  const board = loadBoard(W.writeBRD(demo), 'demo.brd', {});
  const g = parseGerber(new TextDecoder().decode(W.writeGerberTop(demo)));
  assert.equal(g.side, 'top');
  assert.ok(g.pads.length > 50 && g.pads[0].ref);
  assert.ok(g.traces.every((t) => t.net), 'every track carries its net');
  const fit = alignGerber(g, board);
  assert.equal(fit.method, 'pins');
  assert.ok(fit.error < 0.5, 'fit error ' + fit.error);
  const placed = placeGerber(g, fit, 'top');
  const r = W.demoRoutes(demo).filter((t) => t.side === 'top');
  assert.equal(placed.length, r.length);
  // Board BRD coordinates are the demo mils; a placed track must land on its route.
  const near = (a, b) => Math.abs(a - b) < 0.6;
  for (let i = 0; i < r.length; i++) assert.ok(near(placed[i].x1, r[i].x1) && near(placed[i].y1, r[i].y1) && placed[i].net === r[i].net, `track ${i}`);
});

test('Gerber without X2 pads falls back to the board extent', () => {
  const text = '%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.010*%\nD10*\nX0Y0D02*\nX10000Y0D01*\nX10000Y5000D01*\nG03X0Y5000I-5000J0D01*\nM02*\n';
  const g = parseGerber(text);
  assert.ok(Math.abs(g.traces[0].x2 - 25.4) < 1e-6, 'inches to mm');
  assert.ok(g.traces.length > 4, 'arc split into segments');
  const fit = alignGerber(g, { pins: [], parts: [], bounds: { minx: 0, miny: 0, maxx: 1000, maxy: 1000 } });
  assert.equal(fit.method, 'extent');
  assert.equal(guessGerberSide('board-B_Cu.gbr'), 'bottom');
  assert.equal(guessGerberSide('board.GTL'), 'top');
});

import { uncompressZ, parseODB } from '../src/parsers/odb.js';
import { compressZ } from './fixtures/demoBoard.js';

test('Unix .Z (LZW) round trip, including code width changes', () => {
  let s = ''; for (let i = 0; i < 20000; i++) s += 'NET' + ((i * 7919) % 1000) + ' L ' + (i % 97) + '\n';
  const raw = new TextEncoder().encode(s);
  assert.equal(new TextDecoder().decode(uncompressZ(compressZ(raw))), s);
});

test('ODB++ job: parts, pins, nets, real copper on both sides', () => {
  for (const gzip of [true, false]) {
    const b = loadBoard(W.writeODB(demo, { gzip }), gzip ? 'demo.tgz' : 'demo.tar', {});
    assert.equal(b.format, 'ODB++');
    assert.equal(b.parts.length, demo.parts.length);
    const u2 = b.parts.find((p) => p.name === 'U2');
    const pin1 = b.pins[u2.pins.find((i) => b.pins[i].snum === '1')];
    assert.equal(pin1.net, 'VBUS');
    assert.ok(Math.abs(pin1.x - 1300) < 0.5 && Math.abs(pin1.y - 1000) < 0.5);
    assert.equal(b.parts.find((p) => p.name === 'U3').side, 'bottom');
    assert.ok(b.traces.some((t) => t.side === 'top' && t.net === 'VBUS'));
    assert.ok(b.traces.some((t) => t.side === 'bottom' && t.net === 'PP1V8'), 'bottom copper from the .Z features file');
    assert.ok(b.traces.filter((t) => t.net === 'VBAT').length > 4, 'arc split into segments');
    assert.equal(b.outlineSegments.length, 4);
    assert.ok(Math.abs(b.traces[0].w - 6) < 0.01, 'r6 symbol = 6 mil');
  }
});
