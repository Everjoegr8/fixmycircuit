// Altium / Protel ASCII PCB (.pcbdoc saved as ASCII, "|KIND=Protel_Advanced_PCB").
// Port of OpenBoardView ADFile.cpp (MIT). Beyond OBV it keeps each pad's real
// size, shape and rotation, the overlay (silkscreen) outline of every component
// and the routed copper tracks, so the board is drawn as designed.
import { bytesToLatin1, fixText, splitLines, emptyBoard, SIDE } from './util.js';

export function isAltiumAscii(bytes) {
  const head = bytesToLatin1(bytes.subarray(0, Math.min(bytes.length, 65536)));
  return head.includes('|KIND=Protel_Advanced_PCB') && !head.includes('Binary');
}

const field = (line, key) => {
  const i = line.indexOf('|' + key + '=');
  if (i < 0) return null;
  const s = i + key.length + 2;
  const e = line.indexOf('|', s);
  return line.slice(s, e < 0 ? line.length : e).trim();
};
const fnum = (line, key) => { const v = field(line, key); return v == null ? null : parseFloat(v) || 0; };

export function parseAltiumAscii(bytes) {
  const lines = splitLines(fixText(bytesToLatin1(bytes)));
  const board = emptyBoard('Altium');
  const nets = new Map(); // id -> name
  const comps = []; // {id, name, layer, desc}
  const pads = [];
  const overlay = new Map(); // component id -> segments
  const traces = [];
  let netOrdinal = 0, compOrdinal = 0;
  for (const line of lines) {
    if (!line.includes('RECORD=')) continue;
    const rec = field(line, 'RECORD');
    if (rec === 'Net') {
      const idv = fnum(line, 'ID');
      nets.set(idv != null ? idv : netOrdinal, field(line, 'NAME') || '');
      netOrdinal++;
    } else if (rec === 'Component') {
      const idv = fnum(line, 'ID');
      comps.push({ id: idv != null ? idv : compOrdinal, name: field(line, 'SOURCEDESIGNATOR') || `UNKNOWN-${compOrdinal}`, layer: (field(line, 'LAYER') || '').toUpperCase(), desc: field(line, 'SOURCEDESCRIPTION') || field(line, 'PATTERN') || '' });
      compOrdinal++;
    } else if (rec === 'Pad') {
      const comp = fnum(line, 'COMPONENT');
      const x = fnum(line, 'X'), y = fnum(line, 'Y');
      if (comp == null || x == null || y == null) continue;
      pads.push({
        comp, x, y,
        net: fnum(line, 'NET'),
        name: field(line, 'NAME') || '',
        rot: fnum(line, 'ROTATION') || 0,
        w: fnum(line, 'XSIZE') || 0, h: fnum(line, 'YSIZE') || 0,
        shape: (field(line, 'SHAPE') || '').toUpperCase(),
        multi: (field(line, 'LAYER') || '').toUpperCase() === 'MULTILAYER',
        hole: fnum(line, 'HOLESIZE') || 0,
      });
    } else if (rec === 'Track') {
      const layer = (field(line, 'LAYER') || '').toUpperCase();
      const x1 = fnum(line, 'X1'), y1 = fnum(line, 'Y1'), x2 = fnum(line, 'X2'), y2 = fnum(line, 'Y2');
      if ([x1, y1, x2, y2].some((v) => v == null)) continue;
      const a = { x: x1, y: y1 }, b = { x: x2, y: y2 };
      const comp = fnum(line, 'COMPONENT');
      if (layer === 'KEEPOUT' && comp == null) board.outlineSegments.push([a, b]);
      else if (layer.includes('OVERLAY') && comp != null) {
        let l = overlay.get(comp);
        if (!l) overlay.set(comp, (l = []));
        l.push([a, b]);
      } else if (/^(TOP|BOTTOM|MID)/.test(layer) && !layer.includes('OVERLAY')) {
        const n = fnum(line, 'NET');
        traces.push({ x1, y1, x2, y2, w: fnum(line, 'WIDTH') || 0, net: n != null ? nets.get(n) || '' : '', side: layer === 'TOP' ? 'top' : layer === 'BOTTOM' ? 'bottom' : 'inner' });
      }
    } else if (rec === 'Arc') {
      const layer = (field(line, 'LAYER') || '').toUpperCase();
      if (layer !== 'KEEPOUT') continue;
      const cx = fnum(line, 'LOCATION.X'), cy = fnum(line, 'LOCATION.Y'), r = fnum(line, 'RADIUS');
      if (cx == null || cy == null || r == null) continue;
      let a0 = ((fnum(line, 'STARTANGLE') || 0) * Math.PI) / 180, a1 = ((fnum(line, 'ENDANGLE') || 0) * Math.PI) / 180;
      if (a1 <= a0) a1 += Math.PI * 2;
      const n = Math.max(4, Math.ceil((a1 - a0) / (Math.PI / 18)));
      let prev = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
      for (let i = 1; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; const p = { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }; board.outlineSegments.push([prev, p]); prev = p; }
    }
  }
  const byComp = new Map();
  for (const p of pads) { let l = byComp.get(p.comp); if (!l) byComp.set(p.comp, (l = [])); l.push(p); }
  for (const c of comps) {
    const side = c.layer === 'TOP' ? SIDE.TOP : c.layer === 'BOTTOM' ? SIDE.BOTTOM : SIDE.BOTH;
    const pi = board.parts.length;
    let th = false;
    for (const p of byComp.get(c.id) || []) {
      if (p.multi) th = true;
      board.pins.push({
        x: p.x, y: p.y, part: pi, side: p.multi ? SIDE.BOTH : side,
        net: p.net != null && nets.has(p.net) ? nets.get(p.net) : 'NC',
        snum: p.name, name: p.name,
        radius: p.w > 0 && p.h > 0 ? Math.min(p.w, p.h) / 2 : 0,
        pw: p.w, ph: p.h, pa: (p.rot * Math.PI) / 180,
        shape: p.shape === 'ROUND' ? (Math.abs(p.w - p.h) < 1e-6 ? 'round' : 'oval') : 'rect',
        drill: p.hole,
      });
    }
    const ol = overlay.get(c.id);
    board.parts.push({ name: c.name, side, type: th ? 'th' : 'smd', mfgcode: c.desc, outline: ol && ol.length >= 3 ? ol : null });
  }
  if (traces.length) board.traces = traces;
  if (!board.parts.length) throw new Error('Altium ASCII file has no components');
  return board;
}
