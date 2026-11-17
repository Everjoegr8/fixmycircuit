// Gerber RS-274X copper layer reader. A Gerber copper layer is the real artwork
// used to make the board, so its tracks are real copper routing. Gerber X2 files
// (KiCad, Altium and others write them by default) also name the net of every
// track (%TO.N) and the part and pin of every pad (%TO.P), which lets us line the
// layer up with the boardview automatically.

/**
 * @param {string} text
 * @returns {{ traces: {x1:number,y1:number,x2:number,y2:number,w:number,net:string}[], pads: {x:number,y:number,w:number,ref:string,pin:string,net:string}[], regions: number, units: 'mm', layer: string, side: 'top'|'bottom'|'inner'|'' }}
 */
export function parseGerber(text) {
  let toMm = 1;
  let intD = 4, decD = 6, trailing = false;
  const apertures = new Map(); // code -> width in file units
  let ap = 0;
  let interp = 1; // 1 linear, 2 cw, 3 ccw
  let x = 0, y = 0;
  let region = false;
  let net = '', ref = '', pin = '';
  let fileFunction = '';
  const traces = [], pads = [];
  let regions = 0;

  const coord = (s) => {
    if (s == null) return null;
    if (s.includes('.')) return parseFloat(s);
    let neg = false;
    if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    if (trailing) s = s.padEnd(intD + decD, '0');
    const v = parseInt(s, 10) / Math.pow(10, decD);
    return neg ? -v : v;
  };

  // Split into extended (%...%) blocks and ordinary *-terminated words.
  const re = /%([^%]*)%|([^%*]+)\*/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] != null) {
      for (const raw of m[1].split('*')) {
        const c = raw.trim();
        if (!c) continue;
        if (c.startsWith('FS')) {
          trailing = c[2] === 'T';
          const f = /X(\d)(\d)/.exec(c);
          if (f) { intD = +f[1]; decD = +f[2]; }
        } else if (c === 'MOMM') toMm = 1;
        else if (c === 'MOIN') toMm = 25.4;
        else if (c.startsWith('AD')) {
          const a = /^ADD(\d+)([A-Za-z_][^,]*)(?:,(.*))?$/.exec(c);
          if (a) {
            const params = (a[3] || '').split('X').map(parseFloat).filter((v) => !Number.isNaN(v));
            const t = a[2];
            const w = t === 'C' ? params[0] : t === 'R' || t === 'O' ? Math.min(params[0] || 0, params[1] || params[0] || 0) : t === 'P' ? params[0] : NaN;
            apertures.set(+a[1], { w: Number.isFinite(w) ? w : 0, size: params[0] || 0 });
          }
        } else if (c.startsWith('TO.N,')) net = c.slice(5).split(',')[0];
        else if (c.startsWith('TO.P,')) { const p = c.slice(5).split(','); ref = p[0] || ''; pin = p[1] || ''; }
        else if (c.startsWith('TD')) {
          const k = c.slice(2);
          if (!k || k === '.N') net = '';
          if (!k || k === '.P') { ref = ''; pin = ''; }
        } else if (c.startsWith('TF.FileFunction,')) fileFunction = c.slice(16);
      }
      continue;
    }
    let w = m[2].replace(/\s+/g, '');
    if (!w || w.startsWith('G04')) continue;
    if (/^M0[02]/.test(w)) break;
    // Leading G codes
    let g;
    while ((g = /^G0*(\d+)/.exec(w))) {
      const code = +g[1];
      if (code === 1 || code === 2 || code === 3) interp = code;
      else if (code === 36) region = true;
      else if (code === 37) { region = false; regions++; }
      else if (code === 4) { w = ''; break; }
      w = w.slice(g[0].length);
      if (code === 54 || code === 55) break; // deprecated "G54D10"
    }
    if (!w) continue;
    const sel = /^D0*(\d+)$/.exec(w);
    if (sel && +sel[1] >= 10) { ap = +sel[1]; continue; }
    const X = /X([+-]?[\d.]+)/.exec(w), Y = /Y([+-]?[\d.]+)/.exec(w), I = /I([+-]?[\d.]+)/.exec(w), J = /J([+-]?[\d.]+)/.exec(w);
    const D = /D0*([123])$/.exec(w);
    const nx = X ? coord(X[1]) : x, ny = Y ? coord(Y[1]) : y;
    const op = D ? +D[1] : X || Y ? 1 : 0;
    const aw = (apertures.get(ap)?.w || 0) * toMm;
    if (op === 1 && !region) {
      if (interp === 1) traces.push({ x1: x * toMm, y1: y * toMm, x2: nx * toMm, y2: ny * toMm, w: aw, net });
      else {
        const cx = x + (I ? coord(I[1]) : 0), cy = y + (J ? coord(J[1]) : 0);
        const r = Math.hypot(x - cx, y - cy);
        let t0 = Math.atan2(y - cy, x - cx), t1 = Math.atan2(ny - cy, nx - cx);
        if (interp === 3 && t1 <= t0) t1 += 2 * Math.PI;
        if (interp === 2 && t1 >= t0) t1 -= 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(Math.abs(t1 - t0) / (Math.PI / 16)));
        let px = x, py = y;
        for (let i = 1; i <= steps; i++) {
          const t = t0 + ((t1 - t0) * i) / steps;
          const qx = cx + r * Math.cos(t), qy = cy + r * Math.sin(t);
          traces.push({ x1: px * toMm, y1: py * toMm, x2: qx * toMm, y2: qy * toMm, w: aw, net });
          px = qx; py = qy;
        }
      }
    } else if (op === 3 && !region) {
      pads.push({ x: nx * toMm, y: ny * toMm, w: (apertures.get(ap)?.size || 0) * toMm, ref, pin, net });
    }
    x = nx; y = ny;
  }
  const ff = fileFunction.toLowerCase();
  const side = /,top/.test(ff) ? 'top' : /,bot/.test(ff) ? 'bottom' : /,inr/.test(ff) ? 'inner' : '';
  return { traces, pads, regions, units: 'mm', layer: fileFunction, side };
}

