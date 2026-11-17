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
  created_at: string;
}

export interface Photo {
  id: number;
  model_id: number | null;
  file_id: string;
  title: string;
  side: 'top' | 'bottom' | 'other';
  created_at: string;
}

export interface Tree {
  brands: Brand[];
  models: (Model & { files: number; guides: number; readings: number; photos: number })[];
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
  if (['brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'asc', 'pcb'].includes(e)) return 'boardview';
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(e)) return 'photo';
  return 'other';
}
