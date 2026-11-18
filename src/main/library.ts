// Model library: scan a folder of boards (and schematics/photos) and sort each
// file into Brand > Series > Model, or read a hosted library-index.json.
// Nothing is bundled: the app only indexes files the user points it at.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { kindForExt, type FileKind } from '../shared/types';
import { placeFile, placementFromMeta, type ModelMeta, type Placement } from '../shared/libsort';

export interface ScanEntry extends Placement {
  path: string;
  name: string;
  /** Path relative to the scanned folder. */
  rel: string;
  kind: FileKind;
  size: number;
  /** Already in the library (same name and size). */
  dup: boolean;
  meta?: { source?: ModelMeta['source']; license?: ModelMeta['license']; notes?: string };
}

const MAX_FILES = 20000;
const SKIP_DIRS = /^(\.|node_modules$|__MACOSX$|\$RECYCLE\.BIN$|System Volume Information$)/i;

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

/** library-index.json: { models: [...] } or [...], each with files[].path relative to the root (or URLs). */
export function indexModels(j: any): ModelMeta[] {
  const list = Array.isArray(j) ? j : Array.isArray(j?.models) ? j.models : [];
  return list.filter((m: any) => m && typeof m === 'object' && m.model);
}

export function scanFolder(root: string, isDup: (name: string, size: number) => boolean): { root: string; entries: ScanEntry[]; truncated: boolean } {
  const entries: ScanEntry[] = [];
  const byPath = new Map<string, ModelMeta>();
  const idx = readJson(path.join(root, 'library-index.json'));
  for (const m of indexModels(idx)) for (const f of m.files || []) if (f.path) byPath.set(norm(f.path), m);
  const metaCache = new Map<string, ModelMeta | null>();
  const metaFor = (dir: string): ModelMeta | null => {
    // Nearest model.json between the file's folder and the root.
    let d = dir;
    for (;;) {
      if (!metaCache.has(d)) {
        const j = readJson(path.join(d, 'model.json'));
        metaCache.set(d, j && j.model ? j : null);
      }
      const m = metaCache.get(d);
      if (m) return m;
      if (path.resolve(d) === path.resolve(root)) return null;
      const up = path.dirname(d);
      if (up === d) return null;
      d = up;
    }
  };
  let truncated = false;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || entries.length >= MAX_FILES) { truncated = truncated || entries.length >= MAX_FILES; return; }
    let list: fs.Dirent[] = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    let ascTaken = false;
    for (const e of list) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name)) walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      const ext = (/\.([^.]+)$/.exec(e.name)?.[1] || '').toLowerCase();
      const kind = kindForExt(ext);
      // Skip plain archives (often the downloaded pack itself); ODB++ .tgz is a board.
      if (kind === 'other' || ext === 'zip' || ext === 'tar' || ext === 'gz') continue;
      // ASC boards are several sibling files; take one and the importer copies the rest.
      if (ext === 'asc') { if (ascTaken || !/^(format|pins|parts|nails|nets)\.asc$/i.test(e.name)) continue; ascTaken = true; }
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      if (!size) continue;
      const rel = path.relative(root, full);
      const dirs = path.dirname(rel) === '.' ? [] : path.dirname(rel).split(path.sep);
      const fromIndex = byPath.get(norm(rel));
      const meta = fromIndex || metaFor(dir);
      let place: Placement | null = meta ? placementFromMeta(meta) : null;
      if (place && fromIndex) place.how = 'index';
      if (!place) place = placeFile(e.name, dirs);
      entries.push({
        ...place, path: full, name: e.name, rel, kind, size, dup: isDup(e.name, size),
        meta: meta ? { source: meta.source, license: meta.license, notes: meta.notes } : undefined,
      });
      if (entries.length >= MAX_FILES) { truncated = true; return; }
    }
  };
  walk(root, 0);
  return { root, entries, truncated };
}

/** Hosted library: fetch library-index.json from an https URL. */
export async function fetchIndex(url: string, fetcher: typeof fetch = fetch) {
  if (!/^https:\/\//i.test(url)) throw new Error('The library address must start with https://');
  const r = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`The library server answered ${r.status}`);
  const j = await r.json();
  const base = new URL(url);
  return indexModels(j).map((m) => ({
    ...m,
    files: (m.files || []).filter((f) => f.path).map((f) => ({ ...f, url: new URL(f.path, base).toString() })),
  }));
}

/** Download one hosted file to dir, checking its SHA-256 when the index gives one. */
export async function downloadFile(url: string, dir: string, sha256?: string, fetcher: typeof fetch = fetch) {
  if (!/^https:\/\//i.test(url)) throw new Error('Only https downloads are allowed');
  const r = await fetcher(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 400 * 1024 * 1024) throw new Error('File is larger than 400 MB');
  if (sha256 && createHash('sha256').update(buf).digest('hex').toLowerCase() !== sha256.toLowerCase()) throw new Error(`Checksum does not match for ${url}`);
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'board');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, name.replace(/[\\/:*?"<>|]/g, '_'));
  fs.writeFileSync(out, buf);
  return out;
}
