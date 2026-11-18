// GenCAD 1.4 (.cad / .gcd) reader. Port of OpenBoardView GenCADFile.cpp (MIT)
// using a line reader instead of OBV's grammar. Like OBV it reads the board
// outline, components, shape pins, signals and route vias; on top of that it
// keeps the real pad sizes ($PADS/$PADSTACKS), shape body outlines and routed
// copper ($ROUTES lines), which GenCAD files carry and OBV does not draw.
import { bytesToLatin1, fixText, splitLines, emptyBoard, SIDE } from './util.js';

export function isGenCAD(bytes) {
  const head = bytesToLatin1(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return head.includes('$HEADER') && /GENCAD/i.test(head);
}

const tokens = (line) => {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
};

export function parseGenCAD(bytes) {
  const lines = splitLines(fixText(bytesToLatin1(bytes)));
  const board = emptyBoard('GenCAD');
  // Units -> mils
  let k = 1;
  const setUnits = (t) => {
    const u = (t[1] || '').toUpperCase();
    const n = parseFloat(t[2]) || 1;
    if (u === 'INCH') k = 1000;
    else if (u === 'THOU' || u === 'MIL') k = 1;
    else if (u === 'MM') k = 1000 / 25.4;
    else if (u === 'MM100') k = 1000 / 2540;
    else if (u === 'USER') k = 1000 / n;
    else if (u === 'USERM') k = (1000 / 2.54) * (1 / n) * 100; // cm units, n per cm
    else if (u === 'USERMM') k = 1000 / 25.4 / n;
  };
  const num = (v) => (parseFloat(v) || 0) * k;

  const pads = new Map(); // name -> {w,h,shape,drill}
  const padstacks = new Map(); // name -> {w,h,shape,drill,top,bottom}
  const shapes = new Map(); // name -> {pins:[{name,pad,x,y,rot,layer}], lines:[[a,b]], smd}
  const signals = new Map(); // comp\u0000pin -> net
  const comps = [];
  const vias = []; // route vias (OBV adds them as test points; here they are drawn as vias)
  const routeLines = [];
  const trackWidth = new Map();

  let section = '';
  let curPad = null, curStack = null, curShape = null, curComp = null, curSignal = '', curRoute = null;
  let boardSkip = false;
  const outlineAdd = (a, b) => board.outlineSegments.push([a, b]);
  const arcSegs = (x1, y1, x2, y2, cx, cy, sink) => {
    const r = Math.hypot(x1 - cx, y1 - cy);
    let a0 = Math.atan2(y1 - cy, x1 - cx), a1 = Math.atan2(y2 - cy, x2 - cx);
    if (a1 <= a0) a1 += Math.PI * 2;
    const n = Math.max(4, Math.ceil((a1 - a0) / (Math.PI / 18)));
    let prev = { x: x1, y: y1 };
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const p = i === n ? { x: x2, y: y2 } : { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      sink(prev, p);
      prev = p;
    }
  };
  const geom = (t, sink) => {
    const kw = t[0].toUpperCase();
    if (kw === 'LINE') sink({ x: num(t[1]), y: num(t[2]) }, { x: num(t[3]), y: num(t[4]) });
    else if (kw === 'ARC') arcSegs(num(t[1]), num(t[2]), num(t[3]), num(t[4]), num(t[5]), num(t[6]), sink);
    else if (kw === 'RECTANGLE') {
      const x = num(t[1]), y = num(t[2]), w = num(t[3]), h = num(t[4]);
      const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      for (let i = 0; i < 4; i++) sink(c[i], c[(i + 1) % 4]);
    } else if (kw === 'CIRCLE') {
      const cx = num(t[1]), cy = num(t[2]), r = num(t[3]);
      let prev = { x: cx + r, y: cy };
      for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; const p = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; sink(prev, p); prev = p; }
    } else return false;
    return true;
  };
  const bboxOf = (segs) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [a, b] of segs) for (const p of [a, b]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return Number.isFinite(x0) ? { w: x1 - x0, h: y1 - y0 } : null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] === '$') {
      const s = line.toUpperCase();
      section = s.startsWith('$END') ? '' : s;
      curPad = curStack = curShape = curComp = curRoute = null;
      boardSkip = false;
      continue;
    }
    const t = tokens(line);
    const kw = t[0].toUpperCase();
    switch (section) {
      case '$HEADER':
        if (kw === 'UNITS') setUnits(t);
        break;
      case '$BOARD':
        if (kw === 'ARTWORK' || kw === 'MASK' || kw === 'TEXT' || kw === 'ATTRIBUTE') { boardSkip = kw !== 'TEXT' && kw !== 'ATTRIBUTE' ? true : boardSkip; break; }
        if (kw === 'CUTOUT') { boardSkip = false; break; }
        if (!boardSkip) geom(t, outlineAdd);
        break;
      case '$PADS':
        if (kw === 'PAD') {
          curPad = { segs: [], type: (t[2] || '').toUpperCase(), drill: num(t[3]), round: false };
          pads.set(t[1], curPad);
        } else if (curPad) {
          if (kw === 'CIRCLE') curPad.round = true;
          geom(t, (a, b) => curPad.segs.push([a, b]));
        }
        break;
      case '$PADSTACKS':
        if (kw === 'PADSTACK') { curStack = { pads: [], drill: num(t[2]) }; padstacks.set(t[1], curStack); }
        else if (kw === 'PAD' && curStack) curStack.pads.push({ pad: t[1], layer: (t[2] || '').toUpperCase(), rot: parseFloat(t[3]) || 0 });
        break;
      case '$SHAPES':
        if (kw === 'SHAPE') { curShape = { pins: [], lines: [] }; shapes.set(t[1], curShape); }
        else if (curShape && kw === 'PIN') curShape.pins.push({ name: t[1], pad: t[2], x: num(t[3]), y: num(t[4]), layer: (t[5] || '').toUpperCase(), rot: parseFloat(t[6]) || 0 });
        else if (curShape) geom(t, (a, b) => curShape.lines.push([a, b]));
        break;
      case '$COMPONENTS':
        if (kw === 'COMPONENT') { curComp = { name: t[1], x: 0, y: 0, rot: 0, layer: 'TOP', shape: '', mirror: '0', flip: '0', device: '' }; comps.push(curComp); }
        else if (curComp) {
          if (kw === 'PLACE') { curComp.x = num(t[1]); curComp.y = num(t[2]); }
          else if (kw === 'LAYER') curComp.layer = (t[1] || '').toUpperCase();
          else if (kw === 'ROTATION') curComp.rot = parseFloat(t[1]) || 0;
          else if (kw === 'SHAPE') { curComp.shape = t[1]; curComp.mirror = (t[2] || '0').toUpperCase(); curComp.flip = (t[3] || '0').toUpperCase(); }
          else if (kw === 'DEVICE') curComp.device = t.slice(1).join(' ').replace(/ /g, '_');
        }
        break;
      case '$SIGNALS':
        if (kw === 'SIGNAL') curSignal = t.slice(1).join(' ');
        else if (kw === 'NODE' && curSignal) signals.set(t[1] + '\u0000' + t[2], curSignal);
        break;
      case '$TRACKS':
        if (kw === 'TRACK') trackWidth.set(t[1], num(t[2]));
        break;
      case '$ROUTES':
        if (kw === 'ROUTE') curRoute = { net: t.slice(1).join(' '), layer: 'TOP', w: 0 };
        else if (curRoute) {
          if (kw === 'LAYER') curRoute.layer = (t[1] || '').toUpperCase();
          else if (kw === 'TRACK') curRoute.w = trackWidth.get(t[1]) || 0;
          else if (kw === 'VIA') vias.push({ x: num(t[2]), y: num(t[3]), pad: t[1], drill: num(t[5]), net: curRoute.net });
          else if (kw === 'LINE') routeLines.push({ x1: num(t[1]), y1: num(t[2]), x2: num(t[3]), y2: num(t[4]), w: curRoute.w, net: curRoute.net, side: curRoute.layer === 'TOP' ? 'top' : curRoute.layer === 'BOTTOM' ? 'bottom' : 'inner' });
        }
        break;
    }
  }

  // Pad sizes
  const padInfo = new Map();
  for (const [name, p] of pads) {
    const bb = bboxOf(p.segs);
    padInfo.set(name, { w: bb ? bb.w : 0, h: bb ? bb.h : 0, round: p.round || p.type === 'ROUND' || p.type === 'ANNULAR', drill: p.drill });
  }
  const stackInfo = (name) => {
    const st = padstacks.get(name);
    if (!st) {
      const p = padInfo.get(name);
      return p ? { ...p, top: true, bottom: p.drill > 0, rot: 0 } : null;
    }
    let best = null, top = false, bottom = false;
    for (const sp of st.pads) {
      if (sp.layer === 'TOP' || sp.layer === 'ALL') top = true;
      if (sp.layer === 'BOTTOM' || sp.layer === 'ALL') bottom = true;
      const p = padInfo.get(sp.pad);
      if (p && (!best || p.w * p.h > best.w * best.h) && /^(TOP|BOTTOM|ALL)$/.test(sp.layer)) best = { ...p, rot: sp.rot };
    }
    if (!top && !bottom) top = bottom = true;
    return { ...(best || { w: 0, h: 0, round: true, rot: 0 }), drill: st.drill, top, bottom };
  };

  const seen = new Set();
  let nc = 0;
  for (const c of comps) {
    const shape = shapes.get(c.shape);
    const key = c.layer + ':' + c.x + ':' + c.y + ':' + c.shape;
    if (seen.has(key) && c.shape) continue; // OBV: duplicate component with same shape/place
    seen.add(key);
    const pi = board.parts.length;
    const mirX = c.mirror === 'MIRRORX', mirY = c.mirror === 'MIRRORY';
    const flip = c.flip === 'FLIP';
    let rot = (c.rot * Math.PI) / 180;
    const sx = mirX ? -1 : 1, sy = mirY ? -1 : 1;
    if (sx * sy === -1) rot = Math.PI - rot;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const place = (x, y) => ({ x: c.x + sx * (x * cs - y * sn), y: c.y + sy * (x * sn + y * cs) });
    let side = c.layer === 'BOTTOM' ? SIDE.BOTTOM : SIDE.TOP;
    let smd = true;
    const pins = [];
    for (const sp of shape ? shape.pins : []) {
      const info = stackInfo(sp.pad);
      if (info && info.drill > 0) smd = false;
      const pos = place(sp.x, sp.y);
      let pside = info ? (info.top && info.bottom ? SIDE.BOTH : info.top ? SIDE.TOP : SIDE.BOTTOM) : side;
      if (flip) pside = pside === SIDE.TOP ? SIDE.BOTTOM : pside === SIDE.BOTTOM ? SIDE.TOP : pside;
      if (pside !== SIDE.BOTH && side !== SIDE.BOTH && pside !== side && !flip) pside = side;
      let net = signals.get(c.name + '\u0000' + sp.name);
      if (!net) net = `NC@${nc++}`;
      const w = info ? info.w : 0, h = info ? info.h : 0;
      pins.push({
        x: pos.x, y: pos.y, net, part: pi, side: pside, name: sp.name, snum: sp.name,
        radius: w && h ? Math.min(w, h) / 2 : 0,
        pw: w, ph: h, pa: rot + (((sp.rot || 0) + (info ? info.rot : 0)) * Math.PI) / 180, shape: info && info.round ? 'round' : 'rect',
        drill: info ? info.drill : 0,
      });
    }
    if (!smd) side = SIDE.BOTH;
    const outline = shape && shape.lines.length >= 3 ? shape.lines.map(([a, b]) => [place(a.x, a.y), place(b.x, b.y)]) : null;
    board.parts.push({ name: c.name, side, type: smd ? 'smd' : 'th', mfgcode: [c.device, c.shape].filter(Boolean).join(' SHAPE '), outline });
    board.pins.push(...pins);
  }
  if (vias.length) board.vias = vias.map((v) => ({ x: v.x, y: v.y, net: v.net, r: ((stackInfo(v.pad) || {}).w || v.drill * 2 || 0) / 2 }));
  if (routeLines.length) board.traces = routeLines;
  if (!board.parts.length) throw new Error('GenCAD file has no components');
  return board;
}
