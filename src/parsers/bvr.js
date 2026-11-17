// BVR (BVRAW_FORMAT_1) and BVR3 (BVRAW_FORMAT_3) readers, used by many .bv/.bvr
// files. Ported from OpenBoardView BVRFile.cpp and BVR3File.cpp (MIT).
import { bytesToLatin1, splitLines, LineCursor, emptyBoard, addNailsAsPins, findStr, SIDE } from './util.js';

export const isBVR1 = (bytes) => findStr(bytes, 'BVRAW_FORMAT_1') >= 0;
export const isBVR3 = (bytes) => findStr(bytes, 'BVRAW_FORMAT_3') >= 0;

export function parseBVR1(bytes) {
  const board = emptyBoard('BVR');
  const lines = splitLines(bytesToLatin1(bytes));
  let block = 0;
  let prevPart = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line === '<<Layout>>') { block = 1; i += 1; continue; }
    if (line === '<<Pin>>') { block = 2; i += 1; continue; }
    if (line === '<<Nail>>') { block = 3; i += 1; continue; }
    const c = new LineCursor(line);
    if (block === 1) {
      const x = Math.trunc(c.readDouble() * 1000);
      if (c.s[c.p] === ',') c.p++;
      const y = Math.trunc(c.readDouble() * 1000);
      board.outline.push({ x, y });
    } else if (block === 2) {
      const name = c.readStr();
      const side = c.readStr() === '(T)' ? SIDE.TOP : SIDE.BOTTOM;
      if (name !== prevPart) {
        board.parts.push({ name, side, type: 'smd' });
        prevPart = name;
      }
      c.readInt();
      const pinName = c.readStr();
      const x = Math.trunc(c.readDouble() * 1000);
      const y = Math.trunc(c.readDouble() * 1000);
      c.readInt();
      const net = c.readStr();
      board.pins.push({ x, y, net, part: board.parts.length - 1, side, name: pinName, snum: pinName });
    } else if (block === 3) {
      // Skip first tab separated field.
      const tab = line.indexOf('\t');
      c.p = tab >= 0 ? tab + 1 : line.length;
      const x = Math.trunc(c.readDouble() * 1000);
      const y = Math.trunc(c.readDouble() * 1000);
      c.readInt();
      c.readStr();
      const side = c.readStr() === '(T)' ? SIDE.TOP : SIDE.BOTTOM;
      c.readStr();
      const net = c.readStr();
      board.nails.push({ x, y, side, net });
    }
  }
  if (block === 0) throw new Error('Not a BVR file');
  addNailsAsPins(board);
  return board;
}

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const eq = (a, b) => a.x === b.x && a.y === b.y;

/** Chain unordered outline segments into a polyline (same strategy as OBV BVR3). */
export function chainSegments(segments) {
  const segs = segments.slice();
  const out = [];
  if (!segs.length) return out;
  const first = segs.shift();
  out.push(first[0], first[1]);
  const start = first[0];
  let end = first[1];
  while (!eq(start, end) && segs.length) {
    const idx = segs.findIndex((s) => eq(end, s[0]) || eq(end, s[1]));
    if (idx >= 0) {
      const [s] = segs.splice(idx, 1);
      end = eq(end, s[0]) ? s[1] : s[0];
      out.push(end);
      continue;
    }
    let best = 0;
    let bestD = Infinity;
    segs.forEach((s, i) => {
      const d = Math.min(manhattan(end, s[0]), manhattan(end, s[1]));
      if (d < bestD) { bestD = d; best = i; }
    });
    const s = segs[best];
    const ds = manhattan(end, start);
    const d0 = manhattan(end, s[0]);
    const d1 = manhattan(end, s[1]);
    if (ds <= d0 && ds <= d1) { out.push(start); break; }
    segs.splice(best, 1);
    if (d0 <= d1) { out.push(s[0], s[1]); end = s[1]; } else { out.push(s[1], s[0]); end = s[0]; }
  }
  return out;
}

export function parseBVR3(bytes) {
  const board = emptyBoard('BVR3');
  const sideOf = (s) => (s === 'T' ? SIDE.TOP : s === 'B' ? SIDE.BOTTOM : SIDE.BOTH);
  let part = { pos: { x: 0, y: 0 } };
  let pin = {};
  for (const raw of splitLines(bytesToLatin1(bytes))) {
    const line = raw.trim();
    if (!line) continue;
    const kw = line.split(/\s+/, 1)[0];
    const c = new LineCursor(line, kw.length);
    switch (kw) {
      case 'PART_NAME': part.name = c.readStr(); break;
      case 'PART_SIDE': part.side = sideOf(c.readStr()); break;
      case 'PART_ORIGIN': part.pos = { x: Math.trunc(c.readDouble()), y: Math.trunc(c.readDouble()) }; break;
      case 'PART_MOUNT': part.type = c.readStr() === 'SMD' ? 'smd' : 'th'; break;
      case 'PIN_NUMBER': pin.snum = c.readStr(); break;
      case 'PIN_NAME': pin.name = c.readStr(); break;
      case 'PIN_SIDE': pin.side = sideOf(c.readStr()); break;
      case 'PIN_ORIGIN':
        pin.x = Math.trunc(c.readDouble()) + part.pos.x;
        pin.y = Math.trunc(c.readDouble()) + part.pos.y;
        break;
      case 'PIN_RADIUS': pin.radius = c.readDouble(); break;
      case 'PIN_NET': pin.net = c.readStr(); break;
      case 'PIN_END':
        board.pins.push({ x: 0, y: 0, net: 'UNCONNECTED', side: part.side || SIDE.TOP, ...pin, part: board.parts.length });
        pin = {};
        break;
      case 'PART_END':
        board.parts.push({ name: part.name || '?', side: part.side || SIDE.TOP, type: part.type || 'smd' });
        part = { pos: { x: 0, y: 0 } };
        break;
      case 'OUTLINE_POINTS': {
        const nums = line.slice(kw.length).trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
        for (let i = 0; i + 1 < nums.length; i += 2) board.outline.push({ x: Math.trunc(nums[i]), y: Math.trunc(nums[i + 1]) });
        break;
      }
      case 'OUTLINE_SEGMENTED': {
        const nums = line.slice(kw.length).trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
        const segs = [];
        for (let i = 0; i + 3 < nums.length; i += 4)
          segs.push([{ x: Math.trunc(nums[i]), y: Math.trunc(nums[i + 1]) }, { x: Math.trunc(nums[i + 2]), y: Math.trunc(nums[i + 3]) }]);
        board.outline.push(...chainSegments(segs));
        break;
      }
    }
  }
  if (!board.parts.length && !board.outline.length) throw new Error('Not a BVR3 file');
  return board;
}
