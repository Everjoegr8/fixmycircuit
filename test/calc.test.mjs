// Bench calculator tests. Node 22 strips the TypeScript types.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeResistor, decodeCapacitor, divider, dividerR2, ohmsLaw, parallel, formatSI, parseSI } from '../src/shared/calc.ts';
import { layerOfNet } from '../src/shared/layers.ts';

test('SMD resistor codes', () => {
  assert.equal(decodeResistor('472').ohms, 4700);
  assert.equal(decodeResistor('103').ohms, 10000);
  assert.equal(decodeResistor('4702').ohms, 47000);
  assert.equal(decodeResistor('4R7').ohms, 4.7);
  assert.equal(decodeResistor('R047').ohms, 0.047);
  assert.equal(decodeResistor('01C').ohms, 10000);
  assert.equal(decodeResistor('68X').ohms, 49.9);
  assert.equal(decodeResistor('000').ohms, 0);
  assert.equal(decodeResistor('ZZZ'), null);
});

test('capacitor codes', () => {
  assert.ok(Math.abs(decodeCapacitor('104').farads - 100e-9) < 1e-15);
  assert.ok(Math.abs(decodeCapacitor('4p7').farads - 4.7e-12) < 1e-18);
  assert.equal(formatSI(decodeCapacitor('105').farads, 'F'), '1 µF');
});

test('divider, Ohm and parallel', () => {
  assert.equal(divider(5, 10000, 10000), 2.5);
  assert.ok(Math.abs(dividerR2(3.3, 1.8, 10000) - 12000) < 1e-6);
  assert.deepEqual(ohmsLaw({ V: 5, R: 10 }), { V: 5, I: 0.5, R: 10, P: 2.5 });
  assert.equal(parallel([10, 10]), 5);
  assert.equal(parseSI('4.7k'), 4700);
  assert.equal(formatSI(4700, 'Ω'), '4.7 kΩ');
});

test('net layers', () => {
  assert.equal(layerOfNet('VBUS_IN'), 'charging');
  assert.equal(layerOfNet('BL_LED_A'), 'display');
  assert.equal(layerOfNet('I2C1_SCL'), 'touch');
  assert.equal(layerOfNet('SPK_P'), 'audio');
  assert.equal(layerOfNet('RF_ANT_MAIN'), 'rf');
  assert.equal(layerOfNet('GND'), 'gnd');
  assert.equal(layerOfNet('XTAL_32K'), null);
});
