// Board geometry: the real shape of every part body and pad.
//
// Formats that carry real geometry (KiCad, ODB++, GenCAD, Altium ASCII, BVR3)
// give pad sizes, rotations and body outlines, and those are used as they are.
// Most phone boardviews (BRD, BDV, FZ, XZZ, CST...) only give a centre point per
// pin. For those the shape is worked out from the pins, following the same
// idea as OpenBoardView (BoardView::DrawParts: oriented outlines for 2/3 pin
// parts and a minimum-area box around the convex hull for the rest) and
// going further: every package is classified (chip, SOT, QFN/QFP, SOIC/connector
// rows, BGA, irregular), the body is rotated to the part's real angle, and each
// pad gets a size and direction from its neighbours so it looks like the land
// on the real board. Everything is relative to the pin pitch, so it does not
// depend on the file's units.

const KIND_RULES = [
  [/^(TP|PP|TEST)/i, 'testpoint'],
  [/^(FB|FL|EMI|BEAD|E\d)/i, 'filter'],
  [/^(JP|XW|SJ|ZR|R0)/i, 'jumper'],
  [/^(RN|RA|R)\d/i, 'resistor'],
  [/^(CN|J|CON|CONN|P|BTB|FPC|ZIF)\d/i, 'connector'],
  [/^(C|EC|TC|CE)\d/i, 'capacitor'],
  [/^(L|PL)\d/i, 'inductor'],
  [/^(F|FU|PF)\d/i, 'fuse'],
  [/^(D|ZD|VD|LED|TVS|VR|DS)\d/i, 'diode'],
  [/^(Q|T|M|VT)\d/i, 'transistor'],
  [/^(U|IC|N|AP|CPU|PMU|PMIC)\d/i, 'ic'],
  [/^(Y|X|XTAL|G|OSC)\d/i, 'crystal'],
  [/^(SH|SHIELD|CAN)/i, 'shield'],
  [/^(SW|S|K|KEY)\d/i, 'switch'],
  [/^(MIC|SPK|MOT|ANT|BAT|B)\d/i, 'component'],
];

/** Part kind from the reference designator (same rules as the net index). */
export function partKind(name, pinCount = 0) {
  for (const [re, k] of KIND_RULES) if (re.test(name || '')) return k;
  if (pinCount >= 8) return 'ic';
  return 'other';
}

// --- small geometry helpers ---------------------------------------------------

/** Andrew's monotone chain convex hull. */
export function convexHull(pts) {
  const p = pts.map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/**
 * Minimum-area enclosing rectangle (rotating the hull edges). Angles near 0 or
 * 90 degrees win ties so axis-aligned parts stay exactly axis-aligned.
 * Returns {cx, cy, w, h, a} with a in radians, w along the angle.
 */
export function minAreaRect(pts) {
  if (!pts.length) return null;
  const hull = convexHull(pts);
  const cands = [0];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (a.x === b.x && a.y === b.y) continue;
    cands.push(Math.atan2(b.y - a.y, b.x - a.x));
  }
  let best = null;
  for (const ang0 of cands) {
    // Normalise to [-45deg, 45deg) so w/h keep a stable meaning.
    let ang = ang0 % (Math.PI / 2);
    if (ang >= Math.PI / 4) ang -= Math.PI / 2;
    if (ang < -Math.PI / 4) ang += Math.PI / 2;
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of hull.length ? hull : pts) {
      const x = q.x * c - q.y * s, y = q.x * s + q.y * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const area = (x1 - x0) * (y1 - y0);
    const tilt = Math.abs(ang);
    if (!best || area < best.area * 0.995 || (area <= best.area * 1.005 && tilt < best.tilt)) {
      const lx = (x0 + x1) / 2, ly = (y0 + y1) / 2;
      const cb = Math.cos(ang), sb = Math.sin(ang);
      best = { cx: lx * cb - ly * sb, cy: lx * sb + ly * cb, w: x1 - x0, h: y1 - y0, a: ang, area, tilt };
    }
  }
  return { cx: best.cx, cy: best.cy, w: best.w, h: best.h, a: best.a };
}

/** Corners of an oriented rectangle {cx,cy,w,h,a}. */
export function rectCorners(r) {
  const c = Math.cos(r.a), s = Math.sin(r.a), hw = r.w / 2, hh = r.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: r.cx + x * c - y * s, y: r.cy + x * s + y * c }));
}

