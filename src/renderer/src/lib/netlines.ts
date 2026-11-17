// "Net lines" for layer overlays: boardview files hold pads and nets but not copper
// traces, so each net is drawn as a short-path chain through its pins (like a ratsnest).
import { layerOfNet, type LayerId } from '@shared/layers';

export interface Seg { x1: number; y1: number; x2: number; y2: number }

const cache = new WeakMap<object, Map<string, Seg[]>>();

/** Minimum spanning tree (Prim) of a net's pins on one side. Nets over 400 pins are skipped. */
export function netSegments(board: any, net: string, side: 'top' | 'bottom' | 'both' = 'both'): Seg[] {
  let m = cache.get(board);
  if (!m) cache.set(board, (m = new Map()));
  const key = `${side}:${net}`;
  const hit = m.get(key);
  if (hit) return hit;
  const pins = (board.nets.get(net) || []).map((i: number) => board.pins[i]).filter((p: any) => side === 'both' || p.side === side || p.side === 'both');
  const segs: Seg[] = [];
  const n = pins.length;
  if (n >= 2 && n <= 400) {
    const inTree = new Array(n).fill(false);
    const dist = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    dist[0] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || dist[i] < dist[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) segs.push({ x1: pins[from[u]].x, y1: pins[from[u]].y, x2: pins[u].x, y2: pins[u].y });
      for (let i = 0; i < n; i++) {
        if (inTree[i]) continue;
        const d = Math.hypot(pins[i].x - pins[u].x, pins[i].y - pins[u].y);
        if (d < dist[i]) { dist[i] = d; from[i] = u; }
      }
    }
  }
  m.set(key, segs);
  return segs;
}

/** Nets of a board grouped by layer. */
export function netsByLayer(board: any): Map<LayerId, string[]> {
  const out = new Map<LayerId, string[]>();
  for (const net of board.nets.keys()) {
    const l = layerOfNet(net);
    if (!l) continue;
    if (!out.has(l)) out.set(l, []);
    out.get(l)!.push(net);
  }
  return out;
}
