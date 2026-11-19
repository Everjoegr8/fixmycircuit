// KiCad PCB layout (.kicad_pcb, KiCad 5 to 9). Unlike boardview files, a layout
// holds the real copper: track segments, arcs and vias with their nets. Units
// are millimetres with Y pointing down; we convert to mils with Y up so the
// board reads the same way as the other formats.
import { bytesToLatin1, fixText, SIDE } from './util.js';

const MM = 1 / 0.0254; // mm -> mils

export function isKiCad(bytes) {
  const head = bytesToLatin1(bytes.subarray(0, 64)).trimStart();
  return head.startsWith('(kicad_pcb');
}

/** Parse an S-expression into nested arrays of strings. */
export function parseSexpr(text) {
  const root = [];
  const stack = [root];
  let cur = root;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 40) { const a = []; cur.push(a); stack.push(a); cur = a; i++; } // (
    else if (c === 41) { stack.pop(); cur = stack[stack.length - 1] || root; i++; } // )
    else if (c <= 32) i++;
    else if (c === 34) { // "
      let j = i + 1, s = '';
      while (j < n && text.charCodeAt(j) !== 34) {
        if (text.charCodeAt(j) === 92 && j + 1 < n) { s += text[j + 1]; j += 2; } else { s += text[j]; j++; }
      }
      cur.push(s);
      i = j + 1;
    } else {
      let j = i;
      while (j < n) { const d = text.charCodeAt(j); if (d <= 32 || d === 40 || d === 41) break; j++; }
      cur.push(text.slice(i, j));
      i = j;
    }
  }
  return root[0] || [];
}

const kids = (node, name) => node.filter((x) => Array.isArray(x) && x[0] === name);
const kid = (node, name) => node.find((x) => Array.isArray(x) && x[0] === name);
const num = (v) => (v == null ? 0 : parseFloat(v));
const xy = (node, name) => { const k = kid(node, name); return k ? { x: num(k[1]), y: num(k[2]), r: num(k[3]) } : null; };

function sideOfLayer(layer) {
  if (layer === 'F.Cu') return 'top';
  if (layer === 'B.Cu') return 'bottom';
  return 'inner';
}

/**
 * @param {Uint8Array} bytes
 */
