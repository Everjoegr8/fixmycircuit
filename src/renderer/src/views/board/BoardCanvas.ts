// Canvas renderer and hit testing for a parsed boardview.
//
// Two looks:
//  - "real": the board as it looks on the bench: solder mask filled inside the
//    real outline, part bodies at their real angle and colour (MLCC tan,
//    resistors black, ICs, connectors, shields), gold pads with their real size
//    and direction, pin 1 dots and silkscreen-style labels.
//  - "classic": the OpenBoardView-style wireframe.
//  - "repair": the black and red picture repair techs know from the
//    Chinese repair tools: black background, red pads, teal shields and
//    connectors, a pink board edge and the picked part in yellow.
// Sides: top, bottom, both (overlaid) or "split": both halves side by side,
// the bottom mirrored on the right, like a board opened out on the bench.
// Shapes come from parsers/geometry.js (real geometry when the file has it,
// otherwise worked out from the pins).
//
// Selecting a net dims everything else and lights every pad, every part and
// the ratsnest of that net; pins of the net on the other side show as rings
// "through" the board. The static picture is cached so the animation on top
// stays smooth on big phone boards.
import { isGroundNet } from '@parsers/index.js';
import { rectCorners, inRect } from '@parsers/geometry.js';
import { LAYER_BY_ID, layerOfNet, type LayerId } from '@shared/layers';
import { netSegments } from '../../lib/netlines';

export type Side = 'top' | 'bottom' | 'both' | 'split';
export type Look = 'real' | 'classic' | 'repair';
export type MaskColor = 'green' | 'black' | 'blue' | 'red' | 'purple';
export interface Selection {
  part: number | null;
  pin: number | null;
  net: string | null;
}
export interface ViewOptions {
  look: Look;
  mask: MaskColor;
  /** Show the other side's parts faintly, as if the board were see-through. */
  xray: boolean;
  /** Write net names on pads when zoomed in. */
  netNames: boolean;
}
export const DEFAULT_VIEW: ViewOptions = { look: 'repair', mask: 'green', xray: false, netNames: true };

interface Pt { x: number; y: number }

const MASKS: Record<MaskColor, { fill: string; edge: string; label: string }> = {
  green: { fill: '#0f3b2a', edge: '#2f7a57', label: '#e8efe9' },
  black: { fill: '#141618', edge: '#4a5058', label: '#e6e8ea' },
  blue: { fill: '#0e2a4a', edge: '#3d6fa8', label: '#e6eef8' },
  red: { fill: '#4a1414', edge: '#9a3a3a', label: '#f6e6e6' },
  purple: { fill: '#2b1745', edge: '#6b4aa0', label: '#efe8f8' },
};

// Part body colours for the real look, by kind.
const BODY: Record<string, { fill: string; edge: string; text: string }> = {
  capacitor: { fill: '#b8986a', edge: '#8a6f47', text: '#2a2116' },
  resistor: { fill: '#1d1f22', edge: '#3a3e44', text: '#e8e8e8' },
  jumper: { fill: '#1d1f22', edge: '#3a3e44', text: '#e8e8e8' },
  inductor: { fill: '#3f444b', edge: '#5d636b', text: '#eef1f4' },
  filter: { fill: '#2f3338', edge: '#4f555c', text: '#eef1f4' },
  fuse: { fill: '#d9d2c3', edge: '#a69f90', text: '#2b2b2b' },
  ic: { fill: '#17191c', edge: '#3c4148', text: '#d9dde2' },
  transistor: { fill: '#1b1d20', edge: '#3c4148', text: '#d9dde2' },
  diode: { fill: '#1b1d20', edge: '#3c4148', text: '#d9dde2' },
  connector: { fill: '#d8cfb6', edge: '#9d9480', text: '#2a2720' },
  crystal: { fill: '#aeb6bf', edge: '#7b838c', text: '#1f242a' },
  switch: { fill: '#585e66', edge: '#7c838c', text: '#f1f3f5' },
  shield: { fill: '#9aa2ab', edge: '#c3cad1', text: '#1f242a' },
  component: { fill: '#2c3138', edge: '#4c535c', text: '#e6e9ec' },
  other: { fill: '#2c3138', edge: '#4c535c', text: '#e6e9ec' },
};

const DARK = {
  bg: '#07090c',
  scrim: 'rgba(7,9,12,0.72)',
  labelBg: '#0b0f14cc',
  hover: '#ffffff',
  outline: '#7dd3fc',
  part: '#4a5668',
  partHull: '#334155',
  partSel: '#22d3ee',
  partNet: '#f5a524',
  pin: '#9aa7b8',
  pinGnd: '#5b6f5e',
  pinNC: '#3a4250',
  pinSelPart: '#22d3ee',
  pinNet: '#ff4d3d',
  pinNetGlow: 'rgba(255,77,61,0.9)',
  pinSel: '#ffffff',
  label: '#cbd5e1',
  testpoint: '#a78bfa',
  pad: '#d8b24c',
  padEdge: '#8e6f22',
  padNC: '#7d6a3a',
  endCap: '#c9ced3',
  copperTop: '#c8873a',
  copperBottom: '#4f86c6',
  copperInner: '#7c8a9a',
  shop: '#22c55e',
  path: '#22d3ee',
};
const LIGHT: typeof DARK = {
  bg: '#e9edf2',
  scrim: 'rgba(233,237,242,0.72)',
  labelBg: '#ffffffd9',
  hover: '#0e1620',
  outline: '#08758d',
  part: '#7d8a9b',
  partHull: '#a3adba',
  partSel: '#0891b2',
  partNet: '#c27803',
  pin: '#5f6b7b',
  pinGnd: '#9db5a2',
  pinNC: '#c7ced8',
  pinSelPart: '#0891b2',
  pinNet: '#e0301e',
  pinNetGlow: 'rgba(224,48,30,0.85)',
  pinSel: '#0e1620',
  label: '#1c2733',
  testpoint: '#7c3aed',
  pad: '#d2a73a',
  padEdge: '#8e6f22',
  padNC: '#9c8a5a',
  endCap: '#c9ced3',
  copperTop: '#b8661a',
  copperBottom: '#2f6db5',
  copperInner: '#8b97a6',
  shop: '#15803d',
  path: '#0891b2',
};
// Black and red repair-tool look (same in light and dark app themes).
const REPAIR: typeof DARK = {
  ...DARK,
  bg: '#000000',
  scrim: 'rgba(0,0,0,0.7)',
  labelBg: '#000000cc',
  hover: '#ffffff',
  outline: '#e0457b',
  part: '#3f8f86',
  partHull: '#2e5f5a',
  partSel: '#ffd400',
  partNet: '#4fd1c5',
  pin: '#d8343f',
  pinGnd: '#8a2a31',
  pinNC: '#5a5a5a',
  pinSelPart: '#ffd400',
  pinNet: '#ffe14d',
  pinNetGlow: 'rgba(255,225,77,0.9)',
  pinSel: '#ffffff',
  label: '#d9dde2',
  testpoint: '#4fb3d9',
  path: '#4fd1c5',
};
let COLORS = DARK;
const pickColors = (look?: Look) => (COLORS = look === 'repair' ? REPAIR : document.documentElement.dataset.theme === 'light' ? LIGHT : DARK);

