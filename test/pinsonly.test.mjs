// Phone boardviews (.brd, .bdv, .fz ...) only carry pin centres and nets. These
// tests take a real open board, strip it down to what such a file holds, and
// check that the shapes the app guesses stay close to the real ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBoard } from '../src/parsers/index.js';

const TERES = new URL('../openboards/Olimex/TERES-I laptop/TERES-I mainboard (A64) Rev C/TERES_PCB1-A64-MAIN_Rev.C.kicad_pcb', import.meta.url);

/** Write a parsed board as a pins-only BRD (no pad sizes, no part outlines, no copper). */
function toPinsOnlyBRD(b) {
  const r = Math.round;
  const poly = b.outlinePolys[0] || [];
  const outline = poly.length ? [...poly, poly[0]] : [];
  const byPart = b.parts.map(() => []);
  for (const p of b.pins) byPart[p.part]?.push(p);
  const parts = [], pins = [];
  b.parts.forEach((part, i) => {
    if (!byPart[i].length) return;
    for (const p of byPart[i]) pins.push([p, parts.length]);
    parts.push([part, pins.length]);
  });
  const L = ['str_length:', '0', 'var_data:', `${outline.length} ${parts.length} ${pins.length} 0`, 'Format:'];
  for (const p of outline) L.push(`${r(p.x)} ${r(p.y)}`);
  L.push('Parts:');
  for (const [p, end] of parts) L.push(`${p.name} ${p.side === 'bottom' ? 10 : 5} ${end}`);
  L.push('Pins:');
  for (const [p, i] of pins) L.push(`${r(p.x)} ${r(p.y)} -99 ${i + 1} ${p.net || 'UNCONNECTED'}`);
  L.push('Nails:');
  return new TextEncoder().encode(L.join('\r\n') + '\r\n');
}

test('pins-only copy of a real board gets bodies and pads close to the real ones', () => {
  const real = loadBoard(new Uint8Array(readFileSync(TERES)), 'teres.kicad_pcb', {});
  const brd = loadBoard(toPinsOnlyBRD(real), 'teres.brd', {});
  assert.equal(brd.geometry, 'pins');
  const multi = brd.parts.filter((p) => p.pins.length > 1);
  assert.ok(multi.length > 400);
  assert.ok(multi.every((p) => p.body), 'every part has a body');
  const realPad = new Map();
  for (const p of real.pins) { const n = real.parts[p.part].name; realPad.set(n, Math.max(realPad.get(n) || 0, p.pw, p.ph)); }
  const tooBig = brd.parts.filter((p, i) => {
    const guess = Math.max(...brd.pins.filter((q) => q.part === i).map((q) => Math.max(q.pw, q.ph)));
    return guess > 3 * (realPad.get(p.name) || Infinity);
  });
  assert.deepEqual(tooBig.map((p) => p.name), [], 'no guessed pad more than 3x the real pad');
  const kinds = brd.parts.filter((p) => p.kind === real.parts.find((q) => q.name === p.name)?.kind).length;
  assert.ok(kinds / brd.parts.length > 0.95, 'part kinds match the real board');
});

test('few pins far apart (switch, module mounting pads) get small corner pads', () => {
  const sq = (name, x, y, d) => [[x, y], [x + d, y], [x, y + d], [x + d, y + d]].map(([px, py], k) => `${px} ${py} -99 ${k} GND`);
  // Two 0402s set the small-pad size, then a tact switch and a module's mounting pads.
  const L = ['str_length:', '0', 'var_data:', '0 4 12 0', 'Format:', 'Parts:', 'C1 5 2', 'C2 5 4', 'SW1 5 8', 'MOD1 5 12', 'Pins:',
    '0 0 -99 1 A', '40 0 -99 1 GND', '0 100 -99 2 B', '40 100 -99 2 GND', ...sq('SW1', 500, 500, 110), ...sq('MOD1', 1000, 1000, 2000), 'Nails:'];
  const b = loadBoard(new TextEncoder().encode(L.join('\r\n') + '\r\n'), 'x.brd', {});
  for (const [name, max] of [['SW1', 4], ['MOD1', 13]]) {
    const i = b.parts.findIndex((p) => p.name === name);
    for (const p of b.pins.filter((q) => q.part === i)) assert.ok(Math.max(p.pw, p.ph) < b.smallPad * max, `${name} pad ${p.pw}`);
  }
});

test('KiCad 5 arcs (centre, start, angle) close the board outline', () => {
  const pcb = `(kicad_pcb (version 20171130)
  (gr_line (start 0 5) (end 0 20) (layer Edge.Cuts) (width 0.15))
  (gr_line (start 5 0) (end 30 0) (layer Edge.Cuts) (width 0.15))
  (gr_line (start 30 0) (end 30 20) (layer Edge.Cuts) (width 0.15))
  (gr_line (start 30 20) (end 0 20) (layer Edge.Cuts) (width 0.15))
  (gr_arc (start 5 5) (end 0 5) (angle 90) (layer Edge.Cuts) (width 0.15))
  (module R (layer F.Cu) (at 10 10) (fp_text reference R1 (at 0 0) (layer F.SilkS))
    (pad 1 smd rect (at -1 0) (size 1 1) (layers F.Cu) (net 1 A))
    (pad 2 smd rect (at 1 0) (size 1 1) (layers F.Cu) (net 2 B))))`;
  const b = loadBoard(new TextEncoder().encode(pcb), 'old.kicad_pcb', {});
  assert.equal(b.outlinePolys.length, 1, 'one closed outline');
  // The corner arc bends round (5,5) instead of cutting straight to the centre.
  const mm = b.outlineSegments.length;
  assert.ok(mm > 5, `arc split into segments (${mm})`);
});
