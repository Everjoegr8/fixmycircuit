// BRD (Test_Link) and BRD2 (BRDOUT) readers. Ported from OpenBoardView BRDFile.cpp
// and BRD2File.cpp (MIT, see THIRD_PARTY_LICENSES.md).
import { bytesToLatin1, splitLines, LineCursor, emptyBoard, addNailsAsPins, findStr, SIDE } from './util.js';

const ENCODED_HEADER = [0x23, 0xe2, 0x63, 0x28];

export function isBRD(bytes) {
  if (ENCODED_HEADER.every((b, i) => bytes[i] === b)) return true;
  return findStr(bytes, 'str_length:') >= 0 && findStr(bytes, 'var_data:') >= 0;
}

export function decodeBRD(bytes) {
  const out = new Uint8Array(bytes);
  if (!ENCODED_HEADER.every((b, i) => out[i] === b)) return out;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c === 13 || c === 10 || c === 0) continue;
    out[i] = ~(((c >> 6) & 3) | (c << 2)) & 0xff;
  }
  return out;
}

export function parseBRD(bytes) {
  const board = emptyBoard('BRD');
  const text = bytesToLatin1(decodeBRD(bytes));
  let block = 0;
  let nParts = Infinity, nPins = Infinity;
  for (let raw of splitLines(text)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'str_length:') { block = 1; continue; }
    if (line === 'var_data:') { block = 2; continue; }
    if (line === 'Format:' || line === 'format:') { block = 3; continue; }
    if (line === 'Parts:' || line === 'Pins1:') { block = 4; continue; }
    if (line === 'Pins:' || line === 'Pins2:') { block = 5; continue; }
    if (line === 'Nails:') { block = 6; continue; }
    const c = new LineCursor(line);
    switch (block) {
      case 2: {
        c.readInt();
        nParts = c.readInt();
        nPins = c.readInt();
        c.readInt();
        break;
      }
      case 3:
        board.outline.push({ x: c.readInt(), y: c.readInt() });
        break;
      case 4: {
        const name = c.readStr();
        const tmp = c.readInt();
        let side = SIDE.BOTH;
        if (tmp === 1 || (tmp >= 4 && tmp < 8)) side = SIDE.TOP;
        if (tmp === 2 || tmp >= 8) side = SIDE.BOTTOM;
        const endOfPins = c.readInt();
        if (board.parts.length < nParts) board.parts.push({ name, side, type: tmp & 0xc ? 'smd' : 'th', endOfPins });
        break;
      }
      case 5: {
        if (board.pins.length >= nPins) break;
        const x = c.readInt();
        const y = c.readInt();
        const probe = c.readInt();
        const part = c.readInt();
        const net = c.readStr();
        board.pins.push({ x, y, probe, part: part - 1, net });
        break;
      }
      case 6: {
        const probe = c.readInt();
        const x = c.readInt();
        const y = c.readInt();
        const side = c.readInt() === 1 ? SIDE.TOP : SIDE.BOTTOM;
        const net = c.readStr();
        board.nails.push({ probe, x, y, side, net });
        break;
      }
    }
  }
  if (block === 0) throw new Error('Not a BRD file');

  // Lenovo variant: net missing on pin, take it from the nail with the same probe.
  const nailNets = new Map(board.nails.map((n) => [n.probe, n.net]));
  let prevEnd = 0;
  board.parts.forEach((part, i) => {
    // Pin numbers within a part follow file order.
    let k = 1;
    for (let j = prevEnd; j < Math.min(part.endOfPins, board.pins.length); j++) {
      if (board.pins[j].part === i) board.pins[j].snum = String(k++);
    }
    prevEnd = part.endOfPins;
  });
  for (const pin of board.pins) {
    if (!pin.net) pin.net = nailNets.get(pin.probe) || '';
    const part = board.parts[pin.part];
    pin.side = part ? part.side : SIDE.BOTH;
  }
  addNailsAsPins(board);
  return board;
}

export function isBRD2(bytes) {
  return findStr(bytes, 'BRDOUT:') >= 0 && findStr(bytes, 'NETS:') >= 0;
}

export function parseBRD2(bytes) {
  const board = emptyBoard('BRD2');
  const nets = new Map();
  const max = { x: 0, y: 0 };
  let block = 0;
  const partStarts = [];
  for (const raw of splitLines(bytesToLatin1(bytes))) {
    const line = raw.trim();
    if (!line) continue;
    const c = new LineCursor(line);
    if (line.startsWith('BRDOUT:')) {
      block = 1; c.p = 7; c.readInt(); max.x = c.readInt(); max.y = c.readInt(); continue;
    }
    if (line.startsWith('NETS:')) { block = 2; continue; }
    if (line.startsWith('PARTS:')) { block = 3; continue; }
    if (line.startsWith('PINS:')) { block = 4; continue; }
    if (line.startsWith('NAILS:')) { block = 5; continue; }
    switch (block) {
      case 1: board.outline.push({ x: c.readInt(), y: c.readInt() }); break;
      case 2: { const id = c.readInt(); nets.set(id, c.readStr()); break; }
      case 3: {
        const name = c.readStr();
        c.readInt(); c.readInt(); c.readInt(); c.readInt(); // p1, p2 (unused)
        const start = c.readInt();
        const s = c.readInt();
        board.parts.push({ name, side: s === 1 ? SIDE.TOP : s === 2 ? SIDE.BOTTOM : SIDE.BOTH, type: 'smd' });
        partStarts.push(start);
        break;
      }
      case 4: {
        const x = c.readInt();
        const y = c.readInt();
        const netid = c.readInt();
        const s = c.readInt();
        board.pins.push({ x, y, net: nets.get(netid) ?? '', side: s === 1 ? SIDE.TOP : s === 2 ? SIDE.BOTTOM : SIDE.BOTH, probe: 1, part: -1 });
        break;
      }
      case 5: {
        const probe = c.readInt();
        const x = c.readInt();
        let y = c.readInt();
        const net = nets.get(c.readInt()) ?? 'UNCONNECTED';
        const top = c.readInt() === 1;
        if (!top) y = max.y - y;
        board.nails.push({ probe, x, y, net, side: top ? SIDE.TOP : SIDE.BOTTOM });
        break;
      }
    }
  }
  if (block === 0) throw new Error('Not a BRD2 file');
  // Assign pins to parts: each part's number is the index of its first pin (1-based in file).
  let cpi = 0;
  board.parts.forEach((part, i) => {
    const pei = i === board.parts.length - 1 ? board.pins.length : partStarts[i + 1]; // OBV semantics
    let isDIP = true;
    let k = 1;
    while (cpi < pei && cpi < board.pins.length) {
      const pin = board.pins[cpi];
      pin.part = i;
      pin.snum = String(k++);
      if (pin.side !== SIDE.TOP) pin.y = max.y - pin.y;
      if ((pin.side === SIDE.TOP && part.side === SIDE.TOP) || (pin.side === SIDE.BOTTOM && part.side === SIDE.BOTTOM)) isDIP = false;
      cpi++;
    }
    if (isDIP) { part.type = 'th'; part.side = SIDE.BOTH; }
  });
  addNailsAsPins(board);
  return board;
}