export class BoardCanvas {
  board: any;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  side: Side = 'top';
  rotation = 0; // degrees, multiples of 90
  scale = 1;
  ox = 0;
  oy = 0;
  sel: Selection = { part: null, pin: null, net: null };
  hover: number | null = null;
  opts: ViewOptions = { ...DEFAULT_VIEW };
  /** Colour-coded layers to draw (net lines + pin colours). */
  layers = new Set<LayerId>();
  private netLayer = new Map<string, LayerId | null>();
  private dirty = true;
  private raf = 0;
  private grid = new Map<string, number[]>();
  private cell = 1;
  private cx = 0;
  private cy = 0;
  private netParts = new Set<number>();
  /** Real copper (layout file, Gerber layer or shop-verified photo traces) by net. */
  private realByNet = new Map<string, any[]>();
  private onTheme = () => this.invalidate();
  /** Animation clock for the selected-net pulse. */
  private t0 = performance.now();
  /** Cached static picture (everything except hover and animation). */
  private base: HTMLCanvasElement;
  private baseKey = '';
  /** Part draw order: big bodies first so small parts stay visible on top. */
  private order: number[];

  constructor(canvas: HTMLCanvasElement, board: any) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.board = board;
    this.base = document.createElement('canvas');
    const b = board.bounds;
    this.cx = (b.minx + b.maxx) / 2;
    this.cy = (b.miny + b.maxy) / 2;
    this.buildGrid();
    for (const net of board.nets.keys()) this.netLayer.set(net, layerOfNet(net));
    this.order = board.parts
      .map((p: any, i: number) => [i, p.body ? p.body.w * p.body.h : 0] as [number, number])
      .sort((a: [number, number], c: [number, number]) => c[1] - a[1])
      .map((x: [number, number]) => x[0]);
    this.indexCopper();
    // Show the side that has parts first.
    if (!board.parts.some((p: any) => p.side === 'top') && board.parts.some((p: any) => p.side === 'bottom')) this.side = 'bottom';
    window.addEventListener('fmc-theme', this.onTheme);
    let frame = 0;
    const loop = () => {
      frame++;
      // While a net is selected, redraw ~30 fps so its ratsnest marches; the board itself is cached.
      if ((this.sel.net || this.highlight.size) && this.layersPulse && frame % 2 === 0) this.dirty = true;
      if (this.dirty) { this.dirty = false; this.draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Set false to stop the selected-net pulse animation (e.g. tests, slow PCs). */
  layersPulse = true;

  destroy() {
    window.removeEventListener('fmc-theme', this.onTheme);
    cancelAnimationFrame(this.raf);
  }

  invalidate() {
    this.dirty = true;
  }

  setOptions(o: Partial<ViewOptions>) {
    this.opts = { ...this.opts, ...o };
    this.invalidate();
  }

  /** Call after board.traces changes (Gerber layer or shop traces added). */
  indexCopper() {
    this.realByNet.clear();
    for (const t of this.board.traces || []) {
      if (!t.net) continue;
      let a = this.realByNet.get(t.net);
      if (!a) this.realByNet.set(t.net, (a = []));
      a.push(t);
    }
    this.baseKey = '';
    this.invalidate();
  }

  /** True when the net has real copper to show instead of computed lines. */
  hasRealCopper(net: string) {
    return this.realByNet.has(net);
  }

  private traceVisible(t: any) {
    const e = this.eff();
    if (t.side === 'inner') return e === 'both';
    return e === 'both' || t.side === e || t.side === 'both';
  }

  private strokeTraces(ctx: CanvasRenderingContext2D, list: any[], color: string, alpha: number, minW: number, scaleW = true) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    const byW = new Map<number, Path2D>();
    for (const t of list) {
      if (!this.traceVisible(t)) continue;
      const w = Math.max(scaleW ? Math.round(t.w * this.scale * 2) / 2 : 0, minW);
      let p = byW.get(w);
      if (!p) byW.set(w, (p = new Path2D()));
      const a = this.toScreen(t.x1, t.y1), b = this.toScreen(t.x2, t.y2);
      p.moveTo(a.x, a.y);
      p.lineTo(b.x, b.y);
    }
    for (const [w, p] of byW) { ctx.lineWidth = w; ctx.stroke(p); }
    ctx.restore();
  }

  private buildGrid() {
    const b = this.board.bounds;
    const size = Math.max(b.maxx - b.minx, b.maxy - b.miny, 1);
    this.cell = size / 200;
    for (const p of this.board.pins) {
      const k = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(p.index);
    }
  }

  // --- transforms ------------------------------------------------------------
  /** Board -> view space (rotation, bottom mirroring, y up). */
  /** In split mode, the half being drawn or hit-tested. */
  private half: 'top' | 'bottom' = 'top';
  /** True while a split-mode pass draws (or tests) one half only. */
  private inHalf = false;
  get split() {
    return this.side === 'split';
  }
  /** The side the transforms use right now. */
  private eff(): 'top' | 'bottom' | 'both' {
    return this.side === 'split' ? this.half : this.side;
  }
  /** Run fn once per half in split mode (once otherwise). */
  private eachHalf(fn: () => void) {
    if (!this.split) { fn(); return; }
    const keep = this.half;
    this.inHalf = true;
    for (const h of ['top', 'bottom'] as const) { this.half = h; fn(); }
    this.inHalf = false;
    this.half = keep;
  }
  private withHalf<T>(h: 'top' | 'bottom', fn: () => T): T {
    const keep = this.half, was = this.inHalf;
    this.half = h;
    this.inHalf = true;
    try { return fn(); } finally { this.half = keep; this.inHalf = was; }
  }
  /** Which half a screen x falls in (split mode). */
  halfAt(sx: number): 'top' | 'bottom' {
    return sx < this.ox ? 'top' : 'bottom';
  }
  private halfOf(p: any): 'top' | 'bottom' {
    return p && p.side === 'bottom' ? 'bottom' : 'top';
  }
  /** Distance of each half's centre from the middle, in view units. */
  private splitOff() {
    const b = this.board.bounds;
    const r = ((this.rotation % 360) + 360) % 360;
    const w = r === 90 || r === 270 ? b.maxy - b.miny : b.maxx - b.minx;
    return (w / 2) * 1.12 + Math.max(b.maxx - b.minx, b.maxy - b.miny) * 0.01;
  }
  private toView(x: number, y: number): Pt {
    let dx = x - this.cx;
    let dy = -(y - this.cy);
    if (this.eff() === 'bottom') dx = -dx;
    const r = ((this.rotation % 360) + 360) % 360;
    if (r === 90) [dx, dy] = [-dy, dx];
    else if (r === 180) [dx, dy] = [-dx, -dy];
    else if (r === 270) [dx, dy] = [dy, -dx];
    if (this.split) dx += this.half === 'top' ? -this.splitOff() : this.splitOff();
    return { x: dx, y: dy };
  }
  private fromView(vx: number, vy: number): Pt {
    let dx = vx, dy = vy;
    if (this.split) dx -= this.half === 'top' ? -this.splitOff() : this.splitOff();
    const r = ((this.rotation % 360) + 360) % 360;
    if (r === 90) [dx, dy] = [dy, -dx];
    else if (r === 180) [dx, dy] = [-dx, -dy];
    else if (r === 270) [dx, dy] = [-dy, dx];
    if (this.eff() === 'bottom') dx = -dx;
    return { x: dx + this.cx, y: -dy + this.cy };
  }
  toScreen(x: number, y: number): Pt {
    const v = this.toView(x, y);
    return { x: v.x * this.scale + this.ox, y: v.y * this.scale + this.oy };
  }
  toBoard(sx: number, sy: number): Pt {
    if (this.split && !this.inHalf) return this.withHalf(this.halfAt(sx), () => this.toBoard(sx, sy));
    return this.fromView((sx - this.ox) / this.scale, (sy - this.oy) / this.scale);
  }
  /** Screen point of a pin or part on whichever half shows it. */
  toScreenOn(p: any, x: number, y: number): Pt {
    if (this.split && !this.inHalf) return this.withHalf(this.halfOf(p), () => this.toScreen(x, y));
    return this.toScreen(x, y);
  }

  fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const b = this.board.bounds;
    const corners: Pt[] = [];
    const add = () => corners.push(this.toView(b.minx, b.miny), this.toView(b.maxx, b.maxy));
    if (this.split) { this.withHalf('top', add); this.withHalf('bottom', add); } else add();
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    const vw = Math.max(...xs) - Math.min(...xs) || 1;
    const vh = Math.max(...ys) - Math.min(...ys) || 1;
    const topPad = this.split ? 22 : 0;
    const fw = this.notesReserve && w > this.notesReserve * 2 ? w - this.notesReserve : w;
    this.scale = Math.min(fw / vw, (h - topPad) / vh) * 0.92;
    this.ox = fw / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * this.scale;
    this.oy = h / 2 + topPad / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * this.scale;
    this.invalidate();
    this.fitted = true;
  }

