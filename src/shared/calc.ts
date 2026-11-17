// Bench calculators: SMD resistor and capacitor codes, Ohm's law, dividers.

const EIA96 = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174,
  178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
  316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549,
  562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
];
const EIA96_MULT: Record<string, number> = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1e3, E: 1e4, F: 1e5 };

export interface Decoded {
  ohms: number;
  system: string;
  tolerance: string;
}

/** Decode an SMD resistor marking: 3-digit (472), 4-digit (4702), R notation (4R7, R047) or EIA-96 (01C). */
export function decodeResistor(raw: string): Decoded | null {
  const c = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!c) return null;
  if (/^0+$/.test(c)) return { ohms: 0, system: 'Zero-ohm link', tolerance: 'jumper' };
  let m = /^(\d*)R(\d*)$/.exec(c);
  if (m && (m[1] || m[2])) return { ohms: Number(`${m[1] || '0'}.${m[2] || '0'}`), system: 'R notation (R = decimal point)', tolerance: c.length >= 4 ? '1%' : '5%' };
  m = /^(\d{2})([ZYRXSABHCDEF])$/.exec(c);
  if (m) {
    const i = Number(m[1]);
    if (i < 1 || i > 96) return null;
    return { ohms: round(EIA96[i - 1] * EIA96_MULT[m[2]]), system: `EIA-96 (code ${m[1]} = ${EIA96[i - 1]}, ${m[2]} = ×${EIA96_MULT[m[2]]})`, tolerance: '1%' };
  }
  m = /^(\d{2})(\d)$/.exec(c);
  if (m) return { ohms: round(Number(m[1]) * 10 ** Number(m[2])), system: `3-digit (${m[1]} × 10^${m[2]})`, tolerance: '5%' };
  m = /^(\d{3})(\d)$/.exec(c);
  if (m) return { ohms: round(Number(m[1]) * 10 ** Number(m[2])), system: `4-digit (${m[1]} × 10^${m[2]})`, tolerance: '1%' };
  return null;
}

/** Decode a capacitor code like 104 (pF base) or 4p7 / 2n2 / 1u0. Returns farads. */
export function decodeCapacitor(raw: string): { farads: number; system: string } | null {
  const c = raw.trim().toLowerCase();
  let m = /^(\d+)([pnu])(\d*)$/.exec(c);
  if (m) {
    const mult = { p: 1e-12, n: 1e-9, u: 1e-6 }[m[2] as 'p' | 'n' | 'u'];
    return { farads: Number(`${m[1]}.${m[3] || '0'}`) * mult, system: 'Letter notation (letter = decimal point)' };
  }
  m = /^(\d{2})(\d)$/.exec(c);
  if (m) return { farads: Number(m[1]) * 10 ** Number(m[2]) * 1e-12, system: `3-digit (${m[1]} × 10^${m[2]} pF)` };
  return null;
}

export function round(v: number, sig = 6) {
  if (!isFinite(v) || v === 0) return v;
  return Number(v.toPrecision(sig));
}

/** 4700 -> "4.7 kΩ" */
export function formatSI(v: number, unit: string) {
  if (!isFinite(v)) return '—';
  if (v === 0) return `0 ${unit}`;
  const prefixes: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const a = Math.abs(v);
  for (const [f, p] of prefixes) if (a >= f * 0.9999) return `${round(v / f, 4)} ${p}${unit}`;
  return `${round(v / 1e-12, 4)} p${unit}`;
}

/** Parse "4.7k", "10M", "220", "1.5m" etc. into a number. */
export function parseSI(s: string): number {
  const m = /^\s*(-?[\d.]+)\s*([GMkKmuµunp]?)/.exec(s.replace(',', '.'));
  if (!m) return NaN;
  const f: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
  return Number(m[1]) * f[m[2]];
}

export function divider(vin: number, r1: number, r2: number) {
  return (vin * r2) / (r1 + r2);
}

/** R2 needed for a target Vout with a given R1. */
export function dividerR2(vin: number, vout: number, r1: number) {
  return (vout * r1) / (vin - vout);
}

/** Fill in the missing two of V, I, R, P from any two known values. */
export function ohmsLaw(k: { V?: number; I?: number; R?: number; P?: number }) {
  const has = (x?: number) => x != null && isFinite(x);
  let { V, I, R, P } = k;
  if (has(V) && has(I)) { R = V! / I!; P = V! * I!; }
  else if (has(V) && has(R)) { I = V! / R!; P = (V! * V!) / R!; }
  else if (has(I) && has(R)) { V = I! * R!; P = I! * I! * R!; }
  else if (has(P) && has(V)) { I = P! / V!; R = (V! * V!) / P!; }
  else if (has(P) && has(I)) { V = P! / I!; R = P! / (I! * I!); }
  else if (has(P) && has(R)) { V = Math.sqrt(P! * R!); I = Math.sqrt(P! / R!); }
  else return null;
  return { V: V!, I: I!, R: R!, P: P! };
}

export function series(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export function parallel(values: number[]) {
  const inv = values.reduce((a, b) => a + 1 / b, 0);
  return inv ? 1 / inv : 0;
}
