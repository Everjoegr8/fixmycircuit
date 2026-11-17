// CST (CastWBoard) binary reader. Ported from OpenBoardView CSTFile.cpp (MIT).
import { bytesToLatin1, emptyBoard, genOutline, i16le, findStr, SIDE } from './util.js';

export function parseCST(bytes) {
  const board = emptyBoard('CST');
  let p = 0;
  const short = () => { const v = i16le(bytes, p); p += 2; return v; };
  const byte = () => { if (p >= bytes.length) throw new Error('Unexpected end of file'); const v = bytes[p++]; return v >= 128 ? v - 256 : v; };
  const str = (n) => { if (n < 0 || p + n > bytes.length) throw new Error('Corrupt CST file'); const s = bytesToLatin1(bytes.subarray(p, p + n)); p += n; return s; };

  const numParts = short();
  p += 4;
  const sectionNameLen = short();
  str(sectionNameLen);
  for (let i = 0; i < numParts; i++) {
    const len = byte();
    const name = str(len);
    p += 4;
    const layer = byte();
    board.parts.push({ name, side: layer === 0x0c ? SIDE.TOP : layer === 0x01 ? SIDE.BOTTOM : SIDE.BOTH, type: 'smd' });
    p += 6;
  }
  p -= 2;
  const numNets = short();
  const nets = [];
  for (let i = 0; i < numNets; i++) nets.push(str(byte()));

  const dummy = board.parts.length;
  board.parts.push({ name: '...', side: SIDE.BOTH, type: 'th' });

  const cpad = findStr(bytes.subarray(p), 'CPad');
  if (cpad < 0) throw new Error('CST file has no CPad section');
  p += cpad - 8;
  const numPins = short();
  p += 10;
  const counters = new Map();
  for (let i = 0; i < numPins; i++) {
    const partId = short();
    const part = partId >= 0 ? partId : dummy;
    const probe = short();
    const netId = short();
    const x = short();
    const y = short();
    short(); // shape
    p += 4;
    const k = (counters.get(part) || 0) + 1;
    counters.set(part, k);
    board.pins.push({ x, y, probe, net: nets[netId] ?? '', part, side: board.parts[part]?.side ?? SIDE.BOTH, snum: String(k) });
  }
  genOutline(board);
  return board;
}
