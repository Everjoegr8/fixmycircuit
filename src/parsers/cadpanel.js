// "###Panel Added" CAD text export (.cad) with COMP / C_PIN / NET / N_VIA lines.
// Port of OpenBoardView CADFile.cpp (MIT). Coordinates are in inches.
import { bytesToLatin1, fixText, splitLines, emptyBoard, addNailsAsPins, genOutline, LineCursor, SIDE } from './util.js';

export function isCADPanel(bytes) {
  const s = bytesToLatin1(bytes.subarray(0, Math.min(bytes.length, 1 << 20)));
  return s.includes('###Panel Added') && s.includes('C_PIN');
}

export function parseCADPanel(bytes) {
  const lines = splitLines(fixText(bytesToLatin1(bytes)));
  const board = emptyBoard('CAD');
  const k = 1000;
  const ids = new Map();
  let nailNet = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const c = new LineCursor(line);
    if (line.startsWith('COMP')) {
      c.readStr();
      const name = c.readStr();
      for (let i = 0; i < 5; i++) c.readStr();
      const loc = c.readStr();
      ids.set(name, board.parts.length);
      board.parts.push({ name, side: loc === '1' ? SIDE.TOP : SIDE.BOTTOM, type: 'smd' });
    } else if (line.startsWith('C_PIN')) {
      c.readStr();
      const ref = c.readStr();
      const partName = ref.split('-')[0];
      const pin = ref.includes('-') ? ref.slice(ref.indexOf('-') + 1) : '';
      const part = ids.get(partName);
      if (part == null) continue;
      const x = c.readDouble() * k, y = c.readDouble() * k;
      c.readDouble(); c.readDouble(); c.readDouble(); c.readStr();
      let net = c.readStr();
      if (net.includes('/')) net = net.slice(1);
      board.pins.push({ x, y, net, part, side: board.parts[part].side, snum: pin, name: pin });
    } else if (line.startsWith('NET ')) {
      c.readStr();
      let net = c.readStr();
      if (net.includes('/')) net = net.slice(1);
      nailNet = net;
    } else if (line.startsWith('N_VIA')) {
      c.readStr();
      const x = c.readDouble() * k, y = c.readDouble() * k;
      c.readStr();
      const side = c.readDouble() === 1 ? SIDE.TOP : SIDE.BOTTOM;
      board.nails.push({ x, y, net: nailNet, side, probe: board.nails.length + 1 });
    }
  }
  if (!board.parts.length) throw new Error('CAD file has no components');
  addNailsAsPins(board);
  genOutline(board);
  return board;
}