export const isGerberName = (name) => /\.(gbr|ger|gtl|gbl|g\d+|gp\d+|art|pho|cmp|sol)$/i.test(name || '');

/** Side guessed from the usual file name conventions when the file does not say. */
export function guessGerberSide(name) {
  const n = (name || '').toLowerCase();
  if (/\.gtl$|f[._-]cu|top|\.cmp$/.test(n)) return 'top';
  if (/\.gbl$|b[._-]cu|bot|\.sol$/.test(n)) return 'bottom';
  if (/\.g\d+$|in\d|inner/.test(n)) return 'inner';
  return '';
}

/**
 * Work out how to place Gerber millimetre coordinates onto the boardview.
 * Uses the X2 pad attributes (part and pin) when they match the board, which
 * gives an exact fit. Otherwise stretches the copper to the board's extent and
 * says so, so the technician knows to check it by eye.
 * @returns {{ ax:number, bx:number, ay:number, by:number, method:'pins'|'extent', matched:number, error?:number }}
 */
export function alignGerber(layer, board) {
  const pinAt = new Map();
  for (const p of board.pins) {
    const part = board.parts[p.part];
    if (part && p.snum) pinAt.set(`${part.name}|${p.snum}`.toUpperCase(), p);
  }
  const pairs = [];
  for (const pad of layer.pads) {
    if (!pad.ref) continue;
    const bp = pinAt.get(`${pad.ref}|${pad.pin}`.toUpperCase());
    if (bp) pairs.push([pad.x, pad.y, bp.x, bp.y]);
  }
  const fit1 = (us, vs) => {
    const n = us.length, mu = us.reduce((a, b) => a + b, 0) / n, mv = vs.reduce((a, b) => a + b, 0) / n;
    let suv = 0, suu = 0;
    for (let i = 0; i < n; i++) { suv += (us[i] - mu) * (vs[i] - mv); suu += (us[i] - mu) ** 2; }
    if (suu < 1e-9) return null;
    const a = suv / suu;
    return { a, b: mv - a * mu };
  };
  if (pairs.length >= 3) {
    const fx = fit1(pairs.map((p) => p[0]), pairs.map((p) => p[2]));
    const fy = fit1(pairs.map((p) => p[1]), pairs.map((p) => p[3]));
    if (fx && fy) {
      let err = 0;
      for (const [gx, gy, bx, by] of pairs) err = Math.max(err, Math.hypot(fx.a * gx + fx.b - bx, fy.a * gy + fy.b - by));
      return { ax: fx.a, bx: fx.b, ay: fy.a, by: fy.b, method: 'pins', matched: pairs.length, error: err };
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of layer.traces) { x0 = Math.min(x0, t.x1, t.x2); x1 = Math.max(x1, t.x1, t.x2); y0 = Math.min(y0, t.y1, t.y2); y1 = Math.max(y1, t.y1, t.y2); }
  for (const p of layer.pads) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const b = board.bounds;
  if (!Number.isFinite(x0) || x1 === x0 || y1 === y0) return { ax: 1 / 0.0254, bx: 0, ay: 1 / 0.0254, by: 0, method: 'extent', matched: 0 };
  // Keep the aspect ratio: one scale, centred.
  const s = Math.min((b.maxx - b.minx) / (x1 - x0), (b.maxy - b.miny) / (y1 - y0));
  const cxg = (x0 + x1) / 2, cyg = (y0 + y1) / 2, cxb = (b.minx + b.maxx) / 2, cyb = (b.miny + b.maxy) / 2;
  return { ax: s, bx: cxb - s * cxg, ay: s, by: cyb - s * cyg, method: 'extent', matched: pairs.length };
}

/** Apply an alignment: Gerber layer -> board traces. */
export function placeGerber(layer, fit, side) {
  const s = Math.abs(fit.ax);
  return layer.traces.map((t) => ({
    x1: fit.ax * t.x1 + fit.bx, y1: fit.ay * t.y1 + fit.by,
    x2: fit.ax * t.x2 + fit.bx, y2: fit.ay * t.y2 + fit.by,
    w: t.w * s, net: t.net, side,
  }));
}
