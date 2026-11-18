// Format detection and the Board model built on top of the raw parser output.
import { isBRD, parseBRD, isBRD2, parseBRD2 } from './brd.js';
import { isBDV, parseBDV, parseASC } from './bdv.js';
import { isBVR1, parseBVR1, isBVR3, parseBVR3 } from './bvr.js';
import { parseCST } from './cst.js';
import { parseFZ } from './fz.js';
import { isXZZ, parseXZZ } from './xzz.js';
import { isKiCad, parseKiCad } from './kicad.js';
import { parseODB } from './odb.js';
import { isGenCAD, parseGenCAD } from './gencad.js';
import { isAltiumAscii, parseAltiumAscii } from './altium.js';
import { isCADPanel, parseCADPanel } from './cadpanel.js';

/** Allegro .brd binaries: same check as OpenBoardView BRDAllegroFile. */
function isAllegro(bytes) {
  if (bytes.length < 0xfb) return false;
  const s = String.fromCharCode(bytes[0xf8], bytes[0xf9], bytes[0xfa]);
  return s === 'all' || s === 'vie';
}
import { SIDE } from './util.js';
import { computeGeometry, chainOutline, polyArea } from './geometry.js';

export { SIDE };

export const BOARD_EXTENSIONS = ['brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'cae', 'asc', 'pcb', 'cad', 'gcd', 'gencad', 'pcbdoc', 'kicad_pcb', 'tgz', 'zip'];
/** ODB++ jobs come as archives. */
export const ODB_EXTENSIONS = ['tgz', 'gz', 'tar', 'zip'];

export function extOf(name) {
  const m = /\.([^./\\]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Parse boardview bytes. Like OpenBoardView, encrypted formats are chosen by
 * extension and everything else by content.
 * @param {Uint8Array} bytes
 * @param {string} fileName
 * @param {{fzKey?: string, caeKey?: string, xzzKey?: string, ascFiles?: Record<string, Uint8Array>}} opts
 */
export function parseRawBoard(bytes, fileName, opts = {}) {
  const ext = extOf(fileName);
  if (ext === 'fz') return parseFZ(bytes, opts.fzKey);
  if (ext === 'cae') return parseFZ(bytes, opts.caeKey, { cae: true });
  if (ext === 'asc') return parseASC(opts.ascFiles || { [String(fileName).split(/[\\/]/).pop().toLowerCase()]: bytes });
  if (ext === 'cst') return parseCST(bytes);
  if (ext === 'kicad_pcb' || isKiCad(bytes)) return parseKiCad(bytes);
  if (ODB_EXTENSIONS.includes(ext)) return parseODB(bytes);
  if (isGenCAD(bytes)) return parseGenCAD(bytes);
  if (isAltiumAscii(bytes)) return parseAltiumAscii(bytes);
  if (isCADPanel(bytes)) return parseCADPanel(bytes);
  if (isBRD(bytes)) return parseBRD(bytes);
  if (isBRD2(bytes)) return parseBRD2(bytes);
  if (isBDV(bytes)) return parseBDV(bytes);
  if (isBVR1(bytes)) return parseBVR1(bytes);
  if (isBVR3(bytes)) return parseBVR3(bytes);
  if (isAllegro(bytes)) throw new Error('This is a Cadence Allegro board (.brd). Allegro files are a closed format: open it in the free Allegro Free Physical Viewer and export it, or ask for the boardview (.brd/.bvr/.fz) version.');
  if (isXZZ(bytes)) return parseXZZ(bytes, opts.xzzKey);
  throw new Error('Unrecognised boardview format. Supported: ' + BOARD_EXTENSIONS.map((e) => '.' + e).join(', '));
}

/** Formats whose pin radius is a real pad size. */
const REAL_PAD_FORMATS = new Set(['FZ', 'BVR3', 'KiCad', 'ODB++', 'GenCAD', 'Altium', 'CAD']);

/** Outline as closed polygons, biggest first. */
function outlinePolygons(outline, segs, size) {
  const polys = [];
  if (outline.length > 2) {
    // A polyline outline may jump between islands: split where it repeats its start.
    let cur = [];
    for (const p of outline) {
      cur.push(p);
      if (cur.length > 3 && Math.hypot(p.x - cur[0].x, p.y - cur[0].y) < size * 1e-4) { polys.push(cur); cur = []; }
    }
    if (cur.length > 2) polys.push(cur);
  }
  if (segs.length) for (const l of chainOutline(segs, size * 2e-4)) if (l.length > 2) polys.push(l);
  return polys.map((p) => ({ pts: p, area: polyArea(p) })).sort((a, b) => b.area - a.area).map((p) => p.pts);
}

export const NO_NET = new Set(['', 'UNCONNECTED', 'NC', 'N/C', 'NONE']);
const GROUND_RE = /^(GND|VSS|AGND|DGND|PGND|GND_.*|.*_GND|GROUND)$/i;
export const isGroundNet = (n) => GROUND_RE.test(n);

/** Build the indexed board model the viewer uses. */
export function buildBoard(raw) {
  const parts = raw.parts.map((p, i) => ({ ...p, index: i, pins: [], bbox: null }));
  const pins = raw.pins.map((p, i) => ({
    ...p,
    index: i,
    net: (p.net || '').trim(),
    side: p.side || (parts[p.part] ? parts[p.part].side : SIDE.BOTH),
  }));
  for (const pin of pins) {
    const part = parts[pin.part];
    if (part) part.pins.push(pin.index);
  }
  // Nets
  const nets = new Map();
  for (const pin of pins) {
    if (NO_NET.has(pin.net.toUpperCase()) || pin.net.startsWith('NC@')) continue;
    if (!nets.has(pin.net)) nets.set(pin.net, []);
    nets.get(pin.net).push(pin.index);
  }
  // Outline
  let outline = raw.outline.slice();
  const segs = raw.outlineSegments.slice();

  // Bounds
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const grow = (x, y) => { if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; };
  for (const p of outline) grow(p.x, p.y);
  for (const [a, b] of segs) { grow(a.x, a.y); grow(b.x, b.y); }
  for (const p of pins) grow(p.x, p.y);
  const traces = raw.traces || [];
  const vias = raw.vias || [];
  if (!raw.outline.length && !segs.length) for (const t of traces) { grow(t.x1, t.y1); grow(t.x2, t.y2); }
  if (!Number.isFinite(minx)) { minx = miny = 0; maxx = maxy = 100; }
  const size = Math.max(maxx - minx, maxy - miny, 1);

  const board = { parts, pins, bounds: { minx, miny, maxx, maxy }, realPads: REAL_PAD_FORMATS.has(raw.format) };
  computeGeometry(board);

  return {
    format: raw.format,
    parts,
    pins,
    nets,
    outline,
    outlineSegments: segs,
    /** Real copper from a layout file (KiCad) or an added Gerber layer; empty for boardviews. */
    traces,
    vias,
    bounds: { minx, miny, maxx, maxy },
    smallPad: board.smallPad,
    /** 'file' = pad sizes/outlines from the file, 'pins' = shapes worked out from pin positions. */
    geometry: board.geometry,
    /** Board outline chained into polygons (for drawing the board itself). */
    outlinePolys: outlinePolygons(outline, segs, size),
    stats: { parts: parts.filter((p) => !p.testpoint && !p.name.startsWith('...')).length, pins: pins.length, nets: nets.size },
  };
}

export function loadBoard(bytes, fileName, opts) {
  return buildBoard(parseRawBoard(bytes, fileName, opts));
}

/** Search parts and nets. Returns ranked matches. */
export function searchBoard(board, query, limit = 50) {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const res = [];
  const score = (name) => {
    const n = name.toUpperCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return -1;
  };
  for (const part of board.parts) {
    if (part.testpoint || part.name.startsWith('...')) continue;
    const s = score(part.name);
    if (s >= 0) res.push({ kind: 'part', name: part.name, index: part.index, score: s, detail: part.mfgcode || `${part.pins.length} pins` });
  }
  for (const [net, list] of board.nets) {
    const s = score(net);
    if (s >= 0) res.push({ kind: 'net', name: net, score: s + 0.5, detail: `${list.length} pins` });
  }
  res.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return res.slice(0, limit);
}
