import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexBoard, findPath, railFamily, partType } from '../src/shared/netindex.ts';

// Tiny board: J1.1(VBUS) - F1 - VBUS_F - L1 - VSYS - U1 ; C1 VSYS-GND ; C2 VSYS-GND ; R1 VSYS-EN
function mk() {
  const parts = [];
  const pins = [];
  const add = (name, nets) => {
    const pi = parts.length;
    parts.push({ name, index: pi, pins: [], side: 'top' });
    nets.forEach((n, k) => { const i = pins.length; pins.push({ part: pi, net: n, snum: String(k + 1), index: i }); parts[pi].pins.push(i); });
  };
  add('J1', ['VBUS', 'GND']);
  add('F1', ['VBUS', 'VBUS_F']);
  add('L1', ['VBUS_F', 'VSYS']);
  add('C1', ['VSYS', 'GND']);
  add('C2', ['VSYS', 'GND']);
  add('R1', ['VSYS', 'EN']);
  add('U1', ['VSYS', 'EN', 'GND', 'SDA', 'SCL', 'NC', 'X', 'Y']);
  const nets = new Map();
  for (const p of pins) { if (!p.net || p.net === 'NC') continue; if (!nets.has(p.net)) nets.set(p.net, []); nets.get(p.net).push(p.index); }
  return { parts, pins, nets };
}

test('part types from reference designators', () => {
  assert.equal(partType('R1203'), 'resistor');
  assert.equal(partType('C5'), 'capacitor');
  assert.equal(partType('FB2'), 'filter');
  assert.equal(partType('U4001'), 'ic');
  assert.equal(partType('J1'), 'connector');
  assert.equal(partType('TP12'), 'testpoint');
});

test('index knows every net, part and decoupling', () => {
  const idx = indexBoard(mk());
  assert.equal(idx.stats.parts, 7);
  assert.equal(idx.stats.ncPins, 1);
  assert.equal(idx.nets.get('VSYS').caps, 2);
  assert.ok(idx.nets.get('VSYS').rail);
  assert.ok(idx.nets.get('GND').ground);
  assert.deepEqual(idx.nets.get('VSYS').ics, ['U1']);
});

test('path tracer goes through fuse and coil but not ground', () => {
  const idx = indexBoard(mk());
  const p = findPath(idx, 'J1', 'U1');
  assert.ok(p);
  assert.deepEqual(p.map((s) => s.net), ['VBUS', 'VBUS_F', 'VSYS']);
  assert.deepEqual(p.slice(1).map((s) => s.via.part), ['F1', 'L1']);
  assert.equal(findPath(idx, 'VBUS', 'SDA'), null);
  const fam = railFamily(idx, 'VBUS', 3).map((x) => x.net);
  assert.ok(fam.includes('EN'));
});
