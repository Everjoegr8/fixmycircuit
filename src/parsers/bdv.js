// BDV (HONHAN) and ASC readers. Ported from OpenBoardView BDVFile.cpp and
// ASCFile.cpp (MIT, see THIRD_PARTY_LICENSES.md).
import { bytesToLatin1, splitLines, LineCursor, emptyBoard, addNailsAsPins, findStr, SIDE } from './util.js';

export function isBDV(bytes) {
  return findStr(bytes, 'dd:1.3?,r?-=bb') >= 0 || (findStr(bytes, '<<format.asc>>') >= 0 && findStr(bytes, '<<pins.asc>>') >= 0);
}

export function decodeBDV(bytes) {
  const buf = new Uint8Array(bytes);
  let count = 0xa0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) count++;
    const x = buf[i];
    if (!(x === 13 || x === 10 || x === 0)) {
      const sx = x >= 128 ? x - 256 : x; // C char is signed
      buf[i] = (count - sx) & 0xff;
    }
    if (count > 285) count = 159;
  }
  return buf;
}

/** Encode plaintext as BDV (inverse of decodeBDV). Used for tests and sample files. */
export function encodeBDV(bytes) {
  const buf = new Uint8Array(bytes);
  let count = 0xa0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) count++;
    const x = buf[i];
    if (!(x === 13 || x === 10 || x === 0)) buf[i] = (count - x) & 0xff;
    if (count > 285) count = 159;
  }
  return buf;
}

function parsePart(c, board) {
  c.p += 4; // "Part"
  const name = c.readStr();
  const loc = c.readStr();
  board.parts.push({ name, side: loc === '(T)' ? SIDE.TOP : SIDE.BOTTOM, type: 'smd' });
}

function parsePin(c, board, nameReader) {
  const part = board.parts.length - 1;
  if (part < 0) return;
  c.readInt(); // id
  const name = nameReader(c);
  const x = c.readDouble() * 1000;
  const y = c.readDouble() * 1000;
  c.readInt(); // layer
  const net = c.readStr();
  const probe = c.readInt();
  board.pins.push({ x, y, net, probe, part, side: board.parts[part].side, name, snum: name });
}

function parseNail(c, board) {
  c.p++; // skip first char
  const probe = c.readInt();
  const x = c.readDouble() * 1000;
  const y = c.readDouble() * 1000;
  c.readInt(); // type
  c.readStr(); // grid
  const loc = c.readStr();
  c.readStr(); // net id
  const net = c.readStr();
  board.nails.push({ probe, x, y, side: loc === '(T)' ? SIDE.TOP : SIDE.BOTTOM, net });
}

export function parseBDV(bytes) {
  const board = emptyBoard('BDV');
  const lines = splitLines(bytesToLatin1(decodeBDV(bytes)));
  let block = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line === '<<format.asc>>') { block = 1; i += 8; continue; }
    if (line === '<<pins.asc>>') { block = 2; i += 8; continue; }
    if (line === '<<nails.asc>>') { block = 3; i += 7; continue; }
    const c = new LineCursor(line);
    if (block === 1) board.outline.push({ x: c.readDouble() * 1000, y: c.readDouble() * 1000 });
    else if (block === 2) {
      if (line.startsWith('Part')) parsePart(c, board);
      else parsePin(c, board, (cc) => cc.readStr());
    } else if (block === 3) parseNail(c, board);
  }
  if (block === 0) throw new Error('Not a BDV file');
  addNailsAsPins(board);
  return board;
}

/**
 * ASC boards are three sibling files: format.asc, pins.asc and nails.asc.
 * `files` maps a lowercase file name to its bytes.
 */
export function parseASC(files) {
  const board = emptyBoard('ASC');
  const read = (name, fn, skip) => {
    const bytes = files[name];
    if (!bytes) return false;
    const lines = splitLines(bytesToLatin1(bytes));
    let first = true;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (first) { first = false; i += skip; continue; }
      fn(new LineCursor(line), line);
    }
    return true;
  };
  const okF = read('format.asc', (c) => board.outline.push({ x: c.readDouble() * 1000, y: c.readDouble() * 1000 }), 7);
  const okP = read('pins.asc', (c, line) => {
    if (line.startsWith('Part')) parsePart(c, board);
    else parsePin(c, board, (cc) => cc.readStr2());
  }, 7);
  read('nails.asc', (c) => parseNail(c, board), 6);
  if (!okF && !okP) throw new Error('ASC boards need format.asc and pins.asc from the same folder');
  addNailsAsPins(board);
  return board;
}