  /** The view is still the whole-board fit (nothing zoomed or panned since). */
  private fitted = false;
  private lastSize = { w: 0, h: 0 };

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toBoard(sx, sy);
    this.scale = Math.min(Math.max(this.scale * factor, 1e-4), 1e4);
    const after = this.toScreen(before.x, before.y);
    this.ox += sx - after.x;
    this.oy += sy - after.y;
    this.fitted = false;
    this.invalidate();
  }

  pan(dx: number, dy: number) {
    this.ox += dx;
    this.oy += dy;
    this.fitted = false;
    this.invalidate();
  }

  /** Center and zoom on a set of board points. */
  /** Space covered by the info panel on the left, so zooms centre in the free area. */
  insetLeft = 0;
  zoomTo(points: Pt[], pad = 4) {
    if (!points.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      const v = this.split ? this.withHalf(this.halfOf(p), () => this.toView(p.x, p.y)) : this.toView(p.x, p.y);
      x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y);
    }
    const inset = this.canvas.clientWidth > this.insetLeft * 2.2 ? this.insetLeft : 0;
    const w = this.canvas.clientWidth - inset, h = this.canvas.clientHeight;
    const b = this.board.bounds;
    const minSpan = Math.max(b.maxx - b.minx, b.maxy - b.miny) / 25;
    const span = Math.max(x1 - x0, y1 - y0, minSpan) * (1 + pad / 10);
    this.scale = Math.min(w, h) / span;
    this.ox = inset + w / 2 - ((x0 + x1) / 2) * this.scale;
    this.oy = h / 2 - ((y0 + y1) / 2) * this.scale;
    this.fitted = false;
    this.invalidate();
  }

  /** Centre on one board point keeping the zoom (stepping through a net's pins). */
  centerOn(p: Pt, minScale = 0) {
    if (minScale && this.scale < minScale) this.scale = minScale;
    const v = this.split ? this.withHalf(this.halfOf(p), () => this.toView(p.x, p.y)) : this.toView(p.x, p.y);
    const inset = this.canvas.clientWidth > this.insetLeft * 2.2 ? this.insetLeft : 0;
    this.ox = inset + (this.canvas.clientWidth - inset) / 2 - v.x * this.scale;
    this.oy = this.canvas.clientHeight / 2 - v.y * this.scale;
    this.fitted = false;
    this.invalidate();
  }

  visible(side: string) {
    if (this.split && !this.inHalf) return true;
    const e = this.eff();
    return e === 'both' || side === 'both' || side === e;
  }

  setLayers(l: Set<LayerId>) {
    this.layers = new Set(l);
    this.invalidate();
  }

  /** Board coordinates at the canvas centre and board units per screen pixel. */
  viewState() {
    const c = this.toBoard(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    return { cx: c.x, cy: c.y, upp: 1 / this.scale };
  }

  /** Centre the view on board point (cx, cy) at the given units-per-pixel. */
  setViewState(cx: number, cy: number, upp: number) {
    this.scale = 1 / upp;
    this.ox = 0;
    this.oy = 0;
    const s = this.toScreen(cx, cy);
    this.ox = this.canvas.clientWidth / 2 - s.x;
    this.oy = this.canvas.clientHeight / 2 - s.y;
    this.fitted = false;
    this.invalidate();
  }

  /** Diode-map labels: each net's shop values, written in a column beside the board with a leader line to one of its pads. */
  notes: { net: string; text: string }[] = [];
  private notesKey = '';
  setNotes(n: { net: string; text: string }[]) {
    this.notes = n;
    this.notesKey = n.map((x) => x.net + '=' + x.text).join(';');
    // Room on the right for the label column (Consolas 13px is about 7.2 px a character).
    this.notesReserve = n.length ? Math.max(...n.map((x) => (x.net.length + x.text.length + 2) * 7.3)) + 64 : 0;
    this.invalidate();
  }
  /** Pixels kept free on the right of the board for the diode-map labels. */
  notesReserve = 0;
  /** Screen boxes of the drawn labels, for clicks (net per label). */
  noteBoxes: { net: string; x: number; y: number; w: number; h: number }[] = [];
  noteAt(sx: number, sy: number) {
    const b = this.noteBoxes.find((n) => sx >= n.x && sx <= n.x + n.w && sy >= n.y && sy <= n.y + n.h);
    return b ? b.net : null;
  }

  private drawNotes(ctx: CanvasRenderingContext2D) {
    this.noteBoxes = [];
    if (!this.notes.length) return;
    const board = this.board;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // Board's screen box (both halves in split mode).
    const b = board.bounds;
    const xs: number[] = [], ys: number[] = [];
    const addBox = () => { for (const [x, y] of [[b.minx, b.miny], [b.maxx, b.maxy], [b.minx, b.maxy], [b.maxx, b.miny]]) { const q = this.toScreen(x, y); xs.push(q.x); ys.push(q.y); } };
    if (this.split) { this.withHalf('top', addBox); this.withHalf('bottom', addBox); } else addBox();
    const right = Math.max(...xs);
    ctx.save();
    ctx.font = '600 13px Consolas, monospace';
    const widest = Math.max(...this.notes.map((n) => ctx.measureText(n.net + '  ' + n.text).width));
    const colX = Math.min(right + 48, w - widest - 10);
    // One anchor pad per net: a pad on a 2-pin part (decoupling cap) on a side we show, else any shown pad.
    const items: { net: string; text: string; ax: number; ay: number; y: number }[] = [];
    for (const n of this.notes) {
      const list: number[] = board.nets.get(n.net) || [];
      let best: any = null, bestScore = -Infinity;
      for (const i of list) {
        const pin = board.pins[i];
        const part = board.parts[pin.part];
        const shown = this.split ? true : this.visible(pin.side);
        if (!shown) continue;
        const s2 = this.toScreenOn(pin, pin.x, pin.y);
        if (s2.x < 0 || s2.y < 0 || s2.x > w || s2.y > h) continue;
        const score = (part && part.pins.length === 2 ? 1000 : 0) + s2.x * 0.5;
        if (score > bestScore) { bestScore = score; best = s2; }
      }
      if (best) items.push({ net: n.net, text: n.text, ax: best.x, ay: best.y, y: best.y });
    }
    items.sort((a, c) => a.ay - c.ay);
    const gap = 19;
    for (let i = 0; i < items.length; i++) items[i].y = Math.max(items[i].ay, i ? items[i - 1].y + gap : 14);
    // Pull the column back up if it runs off the bottom.
    const over = items.length ? items[items.length - 1].y - (h - 10) : 0;
    if (over > 0) for (let i = items.length - 1; i >= 0; i--) items[i].y = Math.max(14 + i * gap, Math.min(items[i].y - over, i < items.length - 1 ? items[i + 1].y - gap : Infinity));
    const line = this.opts.look === 'real' ? '#ff5a4a' : '#ff3b3b';
    for (const it of items) {
      const lit = this.sel.net === it.net;
      ctx.strokeStyle = lit ? COLORS.pinNet : line;
      ctx.lineWidth = lit ? 2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(it.ax, it.ay);
      ctx.lineTo(colX - 18, it.y);
      ctx.lineTo(colX - 4, it.y);
      ctx.stroke();
      ctx.strokeRect(it.ax - 4, it.ay - 4, 8, 8);
      ctx.textBaseline = 'middle';
      const label = it.net + '  ' + it.text;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(colX - 2, it.y - 9, tw + 6, 18);
      ctx.fillStyle = lit ? COLORS.pinNet : '#ff6b5e';
      ctx.fillText(it.net, colX + 1, it.y);
      ctx.fillStyle = lit ? COLORS.pinNet : '#ffd7d2';
      ctx.fillText(it.text, colX + 1 + ctx.measureText(it.net + '  ').width, it.y);
      this.noteBoxes.push({ net: it.net, x: colX - 2, y: it.y - 9, w: tw + 6, h: 18 });
    }
    ctx.restore();
  }

  /** Nets on a traced path or rail, drawn in cyan. */
  highlight = new Set<string>();
  private highlightParts = new Set<number>();
  setHighlight(nets: Iterable<string>) {
    this.highlight = new Set(nets);
    this.highlightParts = new Set();
    for (const n of this.highlight) for (const i of this.board.nets.get(n) || []) this.highlightParts.add(this.board.pins[i].part);
    this.invalidate();
  }

  setSelection(sel: Selection) {
    this.sel = sel;
    this.netParts = new Set();
    if (sel.net && this.board.nets.has(sel.net)) for (const i of this.board.nets.get(sel.net)) this.netParts.add(this.board.pins[i].part);
    this.invalidate();
  }

  // --- hit testing -----------------------------------------------------------
  pinAt(sx: number, sy: number): number | null {
    if (this.split && !this.inHalf) return this.withHalf(this.halfAt(sx), () => this.pinAt(sx, sy));
    const p = this.toBoard(sx, sy);
    const cx = Math.floor(p.x / this.cell), cy = Math.floor(p.y / this.cell);
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const list = this.grid.get(`${cx + i},${cy + j}`);
        if (!list) continue;
        for (const idx of list) {
          const pin = this.board.pins[idx];
          if (!this.visible(pin.side)) continue;
          const d = Math.hypot(pin.x - p.x, pin.y - p.y);
          const inPad = pin.pw > 0 && inRect({ cx: pin.x, cy: pin.y, w: pin.pw, h: pin.ph, a: pin.pa || 0 }, p.x, p.y, 2 / this.scale);
          const tol = Math.max(pin.r * 1.1, 4 / this.scale);
          if ((inPad || d <= tol) && d < bestD) { bestD = d; best = idx; }
        }
      }
    return best;
  }

  partAt(sx: number, sy: number): number | null {
    if (this.split && !this.inHalf) return this.withHalf(this.halfAt(sx), () => this.partAt(sx, sy));
    const p = this.toBoard(sx, sy);
    let best: number | null = null;
    let bestA = Infinity;
    for (const part of this.board.parts) {
      const b = part.bbox;
      if (!b || part.testpoint || !this.visible(part.side)) continue;
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      const inside = part.body ? inRect(part.body, p.x, p.y, 1 / this.scale) : true;
      if (!inside) continue;
      const a = part.body ? part.body.w * part.body.h : (b.x1 - b.x0) * (b.y1 - b.y0);
      if (a < bestA) { bestA = a; best = part.index; }
    }
    return best;
  }

  // --- drawing -------------------------------------------------------------
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    // Panels shown or hidden: a fitted board refits to the new size, otherwise
    // the same spot stays in the middle.
    const was = this.lastSize;
    if (w && h) this.lastSize = { w, h };
    if (w && h && was.w && was.h && (w !== was.w || h !== was.h)) {
      if (this.fitted) this.fit();
      else { this.ox += (w - was.w) / 2; this.oy += (h - was.h) / 2; }
    }
    this.baseKey = '';
    this.invalidate();
  }

  private key() {
    const s = this.sel;
    return [this.scale, this.ox, this.oy, this.side, this.rotation, this.opts.look, this.opts.mask, this.opts.xray, this.opts.netNames,
      s.part, s.pin, s.net, [...this.layers].join(','), [...this.highlight].join(','), document.documentElement.dataset.theme,
      this.canvas.width, this.canvas.height, (this.board.traces || []).length, this.notesKey].join('|');
  }

  draw() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    pickColors(this.opts.look);
    const k = this.key();
    if (k !== this.baseKey) {
      if (this.base.width !== this.canvas.width || this.base.height !== this.canvas.height) {
        this.base.width = this.canvas.width;
        this.base.height = this.canvas.height;
      }
      const bctx = this.base.getContext('2d')!;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawStatic(bctx);
      this.baseKey = k;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDynamic(ctx);
  }

  private inView(s: Pt, m = 50) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return s.x > -m && s.y > -m && s.x < w + m && s.y < h + m;
  }

  /** Screen polygon of an oriented board rectangle. */
  private quad(r: { cx: number; cy: number; w: number; h: number; a: number }): Pt[] {
    return rectCorners(r).map((q) => this.toScreen(q.x, q.y));
  }

  private addPoly(path: Path2D, q: Pt[]) {
    path.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) path.lineTo(q[i].x, q[i].y);
    path.closePath();
  }

  private addPad(path: Path2D, pin: any, grow = 0) {
    const s = this.toScreen(pin.x, pin.y);
    const pw = pin.pw * this.scale + grow * 2, ph = pin.ph * this.scale + grow * 2;
    const minSz = 1.2;
    if (pin.shape === 'round' || Math.max(pw, ph) < 3) {
      const r = Math.max(Math.max(pw, ph) / 2, minSz);
      path.moveTo(s.x + r, s.y);
      path.arc(s.x, s.y, r, 0, Math.PI * 2);
      return;
    }
    // Rotated rectangle in screen space: build from board corners so mirroring/rotation are right.
    const q = this.quad({ cx: pin.x, cy: pin.y, w: Math.max(pin.pw + (grow * 2) / this.scale, minSz / this.scale), h: Math.max(pin.ph + (grow * 2) / this.scale, minSz / this.scale), a: pin.pa || 0 });
    this.addPoly(path, q);
  }

  private drawOutline(ctx: CanvasRenderingContext2D, fill: boolean) {
    const board = this.board;
    const polys: Pt[][] = board.outlinePolys || [];
    const path = new Path2D();
    if (polys.length) {
      for (const poly of polys) this.addPoly(path, poly.map((p) => this.toScreen(p.x, p.y)));
    } else {
      const b = board.bounds;
      this.addPoly(path, [this.toScreen(b.minx, b.miny), this.toScreen(b.maxx, b.miny), this.toScreen(b.maxx, b.maxy), this.toScreen(b.minx, b.maxy)]);
    }
    if (fill) {
      const m = MASKS[this.opts.mask];
      ctx.fillStyle = m.fill;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1.6;
      ctx.stroke(path);
    } else {
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1.2;
      ctx.stroke(path);
    }
    // Loose segments that did not chain (slots, notes) as thin lines.
    if (!polys.length && board.outlineSegments.length) {
      ctx.beginPath();
      for (const [a, b] of board.outlineSegments) {
        const s1 = this.toScreen(a.x, a.y), s2 = this.toScreen(b.x, b.y);
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
      }
      ctx.strokeStyle = fill ? MASKS[this.opts.mask].edge : COLORS.outline;
      ctx.stroke();
    }
  }

  private drawCopper(ctx: CanvasRenderingContext2D) {
    const board = this.board;
    const traces: any[] = board.traces || [];
    if (!traces.length) return;
    const by: Record<string, any[]> = { top: [], bottom: [], inner: [], shop: [] };
    for (const t of traces) (t.src === 'shop' ? by.shop : by[t.side] || by.top).push(t);
    this.strokeTraces(ctx, by.inner, COLORS.copperInner, 0.35, 0.8);
    const cur = this.eff() === 'bottom' ? 'bottom' : 'top';
    const under = cur === 'bottom' ? 'top' : 'bottom';
    if (!this.split) this.strokeTraces(ctx, by[under], under === 'top' ? COLORS.copperTop : COLORS.copperBottom, 0.3, 0.8);
    this.strokeTraces(ctx, by[cur], cur === 'bottom' ? COLORS.copperBottom : COLORS.copperTop, 0.6, 0.8);
    this.strokeTraces(ctx, by.shop, COLORS.shop, 0.9, 2);
    const vias: any[] = board.vias || [];
    if (vias.length && this.scale * (vias[0].r || 1) > 0.8) {
      ctx.save();
      ctx.strokeStyle = COLORS.copperTop;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const v of vias) { const sv = this.toScreen(v.x, v.y); const r = Math.max(v.r * this.scale, 1.5); ctx.moveTo(sv.x + r, sv.y); ctx.arc(sv.x, sv.y, r, 0, Math.PI * 2); }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawLayerNets(ctx: CanvasRenderingContext2D) {
    if (!this.layers.size) return;
    const side = this.eff();
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.75;
    ctx.setLineDash([6, 4]);
    for (const [net, layer] of this.netLayer) {
      if (!layer || layer === 'gnd' || !this.layers.has(layer)) continue;
      const real = this.realByNet.get(net);
      if (real) { ctx.setLineDash([]); this.strokeTraces(ctx, real, LAYER_BY_ID[layer].color, 0.85, 1.4); ctx.setLineDash([6, 4]); continue; }
      const segs = netSegments(this.board, net, side);
      if (!segs.length) continue;
      ctx.strokeStyle = LAYER_BY_ID[layer].color;
      ctx.beginPath();
      for (const sg of segs) {
        const a = this.toScreen(sg.x1, sg.y1), b = this.toScreen(sg.x2, sg.y2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Is part on screen and on a side we draw? ('ghost' = other side for x-ray). */
  private partState(part: any): 'show' | 'ghost' | 'pads' | null {
    if (!part.bbox || part.testpoint) return null;
    const b = part.bbox;
    const c1 = this.toScreen(b.x0, b.y0), c2 = this.toScreen(b.x1, b.y1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    if (x > w || y > h || Math.max(c1.x, c2.x) < 0 || Math.max(c1.y, c2.y) < 0) return null;
    if (this.visible(part.side)) return 'show';
    if (part.type === 'th' || part.pins.some((i: number) => this.board.pins[i].side === 'both')) return 'pads';
    return this.opts.xray ? 'ghost' : null;
  }

  /** Draw a set of parts (bodies, pads, labels) in the current look. */
  private drawParts(ctx: CanvasRenderingContext2D, list: number[], mode: 'normal' | 'focus') {
    const board = this.board;
    const real = this.opts.look === 'real';
    const repair = this.opts.look === 'repair';
    const shields = new Path2D();
    const ghosts: any[] = [];
    const shown: any[] = [];
    for (const i of list) {
      const part = board.parts[i];
      const st = this.partState(part);
      if (st === 'show' || st === 'pads') shown.push(part);
      if ((st === 'ghost' || st === 'pads') && mode === 'normal' && this.opts.xray) ghosts.push(part);
    }
    // X-ray: other side bodies as faint outlines.
    if (ghosts.length) {
      const g = new Path2D();
      for (const part of ghosts) if (part.body) this.addPoly(g, this.quad(part.body));
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = real ? 'rgba(255,255,255,0.22)' : COLORS.partHull;
      ctx.lineWidth = 1;
      ctx.stroke(g);
      ctx.restore();
    }
    if (!shown.length) return;

    const padsUnder = new Path2D(); // chip pads (bodies sit on them)
    const padsOver = new Path2D();
    const padsNC = new Path2D();
    const holes: [number, number, number][] = [];
    const bodies = new Map<string, Path2D>();
    const caps = new Path2D();
    const marks = new Path2D();
    const hulls = new Path2D();
    const labels: { text: string; x: number; y: number; w: number; h: number; ang: number; color: string }[] = [];
    const scale = this.scale;
    for (const part of shown) {
      const chip = part.pkg === 'chip';
      const bodyScreen = part.body ? this.quad(part.body) : null;
      const bw = part.body ? part.body.w * scale : 0, bh = part.body ? part.body.h * scale : 0;
      const tiny = Math.max(bw, bh) < 2.5;
      for (const pi of part.pins) {
        const pin = board.pins[pi];
        if (!this.visible(pin.side)) continue;
        const s = this.toScreen(pin.x, pin.y);
        if (!this.inView(s, 40)) continue;
        const nc = !pin.net || /^(UNCONNECTED|NC)$/i.test(pin.net) || /^NC@/.test(pin.net);
        this.addPad(nc ? padsNC : chip ? padsUnder : padsOver, pin);
        if (pin.drill > 0 && pin.drill * scale > 1.5) holes.push([s.x, s.y, (pin.drill * scale) / 2]);
      }
      if (!bodyScreen || !this.visible(part.side)) continue;
      if (real && !tiny) {
        const kind = part.kind || 'other';
        if (kind === 'shield') {
          this.addPoly(hulls, bodyScreen);
        } else {
          let p = bodies.get(kind);
          if (!p) bodies.set(kind, (p = new Path2D()));
          this.addPoly(p, bodyScreen);
          if (chip && (kind === 'capacitor' || kind === 'resistor' || kind === 'inductor' || kind === 'jumper' || kind === 'fuse' || kind === 'filter')) {
            // Metal end terminations.
            const b = part.body;
            const capL = b.w * 0.17;
            const ca = Math.cos(b.a), sa = Math.sin(b.a);
            for (const sgn of [-1, 1]) {
              const cx = b.cx + sgn * (b.w / 2 - capL / 2) * ca, cy = b.cy + sgn * (b.w / 2 - capL / 2) * sa;
              this.addPoly(caps, this.quad({ cx, cy, w: capL, h: b.h, a: b.a }));
            }
          }
          if (chip && kind === 'diode') {
            const b = part.body;
            const ca = Math.cos(b.a), sa = Math.sin(b.a);
            const cx = b.cx - b.w * 0.28 * ca, cy = b.cy - b.w * 0.28 * sa;
            this.addPoly(marks, this.quad({ cx, cy, w: b.w * 0.1, h: b.h * 0.9, a: b.a }));
          }
          if (part.pin1 != null && Math.min(bw, bh) > 10) {
            const p1 = board.pins[part.pin1];
            // Dot in the body corner nearest pin 1 (outside the ball grid on BGAs).
            const b = part.body;
            const m = Math.min(b.w, b.h) * 0.09;
            const dx = p1.x - b.cx, dy = p1.y - b.cy;
            const ca = Math.cos(-b.a), sa = Math.sin(-b.a);
            const lx = Math.sign(dx * ca - dy * sa || 1) * (b.w / 2 - m), ly = Math.sign(dx * sa + dy * ca || 1) * (b.h / 2 - m);
            const cb = Math.cos(b.a), sb = Math.sin(b.a);
            const s = this.toScreen(b.cx + lx * cb - ly * sb, b.cy + lx * sb + ly * cb);
            const r = Math.min(Math.max(Math.min(bw, bh) * 0.035, 1.5), 5);
            marks.moveTo(s.x + r, s.y);
            marks.arc(s.x, s.y, r, 0, Math.PI * 2);
          }
        }
      } else if (repair) {
        // Repair look: only shields, connectors and ICs get an outline (teal), like the repair tools.
        const kind = part.kind || 'other';
        if (kind === 'shield' || kind === 'connector' || ((kind === 'ic' || part.pkg === 'bga' || part.pkg === 'quad') && Math.max(bw, bh) > 6)) this.addPoly(kind === 'shield' ? shields : hulls, bodyScreen);
      } else {
        this.addPoly(hulls, bodyScreen);
      }
      // Label
      if (Math.max(bw, bh) > 18 && this.visible(part.side)) {
        const sp = this.toScreen(part.body.cx, part.body.cy);
        const a = this.quad(part.body);
        const ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
        const kind = part.kind || 'other';
        const color = real ? (kind === 'shield' ? MASKS[this.opts.mask].label : BODY[kind]?.text || '#e6e9ec') : COLORS.label;
        // A shield's name stays small: it labels the can, not the parts under it.
        labels.push({ text: part.name, x: sp.x, y: sp.y, w: chip ? bw * 0.46 : bw, h: kind === 'shield' ? Math.min(bh, 16) : bh, ang, color });
      }
    }

    // Pads under bodies (chip passives), then bodies, caps, then the rest of the pads.
    const padFill = real ? COLORS.pad : COLORS.pin;
    ctx.fillStyle = padFill;
    ctx.fill(padsUnder);
    if (real) {
      for (const [kind, p] of bodies) {
        const st = BODY[kind] || BODY.other;
        ctx.fillStyle = st.fill;
        ctx.fill(p);
        ctx.strokeStyle = st.edge;
        ctx.lineWidth = 1;
        ctx.stroke(p);
      }
      ctx.fillStyle = COLORS.endCap;
      ctx.fill(caps);
      ctx.fillStyle = 'rgba(235,238,240,0.75)';
      ctx.fill(marks);
      ctx.save();
      ctx.strokeStyle = BODY.shield.edge;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 3]);
      ctx.stroke(hulls);
      ctx.restore();
    } else {
      ctx.strokeStyle = mode === 'focus' ? COLORS.partNet : COLORS.part;
      ctx.lineWidth = 1;
      ctx.stroke(hulls);
      if (repair) {
        ctx.strokeStyle = '#6fb3a8';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke(shields);
      }
    }
    ctx.fillStyle = padFill;
    ctx.fill(padsOver);
    if (real) {
      ctx.strokeStyle = COLORS.padEdge;
      ctx.lineWidth = 0.6;
      ctx.stroke(padsOver);
    }
    ctx.fillStyle = real ? COLORS.padNC : COLORS.pinNC;
    ctx.fill(padsNC);
    if (holes.length) {
      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      for (const [x, y, r] of holes) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    }
    this.drawLabels(ctx, labels);
  }

  private drawLabels(ctx: CanvasRenderingContext2D, labels: { text: string; x: number; y: number; w: number; h: number; ang: number; color: string }[]) {
    if (!labels.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
      // Fit the name inside the body, along its longer side (OBV fits 70% of the box).
      let ang = l.ang;
      let along = l.w, across = l.h;
      if (l.h > l.w * 1.15) { ang += Math.PI / 2; along = l.h; across = l.w; }
      while (ang > Math.PI / 2) ang -= Math.PI;
      while (ang <= -Math.PI / 2) ang += Math.PI;
      ctx.font = `600 10px Segoe UI, system-ui, sans-serif`;
      const tw = ctx.measureText(l.text).width / 10;
      const fs = Math.min((along * 0.78) / tw, across * 0.62, 28);
      if (fs < 6) continue;
      ctx.font = `600 ${fs}px Segoe UI, system-ui, sans-serif`;
      ctx.translate(l.x, l.y);
      ctx.rotate(ang);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 0, 0);
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    }
    ctx.restore();
  }

  /** Test points (dummy parts) as round pads. */
  private drawTestPoints(ctx: CanvasRenderingContext2D) {
    const p = new Path2D();
    for (const part of this.board.parts) {
      if (!part.testpoint) continue;
      for (const i of part.pins) {
        const pin = this.board.pins[i];
        if (!this.visible(pin.side)) continue;
        const s = this.toScreen(pin.x, pin.y);
        if (!this.inView(s, 20)) continue;
        this.addPad(p, pin);
      }
    }
    ctx.fillStyle = this.opts.look === 'real' ? '#c9a646' : COLORS.testpoint;
    ctx.fill(p);
    if (this.opts.look === 'real') { ctx.strokeStyle = COLORS.testpoint; ctx.lineWidth = 1; ctx.stroke(p); }
  }

  /** Pin numbers and net names written on pads when there is room (pads big enough). */
  private drawPinText(ctx: CanvasRenderingContext2D, pins: any[], withNet: boolean, color?: string) {
    const out: [string, string, number, number, number][] = [];
    for (const pin of pins) {
      if (!this.visible(pin.side)) continue;
      const part = this.board.parts[pin.part];
      if (part && !part.testpoint && !this.visible(part.side) && pin.side !== 'both') continue;
      const s = this.toScreen(pin.x, pin.y);
      if (!this.inView(s, 0)) continue;
      const sz = Math.min(pin.pw, pin.ph) * this.scale;
      if (sz < 11) continue;
      out.push([pin.snum || pin.name || '', withNet && sz > 22 ? (pin.net || '') : '', s.x, s.y, sz]);
      if (out.length > 2500) return;
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [num, net, x, y, sz] of out) {
      const fs = Math.min(sz * 0.42, 14);
      ctx.font = `600 ${fs}px Consolas, monospace`;
      ctx.fillStyle = color || '#151515';
      if (net && !/^NC@/.test(net)) {
        ctx.fillText(num, x, y - fs * 0.55);
        const nfs = Math.min(fs * 0.85, (sz * 0.95) / Math.max(net.length * 0.6, 1));
        if (nfs >= 5) { ctx.font = `${nfs}px Consolas, monospace`; ctx.fillText(net, x, y + fs * 0.5); }
      } else ctx.fillText(num, x, y);
    }
    ctx.restore();
  }

  private drawStatic(ctx: CanvasRenderingContext2D) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    this.eachHalf(() => this.drawBase(ctx));
    if (this.split) this.drawHalfTitles(ctx);
    const s = this.sel;
    const focusNet = s.net && this.board.nets.has(s.net) ? s.net : null;
    if (!(focusNet || s.part != null || this.highlight.size)) { this.drawNotes(ctx); return; }
    ctx.fillStyle = COLORS.scrim;
    ctx.fillRect(0, 0, w, h);
    this.eachHalf(() => this.drawFocus(ctx, focusNet));
    this.drawNotes(ctx);
  }

  /** "TOP" / "BOTTOM (mirrored)" over each half in split mode. */
  private drawHalfTitles(ctx: CanvasRenderingContext2D) {
    const b = this.board.bounds;
    ctx.save();
    ctx.font = '600 12px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.opts.look === 'repair' ? '#4fd1c5' : COLORS.label;
    for (const h of ['top', 'bottom'] as const) {
      const pts = this.withHalf(h, () => [this.toScreen(b.minx, b.miny), this.toScreen(b.maxx, b.maxy), this.toScreen(b.minx, b.maxy), this.toScreen(b.maxx, b.miny)]);
      const x = (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2;
      const y = Math.min(...pts.map((q) => q.y)) - 6;
      ctx.fillText(h === 'top' ? 'TOP' : 'BOTTOM (mirrored)', x, Math.max(y, 14));
    }
    ctx.restore();
  }

  private drawBase(ctx: CanvasRenderingContext2D) {
    const board = this.board;
    const real = this.opts.look === 'real';
    this.drawOutline(ctx, real);
    this.drawCopper(ctx);
    this.drawLayerNets(ctx);

    // Parts: other side ghosts and everything visible.
    this.drawParts(ctx, this.order, 'normal');
    this.drawTestPoints(ctx);
    if (this.opts.netNames) this.drawPinText(ctx, board.pins, true, real ? '#1a1407' : COLORS.bg);

    // Layer colouring of pins (power layers) on top.
    if (this.layers.size) {
      const byColor = new Map<string, Path2D>();
      for (const pin of board.pins) {
        if (!pin.net || !this.visible(pin.side)) continue;
        const l = this.netLayer.get(pin.net);
        if (!l || !this.layers.has(l)) continue;
        const s = this.toScreen(pin.x, pin.y);
        if (!this.inView(s)) continue;
        const c = LAYER_BY_ID[l].color;
        let p = byColor.get(c);
        if (!p) byColor.set(c, (p = new Path2D()));
        this.addPad(p, pin);
      }
      for (const [c, p] of byColor) { ctx.fillStyle = c; ctx.fill(p); }
    }
  }

  /** Focus: the board is dimmed; redraw what is selected, fully lit. */
  private drawFocus(ctx: CanvasRenderingContext2D, focusNet: string | null) {
    const board = this.board;
    const s = this.sel;
    const lit = new Set<number>();
    if (s.part != null) lit.add(s.part);
    for (const i of this.netParts) if (!board.parts[i]?.testpoint) lit.add(i);
    for (const i of this.highlightParts) if (!board.parts[i]?.testpoint) lit.add(i);
    this.drawParts(ctx, this.order.filter((i) => lit.has(i)), 'focus');

    // Path / rail highlight nets in cyan.
    if (this.highlight.size) {
      const p = new Path2D();
      for (const n of this.highlight) for (const i of board.nets.get(n) || []) { const pin = board.pins[i]; if (this.visible(pin.side)) this.addPad(p, pin, 1); }
      ctx.save();
      ctx.fillStyle = COLORS.path;
      ctx.shadowColor = COLORS.path;
      ctx.shadowBlur = 8;
      ctx.fill(p);
      ctx.restore();
    }
    // Selected part outline glow.
    if (s.part != null && board.parts[s.part]?.body) {
      const part = board.parts[s.part];
      const q = new Path2D();
      this.addPoly(q, this.quad({ ...part.body, w: part.body.w + 2 / this.scale, h: part.body.h + 2 / this.scale }));
      ctx.save();
      ctx.strokeStyle = COLORS.partSel;
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORS.partSel;
      ctx.shadowBlur = 10;
      ctx.stroke(q);
      ctx.restore();
      const pins = part.pins.map((i: number) => board.pins[i]);
      const pp = new Path2D();
      for (const pin of pins) if (this.visible(pin.side) && pin.net !== focusNet) this.addPad(pp, pin);
      ctx.fillStyle = COLORS.pinSelPart;
      ctx.fill(pp);
      this.drawPinText(ctx, pins, true, '#04141a');
    }
    // Net pads: bright, with glow, and outlines on the parts they touch.
    if (focusNet) {
      const pins = (board.nets.get(focusNet) || []).map((i: number) => board.pins[i]);
      const p = new Path2D();
      for (const pin of pins) if (this.visible(pin.side)) this.addPad(p, pin, 0.8);
      ctx.save();
      ctx.fillStyle = COLORS.pinNet;
      ctx.shadowColor = COLORS.pinNetGlow;
      ctx.shadowBlur = 12;
      ctx.fill(p);
      ctx.restore();
      const outl = new Path2D();
      for (const i of this.netParts) {
        const part = board.parts[i];
        if (!part?.body || part.testpoint || !this.visible(part.side) || i === s.part) continue;
        this.addPoly(outl, this.quad(part.body));
      }
      ctx.strokeStyle = COLORS.partNet;
      ctx.lineWidth = 1.4;
      ctx.stroke(outl);
      this.drawPinText(ctx, pins, false, '#ffffff');
    }
    if (s.pin != null) {
      const pin = board.pins[s.pin];
      if (pin && this.visible(pin.side)) {
        const p = new Path2D();
        this.addPad(p, pin, 2);
        ctx.strokeStyle = COLORS.pinSel;
        ctx.lineWidth = 2;
        ctx.stroke(p);
      }
    }
  }

  private drawDynamic(ctx: CanvasRenderingContext2D) {
    let hidden = 0;
    this.eachHalf(() => { hidden += this.drawDynamicHalf(ctx); });
    this.lastHiddenNetPins = this.split ? 0 : hidden;
  }

  private drawDynamicHalf(ctx: CanvasRenderingContext2D): number {
    const board = this.board;
    const t = (performance.now() - this.t0) / 1000;
    const anim = this.layersPulse;
    if (this.highlight.size) for (const n of this.highlight) this.drawRats(ctx, n, COLORS.path, anim ? t : 0, 1.8);
    let hidden = 0;
    const net = this.sel.net;
    if (net && board.nets.has(net)) {
      this.drawRats(ctx, net, COLORS.pinNet, anim ? t : 0, 2.2);
      // Pins of this net on the other side: rings seen "through" the board.
      const k = anim ? 0.5 + 0.5 * Math.sin(t * 4) : 1;
      const ring = new Path2D();
      const halo = new Path2D();
      for (const i of board.nets.get(net) || []) {
        const pin = board.pins[i];
        const s = this.toScreen(pin.x, pin.y);
        if (!this.visible(pin.side)) {
          hidden++;
          if (this.split) continue;
          if (!this.inView(s)) continue;
          const r = Math.max(pin.r * this.scale, 3) + 2;
          ring.moveTo(s.x + r, s.y);
          ring.arc(s.x, s.y, r, 0, Math.PI * 2);
          continue;
        }
        if ((board.nets.get(net) || []).length > 2000 || !this.inView(s)) continue;
        const r = Math.max(pin.r * this.scale, 1.5) + 2 + 3 * k;
        halo.moveTo(s.x + r, s.y);
        halo.arc(s.x, s.y, r, 0, Math.PI * 2);
      }
      ctx.save();
      ctx.strokeStyle = COLORS.pinNet;
      ctx.globalAlpha = 0.25 + 0.5 * k;
      ctx.lineWidth = 1.5;
      ctx.stroke(halo);
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([3, 3]);
      ctx.stroke(ring);
      ctx.restore();
    }
    if (this.hover != null) {
      const pin = board.pins[this.hover];
      if (pin && this.visible(pin.side)) {
        const p = new Path2D();
        this.addPad(p, pin, 2);
        ctx.strokeStyle = COLORS.hover;
        ctx.lineWidth = 1.5;
        ctx.stroke(p);
      }
    }
    return hidden;
  }

  lastHiddenNetPins = 0;

  /** Real copper for the net, or the computed ratsnest, marching. */
  private drawRats(ctx: CanvasRenderingContext2D, net: string, color: string, t: number, width: number) {
    const real = this.realByNet.get(net);
    if (real) { this.strokeTraces(ctx, real, color, 0.65 + 0.3 * Math.sin(t * 4), width); return; }
    const segs = netSegments(this.board, net, this.eff());
    if (!segs.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -t * 28;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const sg of segs) {
      const a = this.toScreen(sg.x1, sg.y1), b = this.toScreen(sg.x2, sg.y2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export { isGroundNet };
