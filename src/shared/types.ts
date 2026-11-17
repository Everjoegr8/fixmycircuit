// Types shared by the main process (SQLite) and the renderer.

export type FileKind = 'schematic' | 'boardview' | 'photo' | 'other';

export interface Brand {
  id: number;
  name: string;
}

export interface Model {
  id: number;
  brand_id: number;
  name: string;
}

export interface LibraryFile {
  id: string;
  model_id: number | null;
  kind: FileKind;
  name: string;
  ext: string;
  size: number;
  added_at: string;
  notes: string;
  /** For ASC boards: names of the sibling .asc files stored with it. */
  extra: string;
}

export interface Guide {
  id: number;
  model_id: number | null;
  title: string;
  symptom: string;
  steps: string;
  parts: string;
  nets: string;
  author: string;
  /** Comma-separated photo ids attached to this fault solution. */
  photo_ids: string;
  created_at: string;
  updated_at: string;
}

export type ReadingType = 'diode' | 'voltage' | 'resistance' | 'note';

export interface Reading {
  id: number;
  model_id: number | null;
  photo_id: number | null;
  /** Position on the photo, 0..1 of width/height. */
  x: number | null;
  y: number | null;
  type: ReadingType;
  part: string;
  pin: string;
  net: string;
  value: string;
  color: string;
  note: string;
  author: string;
  created_at: string;
}

export interface Jumper {
  id: number;
  photo_id: number;
  /** Polyline points, 0..1 of photo width/height. */
  points: { x: number; y: number }[];
  color: string;
  label: string;
  note: string;
  author: string;
  /** Circuit layer (see shared/layers.ts), '' = guess from label. */
  layer: string;
  /** 'jumper' = a repair wire; 'trace' = real copper the shop traced on the photo (verified). */
  kind?: 'jumper' | 'trace';
  /** Net the traced copper belongs to. */
  net?: string;
  created_at: string;
}

export interface CopperLayer {
  id: number;
  file_id: string;
  name: string;
  side: string;
  /** 'pins' = lined up exactly on part pads (Gerber X2), 'extent' = stretched to the board outline. */
  method: string;
  traces: { x1: number; y1: number; x2: number; y2: number; w: number; net: string; side: string }[];
  created_at: string;
}

export interface Photo {
  id: number;
  model_id: number | null;
  file_id: string;
  title: string;
  side: 'top' | 'bottom' | 'other';
  /** JSON {x0,y0,x1,y1}: board coordinates the photo's full frame covers, '' = not aligned. */
  align: string;
  created_at: string;
}

export interface IcXref {
  id: number;
  ic: string;
  function: string;
  platform: string;
  used_in: string;
  alternatives: string;
  notes: string;
  source: 'starter' | 'shop';
}

export interface Tree {
  brands: Brand[];
  models: (Model & { demo?: number; files: number; guides: number; readings: number; photos: number })[];
}

export interface ImportRequest {
  paths: string[];
  model_id: number | null;
  kind?: FileKind;
}

export interface Settings {
  fzKey: string;
  xzzKey: string;
  author: string;
  /** Optional AI assistant: the user's own Claude API key (stored only on this PC). */
  anthropicKey?: string;
  aiModel?: string;
  /** Bring your own AI: 'claude' (default), 'openai', 'gemini', 'openrouter', 'ollama' or 'custom'. */
  aiProvider?: string;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiCustomModel?: string;
}

export const BRAND_SEED = ['iPhone', 'Samsung', 'Tecno', 'Infinix', 'Itel', 'Xiaomi'];

/** Guess the brand from a file name like "Tecno_Spark_10_KI5.pdf". */
export function guessBrand(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (/iphone|apple|\bip\d|820-\d|\ba\d{4}\b/.test(n)) return 'iPhone';
  if (/samsung|\bsm[-_ ]?[agmnsfj]\d|galaxy/.test(n)) return 'Samsung';
  if (/tecno|camon|spark|pova|phantom|\bk[a-z]\d\b/.test(n)) return 'Tecno';
  if (/infinix|\bhot ?\d|\bnote ?\d+.*infinix|\bx6\d{2}/.test(n)) return 'Infinix';
  if (/\bitel\b|itel[_ -]/.test(n)) return 'Itel';
  if (/xiaomi|redmi|\bpoco\b|\bmi ?\d/.test(n)) return 'Xiaomi';
  return null;
}

export function kindForExt(ext: string): FileKind {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'schematic';
  if (['brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'asc', 'pcb', 'kicad_pcb'].includes(e)) return 'boardview';
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(e)) return 'photo';
  return 'other';
}
