// Format detection and the Board model built on top of the raw parser output.
import { isBRD, parseBRD, isBRD2, parseBRD2 } from './brd.js';
import { isBDV, parseBDV, parseASC } from './bdv.js';
import { isBVR1, parseBVR1, isBVR3, parseBVR3 } from './bvr.js';
import { parseCST } from './cst.js';
import { parseFZ } from './fz.js';
import { isXZZ, parseXZZ } from './xzz.js';
import { isKiCad, parseKiCad } from './kicad.js';
import { parseODB } from './odb.js';
import { SIDE } from './util.js';

export { SIDE };

export const BOARD_EXTENSIONS = ['brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'asc', 'pcb', 'kicad_pcb', 'tgz', 'zip'];
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
 * @param {{fzKey?: string, xzzKey?: string, ascFiles?: Record<string, Uint8Array>}} opts
 */
export function parseRawBoard(bytes, fileName, opts = {}) {
  const ext = extOf(fileName);
  if (ext === 'fz') return parseFZ(bytes, opts.fzKey);
  if (ext === 'asc') return parseASC(opts.ascFiles || { [String(fileName).split(/[\\/]/).pop().toLowerCase()]: bytes });
  if (ext === 'cst') return parseCST(bytes);
  if (ext === 'kicad_pcb' || isKiCad(bytes)) return parseKiCad(bytes);
  if (ODB_EXTENSIONS.includes(ext)) return parseODB(bytes);
  if (isBRD(bytes)) return parseBRD(bytes);
  if (isBRD2(bytes)) return parseBRD2(bytes);
  if (isBDV(bytes)) return parseBDV(bytes);
  if (isBVR1(bytes)) return parseBVR1(bytes);
  if (isBVR3(bytes)) return parseBVR3(bytes);
  if (isXZZ(bytes)) return parseXZZ(bytes, opts.xzzKey);
  throw new Error('Unrecognised boardview format. Supported: ' + BOARD_EXTENSIONS.map((e) => '.' + e).join(', '));
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
    if (NO_NET.has(pin.net.toUpperCase())) continue;
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

  // Pin radius: half of the closest neighbour distance inside each part.
  const defaultR = size / 400;
  for (const part of parts) {
    const ps = part.pins.map((i) => pins[i]);
    let minD = Infinity;
    if (ps.length > 1 && ps.length < 400) {
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
          if (d > 0 && d < minD) minD = d;
        }
    } else if (ps.length >= 400) {
      // Big BGA: sample neighbours along sorted x
      const sorted = ps.slice().sort((a, b) => a.x - b.x || a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        const d = Math.hypot(sorted[i].x - sorted[i - 1].x, sorted[i].y - sorted[i - 1].y);
        if (d > 0 && d < minD) minD = d;
      }
    }
    const r = Number.isFinite(minD) ? Math.min(minD * 0.4, defaultR * 4) : defaultR;
    for (const p of ps) p.r = p.radius && p.radius > 0.5 && (raw.format === 'BVR3' || raw.format === 'KiCad') ? p.radius : r;
    if (ps.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ps) {
        x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r);
        x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r);
      }
      const pad = r * 0.6;
      part.bbox = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
    }
  }
  for (const p of pins) if (!p.r) p.r = defaultR;

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
