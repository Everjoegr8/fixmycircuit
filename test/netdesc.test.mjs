import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netHint, voltsFromName } from '../src/shared/netdesc.ts';

test('volts are read from common rail names', () => {
  assert.equal(voltsFromName('PP1V8_IO'), 1.8);
  assert.equal(voltsFromName('PP3V3_SVDD'), 3.3);
  assert.equal(voltsFromName('VREG_L5_2P95'), 2.95);
  assert.equal(voltsFromName('PP0V6_VDDQL_S1'), 0.6);
  assert.equal(voltsFromName('VBUS'), 5);
  assert.equal(voltsFromName('I2C0_SCL'), null);
});

test('nets get a plain meaning', () => {
  assert.equal(netHint('VBUS').what, 'USB charger input');
  assert.equal(netHint('PP_GPU').what, 'GPU supply');
  assert.equal(netHint('PP_CPU_SRAM').what, 'CPU cache (SRAM) supply');
  assert.equal(netHint('PP_VDD_MAIN').what, 'Main system rail (from battery)');
  assert.equal(netHint('I2C1_SDA').what, 'I2C data line');
  assert.equal(netHint('VREG_LDO5').what, 'LDO 5 output');
  assert.equal(netHint('PP1V1_S2').what, 'Buck (SMPS) 2 output');
  assert.equal(netHint('PP1V8').what, '1.8 V rail');
  assert.equal(netHint('XYZ').what, '');
});