export function parseKiCad(bytes) {
  const text = fixText(bytesToLatin1(bytes));
  const tree = parseSexpr(text);
  if (tree[0] !== 'kicad_pcb') throw new Error('Not a KiCad PCB file.');

  // Net numbers -> names (KiCad <= 8 numbers its nets; 9 may name them inline).
  const netName = new Map();
  for (const n of kids(tree, 'net')) netName.set(String(n[1]), n[2] || '');
  const netOf = (node) => {
    const k = kid(node, 'net');
    if (!k) return '';
    if (k.length >= 3) return k[2];
    return netName.has(String(k[1])) ? netName.get(String(k[1])) : String(k[1]);
  };

  const P = (x, y) => ({ x: x * MM, y: -y * MM });
  const parts = [];
  const pins = [];

  for (const fp of [...kids(tree, 'footprint'), ...kids(tree, 'module')]) {
    const at = xy(fp, 'at') || { x: 0, y: 0, r: 0 };
    const layer = (kid(fp, 'layer') || [])[1] || 'F.Cu';
    const side = layer === 'B.Cu' ? SIDE.BOTTOM : SIDE.TOP;
    let ref = '';
    for (const p of kids(fp, 'property')) if (p[1] === 'Reference') ref = p[2];
    if (!ref) for (const t of kids(fp, 'fp_text')) if (t[1] === 'reference') ref = t[2];
    let value = '';
    for (const p of kids(fp, 'property')) if (p[1] === 'Value') value = p[2];
    if (!value) for (const t of kids(fp, 'fp_text')) if (t[1] === 'value') value = t[2];
    const pi = parts.length;
    parts.push({ name: ref || `FP${pi + 1}`, side, mfgcode: value || '' });
    const a = (at.r * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (const pad of kids(fp, 'pad')) {
      const pat = xy(pad, 'at') || { x: 0, y: 0 };
      // KiCad rotates footprints counter-clockwise on screen with Y down.
      const x = at.x + pat.x * ca + pat.y * sa;
      const y = at.y - pat.x * sa + pat.y * ca;
      const size = kid(pad, 'size');
      const pos = P(x, y);
      const padType = pad[2];
      pins.push({
        part: pi,
        snum: String(pad[1] ?? ''),
        name: String(pad[1] ?? ''),
        x: pos.x, y: pos.y,
        net: netOf(pad),
        side: padType === 'thru_hole' || padType === 'np_thru_hole' ? SIDE.BOTH : side,
        radius: size ? (Math.min(num(size[1]), num(size[2])) / 2) * MM : 0,
        // Real pad: size, absolute angle (KiCad stores pad angles including the footprint's) and shape.
        pw: size ? num(size[1]) * MM : 0,
        ph: size ? num(size[2]) * MM : 0,
        pa: ((pat.r || 0) * Math.PI) / 180,
        shape: pad[3] === 'circle' ? 'round' : pad[3] === 'oval' ? 'oval' : 'rect',
        drill: kid(pad, 'drill') ? num(kid(pad, 'drill')[1]) * MM : 0,
      });
    }
    // Body outline: fabrication layer first (the real package), then courtyard, then silkscreen.
    const local = (lx, ly) => P(at.x + lx * ca + ly * sa, at.y - lx * sa + ly * ca);
    const byLayer = { Fab: [], CrtYd: [], SilkS: [] };
    for (const g of [...kids(fp, 'fp_line'), ...kids(fp, 'fp_rect'), ...kids(fp, 'fp_poly')]) {
      const lname = String((kid(g, 'layer') || [])[1] || '');
      const key = /Fab$/.test(lname) ? 'Fab' : /CrtYd$/.test(lname) ? 'CrtYd' : /Silk/.test(lname) ? 'SilkS' : null;
      if (!key) continue;
      const out = byLayer[key];
      if (g[0] === 'fp_poly') {
        const ptsNode = kid(g, 'pts');
        const pts = ptsNode ? kids(ptsNode, 'xy').map((q) => local(num(q[1]), num(q[2]))) : [];
        for (let i = 0; i < pts.length; i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
        continue;
      }
      const a = xy(g, 'start'), b = xy(g, 'end');
      if (!a || !b) continue;
      if (g[0] === 'fp_rect') {
        const c = [local(a.x, a.y), local(b.x, a.y), local(b.x, b.y), local(a.x, b.y)];
        for (let i = 0; i < 4; i++) out.push([c[i], c[(i + 1) % 4]]);
      } else out.push([local(a.x, a.y), local(b.x, b.y)]);
    }
    parts[pi].outline = byLayer.Fab.length >= 3 ? byLayer.Fab : byLayer.CrtYd.length >= 3 ? byLayer.CrtYd : null;
    parts[pi].silk = byLayer.SilkS;
  }

  // Real copper: tracks, arcs (as short segments) and vias.
  const traces = [];
  for (const s of kids(tree, 'segment')) {
    const a = xy(s, 'start'), b = xy(s, 'end');
    if (!a || !b) continue;
    const pa = P(a.x, a.y), pb = P(b.x, b.y);
    traces.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, w: num((kid(s, 'width') || [])[1]) * MM, net: netOf(s), side: sideOfLayer((kid(s, 'layer') || [])[1]) });
  }
  for (const s of kids(tree, 'arc')) {
    const a = xy(s, 'start'), m = xy(s, 'mid'), b = xy(s, 'end');
    if (!a || !m || !b) continue;
    const w = num((kid(s, 'width') || [])[1]) * MM, net = netOf(s), side = sideOfLayer((kid(s, 'layer') || [])[1]);
    const pts = arcPoints(a, m, b);
    for (let i = 1; i < pts.length; i++) {
      const p1 = P(pts[i - 1].x, pts[i - 1].y), p2 = P(pts[i].x, pts[i].y);
      traces.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, w, net, side });
    }
  }
  const vias = [];
  for (const v of kids(tree, 'via')) {
    const at = xy(v, 'at');
    if (!at) continue;
    const p = P(at.x, at.y);
    vias.push({ x: p.x, y: p.y, r: (num((kid(v, 'size') || [])[1]) / 2) * MM, net: netOf(v) });
  }

  // Board outline from Edge.Cuts graphics.
  const outlineSegments = [];
  for (const g of [...kids(tree, 'gr_line'), ...kids(tree, 'gr_rect'), ...kids(tree, 'gr_arc')]) {
    if ((kid(g, 'layer') || [])[1] !== 'Edge.Cuts') continue;
    const a = xy(g, 'start'), b = xy(g, 'end');
    if (!a || !b) continue;
    if (g[0] === 'gr_rect') {
      const c = [P(a.x, a.y), P(b.x, a.y), P(b.x, b.y), P(a.x, b.y)];
      for (let i = 0; i < 4; i++) outlineSegments.push([c[i], c[(i + 1) % 4]]);
    } else if (g[0] === 'gr_arc' && kid(g, 'mid')) {
      const pts = arcPoints(a, xy(g, 'mid'), b);
      for (let i = 1; i < pts.length; i++) outlineSegments.push([P(pts[i - 1].x, pts[i - 1].y), P(pts[i].x, pts[i].y)]);
    } else if (g[0] === 'gr_arc') {
      // KiCad 5 and older: (start) is the centre, (end) is where the arc starts, (angle) its sweep in degrees.
      const sweep = (num((kid(g, 'angle') || [])[1]) || 0) * Math.PI / 180;
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      if (!sweep || !r) continue;
      const t0 = Math.atan2(b.y - a.y, b.x - a.x);
      const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
      let prev = P(b.x, b.y);
      for (let i = 1; i <= steps; i++) {
        const t = t0 + (sweep * i) / steps;
        const next = P(a.x + r * Math.cos(t), a.y + r * Math.sin(t));
        outlineSegments.push([prev, next]);
        prev = next;
      }
    } else {
      outlineSegments.push([P(a.x, a.y), P(b.x, b.y)]);
    }
  }

  return { format: 'KiCad', parts, pins, outline: [], outlineSegments, traces, vias };
}

/** Points along a circular arc through start, mid and end. */
function arcPoints(a, m, b) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-9) return [a, b];
  const sq = (p) => p.x * p.x + p.y * p.y;
  const cx = (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d;
  const cy = (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const t0 = Math.atan2(a.y - cy, a.x - cx), tm = Math.atan2(m.y - cy, m.x - cx), t1 = Math.atan2(b.y - cy, b.x - cx);
  const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = norm(t1 - t0);
  if (norm(tm - t0) > sweep) sweep -= 2 * Math.PI; // goes the other way round
  const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
  const out = [];
  for (let i = 0; i <= steps; i++) { const t = t0 + (sweep * i) / steps; out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }); }
  return out;
}
