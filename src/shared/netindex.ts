// Full connectivity index for a parsed boardview: every part, pin and net, how
// they connect, and paths between them through series parts. Everything here is
// read from the file; nothing is guessed except the part type, which comes from
// the reference designator prefix (R, C, L, U…) and is labelled as such.

export type PartType = 'resistor' | 'capacitor' | 'inductor' | 'fuse' | 'diode' | 'transistor' | 'ic' | 'connector' | 'crystal' | 'filter' | 'jumper' | 'testpoint' | 'switch' | 'other';

const TYPE_RULES: [RegExp, PartType][] = [
  [/^(TP|PP|TEST)/i, 'testpoint'],
  [/^(FB|FL|EMI|BEAD)/i, 'filter'],
  [/^(JP|XW|SJ|ZR|R0)/i, 'jumper'],
  [/^(RN|RA|R)\d/i, 'resistor'],
  [/^(CN|J|CON|CONN|P)\d/i, 'connector'],
  [/^(C|EC|TC)\d/i, 'capacitor'],
  [/^(L|PL)\d/i, 'inductor'],
  [/^(F|FU|PF)\d/i, 'fuse'],
  [/^(D|ZD|VD|LED|TVS|VR)\d/i, 'diode'],
  [/^(Q|T|M)\d/i, 'transistor'],
  [/^(U|IC|N)\d/i, 'ic'],
  [/^(Y|X|XTAL|G)\d/i, 'crystal'],
  [/^(SW|S|K)\d/i, 'switch'],
];

export function partType(name: string, pinCount = 0): PartType {
  for (const [re, t] of TYPE_RULES) if (re.test(name)) return t;
  if (pinCount >= 8) return 'ic';
  return 'other';
}

export const TYPE_LABEL: Record<PartType, string> = {
  resistor: 'Resistor', capacitor: 'Capacitor', inductor: 'Inductor / coil', fuse: 'Fuse', diode: 'Diode / TVS', transistor: 'Transistor / MOSFET',
  ic: 'IC', connector: 'Connector', crystal: 'Crystal / oscillator', filter: 'Ferrite / filter', jumper: 'Jumper / 0 Ω', testpoint: 'Test point', switch: 'Switch', other: 'Other',
};

/** Types that pass DC from one pin to the other, so a rail continues through them. */
const SERIES: Set<PartType> = new Set(['resistor', 'inductor', 'fuse', 'filter', 'jumper', 'diode']);

export function isGround(net: string) {
  return /^(A|D|P|S)?GND\b|^GND|^VSS|_GND$|^GROUND/i.test(net);
}
const NC = /^(NC|N\/C|UNCONNECTED|NOCONNECT)$/i;

export interface NetInfo {
  name: string;
  pins: number;
  parts: string[];
  ground: boolean;
  /** Capacitors from this net to ground (decoupling): a hint the net is a supply rail. */
  caps: number;
  /** Series parts on this net and the net on their other pin. */
  through: { part: string; type: PartType; other: string }[];
  ics: string[];
  rail: boolean;
}

export interface PartInfo {
  name: string;
  index: number;
  type: PartType;
  side: string;
  pins: { pin: string; net: string }[];
  nets: string[];
  mfgcode?: string;
}

export interface BoardIndex {
  nets: Map<string, NetInfo>;
  parts: Map<string, PartInfo>;
  stats: { parts: number; pins: number; nets: number; ncPins: number; singlePinNets: number; groundNets: string[]; byType: Record<string, number> };
  /** Net-to-net edges through series parts. */
  edges: Map<string, { part: string; type: PartType; other: string }[]>;
}

const cache = new WeakMap<object, BoardIndex>();

export function indexBoard(board: any): BoardIndex {
  const hit = cache.get(board);
  if (hit) return hit;
  const parts = new Map<string, PartInfo>();
  const byType: Record<string, number> = {};
  let ncPins = 0;
  for (const p of board.parts) {
    if (!p || p.name?.startsWith('...')) continue;
    const pins = p.pins.map((i: number) => {
      const pin = board.pins[i];
      if (!pin.net || NC.test(pin.net)) ncPins++;
      return { pin: String(pin.snum || pin.name || i), net: pin.net || '' };
    });
    const type = p.testpoint ? 'testpoint' : partType(p.name, pins.length);
    byType[type] = (byType[type] || 0) + 1;
    const nets = [...new Set(pins.map((x: { net: string }) => x.net).filter((n: string) => n && !NC.test(n)))] as string[];
    // Testpoints in some formats share one name; keep the first and add a suffix to others.
    let key = p.name;
    if (parts.has(key)) key = `${p.name}#${p.index}`;
    parts.set(key, { name: key, index: p.index, type, side: p.side, pins, nets, mfgcode: p.mfgcode || undefined });
  }
  const edges = new Map<string, { part: string; type: PartType; other: string }[]>();
  const addEdge = (a: string, e: { part: string; type: PartType; other: string }) => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a)!.push(e);
  };
  for (const pi of parts.values()) {
    if (!SERIES.has(pi.type) || pi.pins.length !== 2) continue;
    const [a, b] = pi.pins.map((x) => x.net);
    if (!a || !b || a === b || NC.test(a) || NC.test(b)) continue;
    addEdge(a, { part: pi.name, type: pi.type, other: b });
    addEdge(b, { part: pi.name, type: pi.type, other: a });
  }
  const nets = new Map<string, NetInfo>();
  let singlePinNets = 0;
  const groundNets: string[] = [];
  for (const [name, pinIdx] of board.nets as Map<string, number[]>) {
    const partNames = new Set<string>();
    const ics = new Set<string>();
    let caps = 0;
    for (const i of pinIdx) {
      const part = board.parts[board.pins[i].part];
      if (!part || part.testpoint) continue;
      partNames.add(part.name);
      const t = partType(part.name, part.pins.length);
      if (t === 'ic') ics.add(part.name);
      if (t === 'capacitor' && part.pins.length === 2) {
        const other = part.pins.map((j: number) => board.pins[j].net).find((n: string) => n !== name);
        if (other && isGround(other)) caps++;
      }
    }
    const ground = isGround(name);
    if (ground) groundNets.push(name);
    if (pinIdx.length === 1) singlePinNets++;
    nets.set(name, {
      name, pins: pinIdx.length, parts: [...partNames], ground, caps,
      through: edges.get(name) || [], ics: [...ics],
      rail: !ground && (caps >= 2 || /^(V|PP|VDD|VCC|VREG|VBAT|VBUS|VSYS|VPH|LDO|BUCK|AVDD|DVDD)/i.test(name)),
    });
  }
  const idx: BoardIndex = {
    nets, parts, edges,
    stats: { parts: parts.size, pins: board.pins.length, nets: nets.size, ncPins, singlePinNets, groundNets, byType },
  };
  cache.set(board, idx);
  return idx;
}

