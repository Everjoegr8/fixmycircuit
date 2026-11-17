import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard } from '../src/parsers/index.js';
import { indexBoard, findPath } from '../src/shared/netindex.ts';
import * as W from './fixtures/demoBoard.js';

// A synthetic board the size of a modern phone logic board (~4,000 parts, ~25,000 pins).
function bigBoard() {
  const parts = [], pins = [];
  const nets = Array.from({ length: 3000 }, (_, i) => (i % 9 === 0 ? 'GND' : `NET_${i}`));
  let k = 0;
  const add = (name, n, x0, y0) => {
    const part = parts.length;
    parts.push({ name, side: part % 3 ? 'top' : 'bottom' });
    for (let i = 0; i < n; i++) pins.push({ part, snum: String(i + 1), x: x0 + (i % 20) * 8, y: y0 + Math.floor(i / 20) * 8, net: nets[(k++ * 7) % nets.length], side: parts[part].side });
  };
  for (let i = 0; i < 12; i++) add(`U${i + 1}`, 400, (i % 4) * 600, Math.floor(i / 4) * 600);
  for (let i = 0; i < 4000; i++) add(`${'RCL'[i % 3]}${i + 1}`, 2, 3000 + (i % 80) * 30, (i / 80 | 0) * 30);
  for (let i = 0; i < 300; i++) add(`J${i + 1}`, 40, 6000 + (i % 10) * 200, (i / 10 | 0) * 200);
  return { parts, pins, outline: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 7000 }, { x: 0, y: 7000 }], nails: [] };
}

test('large board opens and indexes quickly', () => {
  const b = bigBoard();
  const bytes = W.writeBRD(b);
  let t = performance.now();
  const board = loadBoard(bytes, 'big.brd', {});
  const parseMs = performance.now() - t;
  t = performance.now();
  const idx = indexBoard(board);
  const indexMs = performance.now() - t;
  t = performance.now();
  findPath(idx, 'NET_1', 'NET_500');
  const pathMs = performance.now() - t;
  console.log(`big board: ${board.parts.length} parts, ${board.pins.length} pins, ${board.nets.size} nets (${(bytes.length / 1e6).toFixed(1)} MB). parse ${parseMs.toFixed(0)} ms, index ${indexMs.toFixed(0)} ms, path ${pathMs.toFixed(1)} ms`);
  assert.ok(board.pins.length > 20000);
  assert.ok(parseMs + indexMs < 4000, 'parse + index under 4 s even on a slow CI machine');
});