/** True when board point (x,y) is inside oriented rectangle r (with margin m). */
export function inRect(r, x, y, m = 0) {
  const c = Math.cos(-r.a), s = Math.sin(-r.a);
  const dx = x - r.cx, dy = y - r.cy;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= r.w / 2 + m && Math.abs(ly) <= r.h / 2 + m;
}

const median = (a) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** Nearest-neighbour distance for each point (grid accelerated for big parts). */
function nearest(pts) {
  const n = pts.length;
  const out = new Array(n).fill(Infinity);
  if (n < 2) return out;
  if (n <= 64) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > 0) { if (d < out[i]) out[i] = d; if (d < out[j]) out[j] = d; }
      }
    return out;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const cell = Math.max(Math.sqrt(((x1 - x0) * (y1 - y0) || 1) / n), 1e-6);
  const grid = new Map();
  pts.forEach((p, i) => {
    const k = Math.floor((p.x - x0) / cell) + ',' + Math.floor((p.y - y0) / cell);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  });
  pts.forEach((p, i) => {
    const gx = Math.floor((p.x - x0) / cell), gy = Math.floor((p.y - y0) / cell);
    for (let r = 1; r <= 4 && out[i] === Infinity; r++)
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++) {
          const l = grid.get(gx + a + ',' + (gy + b));
          if (!l) continue;
          for (const j of l) {
            if (j === i) continue;
            const d = Math.hypot(p.x - pts[j].x, p.y - pts[j].y);
            if (d > 0 && d < out[i]) out[i] = d;
          }
        }
  });
  return out;
}

const DEG = Math.PI / 180;

// --- package estimation ---------------------------------------------------------

/**
 * Work out body and pads for one part from its pin centres.
 * pins: [{x,y,...}] (the board pin objects, updated in place with pw/ph/pa/shape).
 * smallPad: a board-wide typical small pad size, used for single pins.
 */