/** A node in the path tracer: a net, and the series part used to reach it. */
export interface PathStep { net: string; via?: { part: string; type: PartType } }

function startNets(idx: BoardIndex, ref: string): string[] {
  const u = ref.trim();
  const net = [...idx.nets.keys()].find((n) => n.toUpperCase() === u.toUpperCase());
  if (net) return [net];
  const part = [...idx.parts.values()].find((p) => p.name.toUpperCase() === u.toUpperCase());
  if (part) return part.nets.filter((n) => !isGround(n));
  return [];
}

export function resolveRef(idx: BoardIndex, ref: string): { kind: 'net' | 'part'; name: string } | null {
  const u = ref.trim().toUpperCase();
  const net = [...idx.nets.keys()].find((n) => n.toUpperCase() === u);
  if (net) return { kind: 'net', name: net };
  const part = [...idx.parts.keys()].find((n) => n.toUpperCase() === u);
  if (part) return { kind: 'part', name: part };
  return null;
}

/**
 * Shortest DC path between two parts or nets through series parts
 * (resistors, coils, fuses, ferrites, jumpers, diodes). Ground is never crossed.
 * Returns null when the two are not connected that way.
 */
export function findPath(idx: BoardIndex, from: string, to: string, maxDepth = 12): PathStep[] | null {
  const a = startNets(idx, from);
  const goal = new Set(startNets(idx, to));
  if (!a.length || !goal.size) return null;
  const prev = new Map<string, { from: string | null; via?: { part: string; type: PartType } }>();
  let frontier = a;
  for (const n of a) prev.set(n, { from: null });
  for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
    const hit = frontier.find((n) => goal.has(n));
    if (hit) {
      const out: PathStep[] = [];
      let cur: string | null = hit;
      while (cur) {
        const p = prev.get(cur)!;
        out.unshift({ net: cur, via: p.via });
        cur = p.from;
      }
      return out;
    }
    const next: string[] = [];
    for (const n of frontier) {
      for (const e of idx.edges.get(n) || []) {
        if (prev.has(e.other) || isGround(e.other)) continue;
        prev.set(e.other, { from: n, via: { part: e.part, type: e.type } });
        next.push(e.other);
      }
    }
    frontier = next;
  }
  return null;
}

/** Nets reachable from a net through series parts, by distance (the "rail family"). */
export function railFamily(idx: BoardIndex, net: string, maxDepth = 3) {
  const seen = new Map<string, number>([[net, 0]]);
  let frontier = [net];
  for (let d = 1; d <= maxDepth; d++) {
    const next: string[] = [];
    for (const n of frontier)
      for (const e of idx.edges.get(n) || []) {
        if (seen.has(e.other) || isGround(e.other)) continue;
        seen.set(e.other, d);
        next.push(e.other);
      }
    frontier = next;
  }
  return [...seen.entries()].map(([n, d]) => ({ net: n, depth: d }));
}

/** Short text description of a net, used by the info panel and the AI assistant. */
export function describeNet(idx: BoardIndex, net: string) {
  const n = idx.nets.get(net);
  if (!n) return null;
  return {
    name: n.name,
    pins: n.pins,
    parts: n.parts.slice(0, 80),
    partCount: n.parts.length,
    ics: n.ics,
    ground: n.ground,
    likelyRail: n.rail,
    decouplingCaps: n.caps,
    seriesConnections: n.through.map((t) => ({ via: t.part, type: t.type, toNet: t.other })),
  };
}

export function describePart(idx: BoardIndex, name: string) {
  const p = idx.parts.get(name) || [...idx.parts.values()].find((x) => x.name.toUpperCase() === name.toUpperCase());
  if (!p) return null;
  return { name: p.name, type: p.type, typeGuessedFromName: true, side: p.side, mfgcode: p.mfgcode, pins: p.pins.slice(0, 400), pinCount: p.pins.length };
}
