import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeFile, cleanName, placementFromMeta } from '../src/shared/libsort.ts';

test('folders give brand, series and model', () => {
  assert.deepEqual(placeFile('board.kicad_pcb', ['Raspberry Pi', 'Compute Module', 'CM4 IO Board']), { brand: 'Raspberry Pi', series: 'Compute Module', model: 'CM4 IO Board', how: 'folders' });
  const p = placeFile('x.pcb', ['Tecno', 'Camon 20 Pro']);
  assert.equal(p.brand, 'Tecno'); assert.equal(p.series, 'Camon'); assert.equal(p.model, 'Camon 20 Pro');
  assert.equal(placeFile('x.brd', ['Apple', 'iPhone 12 Pro']).brand, 'iPhone');
});

test('file names give brand, series and model', () => {
  const a = placeFile('Tecno_Camon-20_Pro_CK7n BOARDVIEW.pcb', []);
  assert.deepEqual([a.brand, a.series, a.model], ['Tecno', 'Camon', 'Camon 20 Pro CK7n']);
  const b = placeFile('Samsung Galaxy A32 SM-A325F.fz', []);
  assert.deepEqual([b.brand, b.series], ['Samsung', 'Galaxy A']);
  assert.equal(b.model, 'Galaxy A32 SM A325F');
  const c = placeFile('Redmi_Note_10_Pro.pcb', []);
  assert.deepEqual([c.brand, c.series], ['Xiaomi', 'Redmi Note']);
  const d = placeFile('iPhone 12 Pro 820-02100.brd', []);
  assert.deepEqual([d.brand, d.series, d.model], ['iPhone', 'iPhone 12', 'iPhone 12 Pro 820 02100']);
  const e = placeFile('Infinix_Hot_30_X6831.pcb', []);
  assert.deepEqual([e.brand, e.series], ['Infinix', 'Hot']);
  assert.equal(placeFile('random_board.brd', []).how, 'unknown');
});

test('model.json wins', () => {
  assert.deepEqual(placementFromMeta({ brand: 'Olimex', series: 'OLinuXino', model: 'A64' }), { brand: 'Olimex', series: 'OLinuXino', model: 'A64', how: 'model.json' });
  assert.equal(placementFromMeta({}), null);
  assert.equal(cleanName('Itel_A70_Schematic_v1.2.pdf'), 'Itel A70');
});

test('one folder is a brand, a model or just a bin', () => {
  assert.deepEqual(placeFile('Redmi_Note_10_Pro.pcb', ['Downloads']), { brand: 'Xiaomi', series: 'Redmi Note', model: 'Redmi Note 10 Pro', how: 'name' });
  assert.deepEqual(placeFile('Camon_20_Pro.pcb', ['Tecno']), { brand: 'Tecno', series: 'Camon', model: 'Camon 20 Pro', how: 'folders' });
  assert.deepEqual(placeFile('board.pcb', ['Infinix Hot 30']), { brand: 'Infinix', series: 'Hot', model: 'Hot 30', how: 'name' });
  assert.equal(placeFile('mystery.brd', ['loose']).how, 'unknown');
});