function estimatePart(part, pins, smallPad) {
  const n = pins.length;
  const kind = part.kind;
  const setPad = (p, w, h, a, shape) => {
    if (p.pw > 0) return; // real pad from the file
    p.pw = w; p.ph = h; p.pa = a; p.shape = shape;
  };

  if (n === 1) {
    const p = pins[0];
    const d = smallPad * (kind === 'testpoint' ? 2.2 : 2.4);
    setPad(p, d, d, 0, 'round');
    part.body = kind === 'testpoint' ? null : { cx: p.x, cy: p.y, w: d * 1.6, h: d * 1.6, a: 0 };
    part.pkg = 'single';
    return;
  }

  if (n === 2) {
    const [a, b] = pins;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || smallPad;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    // Chip-component land pattern proportions (0201..1210 all scale like this).
    let bodyL = d * 1.12, bodyW = d * 0.56, padL = d * 0.48, padW = d * 0.62;
    if (kind === 'inductor') { bodyW = d * 0.78; padW = d * 0.78; padL = d * 0.42; }
    if (kind === 'crystal') { bodyW = d * 0.72; padW = d * 0.6; }
    if (kind === 'diode') { bodyW = d * 0.6; }
    if (kind === 'shield' || kind === 'connector') { bodyL = d * 1.1; bodyW = d * 0.35; padL = d * 0.25; padW = d * 0.3; }
    // Pads must not overlap or swallow the body gap.
    padL = Math.min(padL, d * 0.6);
    setPad(a, padL, padW, ang, 'rect');
    setPad(b, padL, padW, ang, 'rect');
    part.body = { cx, cy, w: bodyL, h: bodyW, a: ang };
    part.pkg = 'chip';
    return;
  }

  const rect = minAreaRect(pins);
  const ang = rect.a;
  const c = Math.cos(-ang), s = Math.sin(-ang);
  const local = pins.map((p) => {
    const dx = p.x - rect.cx, dy = p.y - rect.cy;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });
  const nn = nearest(local);
  const finiteNN = nn.filter(Number.isFinite);
  const pitch = median(finiteNN) || smallPad * 2;
  const W = rect.w, H = rect.h;
  const tol = pitch * 0.35;
  const onL = (q) => q.x <= -W / 2 + tol, onR = (q) => q.x >= W / 2 - tol;
  const onB = (q) => q.y <= -H / 2 + tol, onT = (q) => q.y >= H / 2 - tol;
  let edge = 0, inner = 0;
  for (const q of local) (onL(q) || onR(q) || onB(q) || onT(q) ? edge++ : inner++);

  // Grid detection for BGA/LGA: many inner pins on a regular pitch.
  const cols = new Set(local.map((q) => Math.round(q.x / pitch)));
  const rows = new Set(local.map((q) => Math.round(q.y / pitch)));
  const isGrid = n >= 9 && inner >= n * 0.2 && cols.size >= 3 && rows.size >= 3;

  const toBoardRect = (lx, ly, w, h) => {
    const cb = Math.cos(ang), sb = Math.sin(ang);
    return { cx: rect.cx + lx * cb - ly * sb, cy: rect.cy + lx * sb + ly * cb, w, h, a: ang };
  };

  if (isGrid) {
    const dia = pitch * 0.55;
    for (const p of pins) setPad(p, dia, dia, 0, 'round');
    const m = pitch * 0.85;
    part.body = toBoardRect(0, 0, W + m * 2, H + m * 2);
    part.pkg = 'bga';
    return;
  }

  // Pins along edges: QFN/QFP (4 sides), SOIC/SOT/connector rows (2 sides).
  const sides = { L: 0, R: 0, B: 0, T: 0 };
  for (const q of local) { if (onL(q)) sides.L++; if (onR(q)) sides.R++; if (onB(q)) sides.B++; if (onT(q)) sides.T++; }
  const regular = inner <= Math.max(1, n * 0.08);
  if (regular) {
    const lr = sides.L + sides.R, bt = sides.B + sides.T;
    const fourSided = sides.L >= 2 && sides.R >= 2 && sides.B >= 2 && sides.T >= 2 && n >= 8;
    const padLen = n <= 6 ? pitch * 0.95 : Math.max(pitch * 1.25, Math.min(W, H) * (fourSided ? 0.1 : 0.18));
    const padThk = pitch * 0.55;
    // Which axis are the rows on? For 2-sided parts pads point across the gap.
    const rowsVertical = lr >= bt; // pins on left/right edges -> pads along x
    local.forEach((q, i) => {
      const p = pins[i];
      const isLR = onL(q) || onR(q), isBT = onB(q) || onT(q);
      let alongX;
      if (isLR && isBT) alongX = fourSided ? Math.abs(Math.abs(q.x) - W / 2) < Math.abs(Math.abs(q.y) - H / 2) : rowsVertical;
      else if (isLR) alongX = true;
      else if (isBT) alongX = false;
      else alongX = rowsVertical;
      const thk = Math.min(padThk, (Number.isFinite(nn[i]) ? nn[i] : pitch) * 0.62);
      if (!isLR && !isBT) {
        // Exposed thermal pad in the middle of a QFN, or a lone middle pin.
        const sz = Math.max(Math.min(W, H) - padLen * 2.2, pitch);
        setPad(p, sz, sz, ang, 'rect');
      } else {
        setPad(p, alongX ? padLen : thk, alongX ? thk : padLen, ang, 'rect');
      }
    });
    // Body: between the rows of pads, with the pads sticking out like on the board.
    const kindIsConn = kind === 'connector';
    let bw, bh;
    if (fourSided) { bw = W - padLen * 0.6; bh = H - padLen * 0.6; }
    else if (rowsVertical) { bw = Math.max(W - padLen * 0.9, W * 0.45); bh = H + pitch * (kindIsConn ? 1.6 : 0.9); }
    else { bw = W + pitch * (kindIsConn ? 1.6 : 0.9); bh = Math.max(H - padLen * 0.9, H * 0.45); }
    if (kindIsConn) { bw = rowsVertical ? W + padLen * 0.4 : bw; bh = rowsVertical ? bh : H + padLen * 0.4; }
    part.body = toBoardRect(0, 0, bw, bh);
    part.pkg = fourSided ? 'quad' : n === 3 || (n <= 6 && Math.max(W, H) < pitch * 3.2) ? 'sot' : 'dual';
    return;
  }

  // Irregular (connectors with tabs, shields, modules): pads sized by neighbours, hull body.
  local.forEach((q, i) => {
    const d = Math.min(Number.isFinite(nn[i]) ? nn[i] : pitch, pitch * 2.5) * 0.6;
    setPad(pins[i], d, d, 0, 'round');
  });
  const m = pitch * 0.5;
  part.body = toBoardRect(0, 0, W + m * 2, H + m * 2);
  part.hull = convexHull(pins);
  part.pkg = 'irregular';
}

/** Body rectangle from a real outline in the file (silkscreen/fab/courtyard). */
function bodyFromOutline(part) {
  const pts = [];
  for (const [a, b] of part.outline) { pts.push(a, b); }
  if (pts.length < 3) return null;
  return minAreaRect(pts);
}

