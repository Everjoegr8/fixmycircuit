// Shared helpers for boardview parsers.
//
// The parsers in this folder are JavaScript ports of the file format readers from
// OpenBoardView (https://github.com/OpenBoardView/OpenBoardView), which is
// MIT licensed: Copyright (c) 2016 Chloridite and OpenBoardView contributors.
// See THIRD_PARTY_LICENSES.md at the repository root.

/** Decode bytes as latin1 so every byte maps to exactly one char (binary safe). */
export function bytesToLatin1(bytes) {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Re-decode a latin1 string as UTF-8 when it is valid UTF-8, otherwise keep it. */
export function fixText(s) {
  if (!/[\x80-\xff]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

/** Split text into lines on CRLF, LF or CR. */
export function splitLines(text) {
  return text.split(/\r\n|\n|\r/);
}

export function findStr(bytes, str) {
  const n = str.length;
  if (n === 0) return 0;
  const first = str.charCodeAt(0);
  outer: for (let i = 0; i <= bytes.length - n; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < n; j++) if (bytes[i + j] !== str.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

/**
 * A cursor over one line that mimics the C strtol/strtod/token reads used by
 * OpenBoardView (READ_INT, READ_DOUBLE, READ_STR).
 */
export class LineCursor {
  constructor(line, pos = 0) {
    this.s = line;
    this.p = pos;
  }
  skipWs() {
    while (this.p < this.s.length && /\s/.test(this.s[this.p])) this.p++;
  }
  readInt() {
    const m = /^\s*([+-]?\d+)/.exec(this.s.slice(this.p));
    if (!m) return 0;
    this.p += m[0].length;
    return parseInt(m[1], 10);
  }
  readDouble() {
    const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(this.s.slice(this.p));
    if (!m) return 0;
    this.p += m[0].length;
    return parseFloat(m[1]);
  }
  readStr() {
    this.skipWs();
    const start = this.p;
    while (this.p < this.s.length && !/\s/.test(this.s[this.p])) this.p++;
    const tok = this.s.slice(start, this.p);
    this.p++; // the C macro steps past the terminator
    return fixText(tok);
  }
  /** ASC variant: reads until two consecutive whitespace chars (names may contain one space). */
  readStr2() {
    this.skipWs();
    const start = this.p;
    while (
      this.p + 1 < this.s.length &&
      (!/\s/.test(this.s[this.p]) || !/\s/.test(this.s[this.p + 1]))
    )
      this.p++;
    if (this.p + 1 >= this.s.length) this.p = this.s.length;
    const tok = this.s.slice(start, this.p);
    this.p++;
    return fixText(tok.trim());
  }
  startsWith(str) {
    return this.s.startsWith(str, this.p);
  }
}

export const SIDE = { TOP: 'top', BOTTOM: 'bottom', BOTH: 'both' };

/**
 * Create an empty raw board, the common shape every parser returns.
 * Coordinates are in the file's own units (usually mils); the viewer scales to fit.
 */
export function emptyBoard(format) {
  return {
    format,
    outline: [], // polyline points [{x,y}]
    outlineSegments: [], // [[{x,y},{x,y}]]
    parts: [], // {name, side, type: 'smd'|'th', mfgcode}
    pins: [], // {x, y, net, part (0-based index into parts or -1), side, name, snum, probe, radius}
    nails: [], // {x, y, net, side, probe}
  };
}

/** Port of BRDFileBase::AddNailsAsPins: test points become pins on dummy parts. */
export function addNailsAsPins(board) {
  if (!board.nails.length) return;
  const top = board.parts.length;
  board.parts.push({ name: '...TP', side: SIDE.TOP, type: 'smd', testpoint: true });
  const bottom = board.parts.length;
  board.parts.push({ name: '...TP', side: SIDE.BOTTOM, type: 'smd', testpoint: true });
  for (const n of board.nails) {
    const side = n.side === SIDE.BOTTOM ? SIDE.BOTTOM : n.side === SIDE.BOTH ? SIDE.BOTH : SIDE.TOP;
    board.pins.push({
      x: n.x,
      y: n.y,
      net: n.net,
      part: side === SIDE.BOTTOM ? bottom : top,
      side,
      probe: n.probe,
      name: n.probe != null ? `TP${n.probe}` : 'TP',
      snum: n.probe != null ? String(n.probe) : '',
      testpoint: true,
    });
  }
}

/** Fake rectangular outline from the outermost pins (CST/FZ do this in OBV). */
export function genOutline(board, margin = 20) {
  if (!board.pins.length) return;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of board.pins) {
    if (p.x < minx) minx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.x > maxx) maxx = p.x;
    if (p.y > maxy) maxy = p.y;
  }
  minx -= margin; miny -= margin; maxx += margin; maxy += margin;
  board.outline = [
    { x: minx, y: miny }, { x: maxx, y: miny }, { x: maxx, y: maxy }, { x: minx, y: maxy }, { x: minx, y: miny },
  ];
}

export function u32le(bytes, pos) {
  if (pos < 0 || pos + 4 > bytes.length) throw new Error('Unexpected end of file');
  return (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
}

export function i16le(bytes, pos) {
  if (pos + 2 > bytes.length) throw new Error('Unexpected end of file');
  const v = bytes[pos] | (bytes[pos + 1] << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}
