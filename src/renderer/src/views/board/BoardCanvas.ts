// Canvas renderer and hit testing for a parsed boardview.
import { isGroundNet } from '@parsers/index.js';
import { LAYER_BY_ID, layerOfNet, type LayerId } from '@shared/layers';
import { netSegments } from '../../lib/netlines';

export type Side = 'top' | 'bottom' | 'both';
export interface Selection {
  part: number | null;
  pin: number | null;
  net: string | null;
}

interface Pt { x: number; y: number }

const COLORS = {
  bg: '#0b0e12',
  outline: '#7dd3fc',
  part: '#3b4656',
  partSel: '#22d3ee',
  partNet: '#f5a524',
  pin: '#9aa7b8',
  pinGnd: '#4b5d4e',
  pinNC: '#3a4250',
  pinSelPart: '#22d3ee',
  pinNet: '#f5a524',
  pinSel: '#ffffff',
  label: '#cbd5e1',
  testpoint: '#a78bfa',
};

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

  constructor(canvas: HTMLCanvasElement, board: any) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.board = board;
    const b = board.bounds;
    this.cx = (b.minx + b.maxx) / 2;
    this.cy = (b.miny + b.maxy) / 2;
    this.buildGrid();
    for (const net of board.nets.keys()) this.netLayer.set(net, layerOfNet(net));
    // Show the side that has parts first.
    if (!board.parts.some((p: any) => p.side === 'top') && board.parts.some((p: any) => p.side === 'bottom')) this.side = 'bottom';
    const loop = () => {
      if (this.dirty) { this.dirty = false; this.draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  invalidate() {
    this.dirty = true;
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
  private toView(x: number, y: number): Pt {
    let dx = x - this.cx;
    let dy = -(y - this.cy);
    if (this.side === 'bottom') dx = -dx;
    const r = ((this.rotation % 360) + 360) % 360;
    if (r === 90) [dx, dy] = [-dy, dx];
    else if (r === 180) [dx, dy] = [-dx, -dy];
    else if (r === 270) [dx, dy] = [dy, -dx];
    return { x: dx, y: dy };
  }
  private fromView(vx: number, vy: number): Pt {
    let dx = vx, dy = vy;
    const r = ((this.rotation % 360) + 360) % 360;
    if (r === 90) [dx, dy] = [dy, -dx];
    else if (r === 180) [dx, dy] = [-dx, -dy];
    else if (r === 270) [dx, dy] = [-dy, dx];
    if (this.side === 'bottom') dx = -dx;
    return { x: dx + this.cx, y: -dy + this.cy };
  }
  toScreen(x: number, y: number): Pt {
    const v = this.toView(x, y);
    return { x: v.x * this.scale + this.ox, y: v.y * this.scale + this.oy };
  }
  toBoard(sx: number, sy: number): Pt {
    return this.fromView((sx - this.ox) / this.scale, (sy - this.oy) / this.scale);
  }

  fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const b = this.board.bounds;
    const corners = [this.toView(b.minx, b.miny), this.toView(b.maxx, b.maxy)];
    const vw = Math.abs(corners[0].x - corners[1].x) || 1;
    const vh = Math.abs(corners[0].y - corners[1].y) || 1;
    this.scale = Math.min(w / vw, h / vh) * 0.92;
    this.ox = w / 2;
    this.oy = h / 2;
    this.invalidate();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toBoard(sx, sy);
    this.scale = Math.min(Math.max(this.scale * factor, 1e-4), 1e4);
    const after = this.toScreen(before.x, before.y);
    this.ox += sx - after.x;
    this.oy += sy - after.y;
    this.invalidate();
  }

  pan(dx: number, dy: number) {
    this.ox += dx;
    this.oy += dy;
    this.invalidate();
  }

  /** Center and zoom on a set of board points. */
  zoomTo(points: Pt[], pad = 4) {
    if (!points.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      const v = this.toView(p.x, p.y);
      x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y);
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const b = this.board.bounds;
    const minSpan = Math.max(b.maxx - b.minx, b.maxy - b.miny) / 25;
    const span = Math.max(x1 - x0, y1 - y0, minSpan) * (1 + pad / 10);
    this.scale = Math.min(w, h) / span;
    this.ox = w / 2 - ((x0 + x1) / 2) * this.scale;
    this.oy = h / 2 - ((y0 + y1) / 2) * this.scale;
    this.invalidate();
  }

  visible(side: string) {
    return this.side === 'both' || side === 'both' || side === this.side;
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
          const tol = Math.max(pin.r * 1.2, 4 / this.scale);
          if (d <= tol && d < bestD) { bestD = d; best = idx; }
        }
      }
    return best;
  }

  partAt(sx: number, sy: number): number | null {
    const p = this.toBoard(sx, sy);
    let best: number | null = null;
    let bestA = Infinity;
    for (const part of this.board.parts) {
      const b = part.bbox;
      if (!b || part.testpoint || !this.visible(part.side)) continue;
      if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) {
        const a = (b.x1 - b.x0) * (b.y1 - b.y0);
        if (a < bestA) { bestA = a; best = part.index; }
      }
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
    this.invalidate();
  }

  draw() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const board = this.board;

    // Outline
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    board.outline.forEach((p: Pt, i: number) => {
      const s = this.toScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    for (const [a, b] of board.outlineSegments) {
      const s1 = this.toScreen(a.x, a.y), s2 = this.toScreen(b.x, b.y);
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
    }
    ctx.stroke();

    // Colour-coded net lines for the enabled layers (GND only colours pins).
    if (this.layers.size) {
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.75;
      const side = this.side === 'both' ? 'both' : this.side;
      for (const [net, layer] of this.netLayer) {
        if (!layer || layer === 'gnd' || !this.layers.has(layer)) continue;
        const segs = netSegments(board, net, side);
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
      ctx.globalAlpha = 1;
    }

    const inView = (s: Pt, m = 50) => s.x > -m && s.y > -m && s.x < w + m && s.y < h + m;
    const selPart = this.sel.part;
    const selNet = this.sel.net;

    // Parts
    const partLabels: [string, number, number, number][] = [];
    for (const part of board.parts) {
      if (!part.bbox || part.testpoint || !this.visible(part.side)) continue;
      const b = part.bbox;
      const c1 = this.toScreen(b.x0, b.y0), c2 = this.toScreen(b.x1, b.y1);
      const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y), pw = Math.abs(c2.x - c1.x), ph = Math.abs(c2.y - c1.y);
      if (x > w || y > h || x + pw < 0 || y + ph < 0) continue;
      const isSel = part.index === selPart;
      const onNet = this.netParts.has(part.index);
      ctx.strokeStyle = isSel ? COLORS.partSel : onNet ? COLORS.partNet : COLORS.part;
      ctx.lineWidth = isSel ? 2 : 1;
      if (isSel) { ctx.fillStyle = '#22d3ee14'; ctx.fillRect(x, y, pw, ph); }
      if (this.side === 'both' && part.side === 'bottom') ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, pw, ph);
      ctx.setLineDash([]);
      if (Math.max(pw, ph) > 22) partLabels.push([part.name, x + pw / 2, y + ph / 2, Math.min(pw, ph)]);
    }

    // Pins, batched by colour
    const batches = new Map<string, Path2D>();
    const add = (color: string, s: Pt, r: number, square: boolean) => {
      let p = batches.get(color);
      if (!p) batches.set(color, (p = new Path2D()));
      if (square) p.rect(s.x - r, s.y - r, r * 2, r * 2);
      else { p.moveTo(s.x + r, s.y); p.arc(s.x, s.y, r, 0, Math.PI * 2); }
    };
    const pinLabels: [string, number, number, number][] = [];
    const netPinsOtherSide: number[] = [];
    for (const pin of board.pins) {
      if (!this.visible(pin.side)) {
        if (selNet && pin.net === selNet) netPinsOtherSide.push(pin.index);
        continue;
      }
      const s = this.toScreen(pin.x, pin.y);
      if (!inView(s)) continue;
      const r = Math.max(pin.r * this.scale, 1.2);
      const nc = !pin.net || /^(UNCONNECTED|NC)$/i.test(pin.net);
      let color = pin.testpoint ? COLORS.testpoint : nc ? COLORS.pinNC : isGroundNet(pin.net) ? COLORS.pinGnd : COLORS.pin;
      const pl = pin.net ? this.netLayer.get(pin.net) : null;
      if (pl && this.layers.has(pl)) color = LAYER_BY_ID[pl].color;
      if (pin.part === selPart) color = COLORS.pinSelPart;
      if (selNet && pin.net === selNet) color = COLORS.pinNet;
      if (pin.index === this.sel.pin) color = COLORS.pinSel;
      add(color, s, r, false);
      if (r > 7) pinLabels.push([pin.snum || pin.name || '', s.x, s.y, r]);
    }
    for (const [color, path] of batches) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    if (this.hover != null) {
      const pin = board.pins[this.hover];
      const s = this.toScreen(pin.x, pin.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(pin.r * this.scale, 1.2) + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [name, x, y, size] of partLabels) {
      const fs = Math.min(Math.max(size / 4, 9), 22);
      ctx.font = `600 ${fs}px Segoe UI, system-ui, sans-serif`;
      ctx.fillStyle = '#0b0e12cc';
      const tw = ctx.measureText(name).width;
      ctx.fillRect(x - tw / 2 - 2, y - fs / 2 - 1, tw + 4, fs + 2);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(name, x, y);
    }
    if (pinLabels.length < 1500)
      for (const [name, x, y, r] of pinLabels) {
        const fs = Math.min(r * 0.8, 13);
        ctx.font = `${fs}px Consolas, monospace`;
        ctx.fillStyle = '#0b0e12';
        ctx.fillText(name, x, y);
      }

    this.lastHiddenNetPins = netPinsOtherSide.length;
  }

  lastHiddenNetPins = 0;
}