/**
 * Fill in part.kind, part.body (oriented rect), part.bbox (axis aligned, for
 * hit testing), part.pin1 and per pin: pw, ph (pad size), pa (angle, radians),
 * shape ('rect' | 'round' | 'oval'), r (hit radius).
 */
export function computeGeometry(board) {
  const { parts, pins } = board;
  // Board-wide small pad: from 2-pin chip parts (the most common thing on a phone).
  const twoPin = [];
  for (const part of parts) {
    if (part.pins.length !== 2 || part.testpoint) continue;
    const [a, b] = part.pins.map((i) => pins[i]);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0) twoPin.push(d);
  }
  const b = board.bounds;
  const span = Math.max(b.maxx - b.minx, b.maxy - b.miny, 1);
  let smallPad = twoPin.length ? median(twoPin) * 0.5 : span / 300;
  if (!(smallPad > 0)) smallPad = span / 300;

  let filePads = 0;
  for (const p of pins) if (p.pw > 0 && p.ph > 0) filePads++;
  board.geometry = filePads > pins.length * 0.5 || parts.some((q) => q.outline) ? 'file' : 'pins';
  for (const part of parts) {
    const ps = part.pins.map((i) => pins[i]);
    part.kind = part.testpoint ? 'testpoint' : partKind(part.name, ps.length);
    // Real pads from the file: pw/ph in board units, pa radians.
    for (const p of ps) {
      if (p.pw > 0 && p.ph > 0) { p.pa = p.pa || 0; p.shape = p.shape || 'rect'; }
    }
    if (!ps.length) { part.body = null; continue; }
    if (part.testpoint) {
      for (const p of ps) if (!(p.pw > 0)) { const d = p.radius > 0 && board.realPads ? p.radius * 2 : smallPad * 2.2; p.pw = p.ph = d; p.pa = 0; p.shape = 'round'; }
      part.body = null;
      continue;
    }
    // A radius from the file (FZ, BVR3, CAD) is a real pad size for round pads.
    for (const p of ps) if (!(p.pw > 0) && p.radius > 0 && board.realPads) { p.pw = p.ph = p.radius * 2; p.pa = 0; p.shape = 'round'; }
    estimatePart(part, ps, smallPad);
    if (part.outline && part.outline.length >= 2) {
      const ob = bodyFromOutline(part);
      if (ob && ob.w > 0 && ob.h > 0) part.body = ob;
    }
  }

  // Hit radius, part boxes and pin 1.
  for (const p of pins) {
    if (!(p.pw > 0)) { p.pw = p.ph = smallPad; p.pa = 0; p.shape = 'round'; }
    p.r = Math.max(p.pw, p.ph) / 2;
  }
  for (const part of parts) {
    const ps = part.pins.map((i) => pins[i]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
    for (const p of ps) { grow(p.x - p.r, p.y - p.r); grow(p.x + p.r, p.y + p.r); }
    if (part.body) for (const q of rectCorners(part.body)) grow(q.x, q.y);
    part.bbox = Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
    if (part.body && ps.length > 2) {
      const one = ps.find((p) => /^(1|A1|A01|P1)$/i.test(String(p.snum || p.name || ''))) || null;
      part.pin1 = one ? one.index : null;
    } else part.pin1 = null;
  }
  board.smallPad = smallPad;
  return board;
}

/** Chain unordered outline segments into closed/open polylines (for filling the board). */
export function chainOutline(segs, tolerance) {
  const key = (p) => Math.round(p.x / tolerance) + ',' + Math.round(p.y / tolerance);
  const ends = new Map();
  const used = new Array(segs.length).fill(false);
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      let l = ends.get(k);
      if (!l) ends.set(k, (l = []));
      l.push(i);
    }
  });
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const poly = [segs[i][0], segs[i][1]];
    let guard = segs.length + 2;
    // Extend forwards then backwards.
    for (const dir of [1, -1]) {
      while (guard-- > 0) {
        const tip = dir === 1 ? poly[poly.length - 1] : poly[0];
        const cand = (ends.get(key(tip)) || []).find((j) => !used[j]);
        if (cand == null) break;
        used[cand] = true;
        const [a, b] = segs[cand];
        const next = key(a) === key(tip) ? b : a;
        if (dir === 1) poly.push(next); else poly.unshift(next);
      }
    }
    loops.push(poly);
  }
  return loops;
}

/** Polygon area (shoelace), absolute. */
export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

export { DEG };
