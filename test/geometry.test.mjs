import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minAreaRect, convexHull, inRect, chainOutline } from '../src/parsers/geometry.js';
import { buildBoard } from '../src/parsers/index.js';

test('minimum-area rectangle finds a rotated part', () => {
  const a = (30 * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i < 6; i++) for (const y of [-20, 20]) { const x = -25 + i * 10; pts.push({ x: x * Math.cos(a) - y * Math.sin(a) + 100, y: x * Math.sin(a) + y * Math.cos(a) + 50 }); }
  const r = minAreaRect(pts);
  assert.ok(Math.abs(Math.abs(r.a) - a) < 1e-6 || Math.abs(Math.abs(r.a) - (Math.PI / 2 - a)) < 1e-6, 'angle 30 deg');
  assert.ok(Math.abs(r.cx - 100) < 1e-6 && Math.abs(r.cy - 50) < 1e-6);
  assert.ok(Math.abs(r.w * r.h - 50 * 40) < 1e-3);
  assert.ok(convexHull(pts).length >= 4);
  assert.ok(inRect(r, 100, 50) && !inRect(r, 160, 50));
});

test('outline segments chain into one closed board polygon', () => {
  const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
  const segs = [[c[2], c[3]], [c[0], c[1]], [c[3], c[0]], [c[1], c[2]]];
  const loops = chainOutline(segs, 0.01);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].length, 5);
});

function raw(parts) {
  const b = { format: 'BRD', parts: [], pins: [], outline: [], outlineSegments: [], nails: [] };
  for (const [name, pts] of parts) {
    const pi = b.parts.length;
    b.parts.push({ name, side: 'top' });
    pts.forEach(([x, y], k) => b.pins.push({ x, y, part: pi, net: `${name}_${k}`, snum: String(k + 1), side: 'top' }));
  }
  return b;
}

test('pins-only parts get real-looking bodies and pads', () => {
  const rot = (x, y, deg) => { const a = (deg * Math.PI) / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };
  const qfn = [];
  for (let i = 0; i < 5; i++) { qfn.push([-50, -40 + i * 20], [50, -40 + i * 20], [-40 + i * 20, -50], [-40 + i * 20, 50]); }
  const bga = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) bga.push([1000 + c * 16, 1000 + r * 16]);
  const b = buildBoard(raw([
    ['C1', [[0, 0], [40, 0]]],
    ['R7', [rot(0, 0, 45), rot(40, 0, 45)].map(([x, y]) => [x + 300, y])],
    ['U1', qfn.map(([x, y]) => [x + 600, y])],
    ['U2', bga],
  ]));
  const [c1, r7, u1, u2] = b.parts;
  assert.equal(c1.kind, 'capacitor');
  assert.equal(c1.pkg, 'chip');
  assert.ok(c1.body.w > 40 && c1.body.h < c1.body.w, 'chip body spans both pads');
  assert.ok(Math.abs(Math.abs(r7.body.a) - Math.PI / 4) < 1e-6, 'rotated resistor keeps its 45 degree angle');
  assert.equal(u1.pkg, 'quad');
  const left = b.pins[u1.pins[0]];
  assert.ok(left.pw > left.ph, 'QFN pads on the left edge point outwards (along x)');
  const top = b.pins[u1.pins[3]];
  assert.ok(top.ph > top.pw, 'pads on the top edge point along y');
  assert.equal(u2.pkg, 'bga');
  assert.equal(b.pins[u2.pins[0]].shape, 'round');
  assert.ok(Math.abs(b.pins[u2.pins[0]].pw - 16 * 0.55) < 1e-6, 'ball size from the pitch');
  assert.ok(u2.body.w > 80, 'BGA body wider than the ball grid');
  assert.equal(b.geometry, 'pins');
});
