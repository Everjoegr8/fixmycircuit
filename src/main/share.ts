// "Share to library": collect a technician's own work on one model into a
// pack, and import the shop notes that come with a shared model.
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import type { Jumper, Photo } from '../shared/types';
import { buildSharePack } from '../shared/sharepack.mjs';

export interface ShareOptions {
  contributor: string;
  contact?: string;
  declaration: boolean;
  /** Board/schematic file ids the user says they made themselves. Photos are always included. */
  ownFileIds?: string[];
  includePhotos?: boolean;
}

/** What a model has to share, for the dialog. */
export function shareSummary(db: DB, modelId: number) {
  const photos = db.listPhotos(modelId);
  return {
    photos: photos.length,
    readings: db.listReadings({ model_id: modelId }).length,
    guides: db.listGuides(modelId).length,
    jumpers: photos.reduce((n, p) => n + db.listJumpers(p.id).length, 0),
    files: db.listFiles(modelId).filter((f) => f.kind !== 'photo').map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size })),
  };
}

export function buildModelPack(db: DB, modelId: number, stored: (fileId: string) => string, opts: ShareOptions, appVersion = '') {
  const model = db.raw.prepare('SELECT m.id, m.name, m.series, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.id = ?').get(modelId) as
    | { id: number; name: string; series?: string; brand: string }
    | undefined;
  if (!model) throw new Error('Model not found');
  const photos = opts.includePhotos === false ? [] : db.listPhotos(modelId);
  const photoName = new Map<number, string>();
  const files: { name: string; kind: 'photo' | 'board' | 'schematic'; data: Uint8Array }[] = [];
  for (const ph of photos) {
    const f = db.getFile(ph.file_id);
    if (!f) continue;
    files.push({ name: f.name, kind: 'photo', data: fs.readFileSync(stored(f.id)) });
    photoName.set(ph.id, f.name);
  }
  for (const id of opts.ownFileIds || []) {
    const f = db.getFile(id);
    if (!f || f.model_id !== modelId || f.kind === 'photo') continue;
    files.push({ name: f.name, kind: f.kind === 'schematic' ? 'schematic' : 'board', data: fs.readFileSync(stored(f.id)) });
  }
  const readings = db.listReadings({ model_id: modelId });
  const guides = db.listGuides(modelId);
  const jumpers: (Jumper & { photo: string | null })[] = [];
  for (const ph of photos) for (const j of db.listJumpers(ph.id)) jumpers.push({ ...j, photo: photoName.get(ph.id) || null });
  const pick = <T extends object>(o: T, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  const notes = {
    photos: photos.filter((p) => photoName.has(p.id)).map((p: Photo) => ({ file: photoName.get(p.id)!, title: p.title, side: p.side, align: p.align })),
    guides: guides.map((g) => ({
      ...pick(g, ['title', 'symptom', 'steps', 'parts', 'nets', 'author']),
      photos: String(g.photo_ids || '').split(',').map((s) => photoName.get(Number(s))).filter(Boolean),
    })),
    readings: readings.map((r) => ({
      ...pick(r, ['type', 'part', 'pin', 'net', 'value', 'color', 'note', 'author']),
      photo: r.photo_id != null && photoName.has(r.photo_id) ? photoName.get(r.photo_id)! : null,
      x: r.photo_id != null && photoName.has(r.photo_id) ? r.x : null,
      y: r.photo_id != null && photoName.has(r.photo_id) ? r.y : null,
    })),
    jumpers: jumpers.map((j) => ({ ...pick(j, ['points', 'color', 'label', 'note', 'author', 'layer', 'kind', 'net']), photo: j.photo })),
  };
  return buildSharePack({
    brand: model.brand, series: model.series || '', model: model.name,
    contributor: opts.contributor, contact: opts.contact, declaration: opts.declaration, appVersion,
    files, notes,
  });
}

/** Find shop-notes.json next to imported files (the pack/library layout puts it in the model folder). */
export function findNotes(paths: string[]): string | null {
  for (const p of paths) {
    if (path.basename(p).toLowerCase() === 'shop-notes.json') return p;
    const side = path.join(path.dirname(p), 'shop-notes.json');
    if (fs.existsSync(side)) return side;
  }
  return null;
}

/**
 * Add the readings, fault solutions and jumpers from a shop-notes.json to a
 * model. Photos are matched by file name to the photos just imported.
 * Rows already present (same content) are skipped, so importing twice is safe.
 */
export function importNotes(db: DB, modelId: number, notesFile: string) {
  let n: any;
  try { n = JSON.parse(fs.readFileSync(notesFile, 'utf8')); } catch { return { readings: 0, guides: 0, jumpers: 0 }; }
  if (!n || n.kind !== 'shop-notes') return { readings: 0, guides: 0, jumpers: 0 };
  const photos = db.listPhotos(modelId);
  const byName = new Map<string, Photo>();
  for (const p of photos) { const f = db.getFile(p.file_id); if (f) byName.set(f.name.toLowerCase(), p); }
  const photoId = (name: unknown) => (typeof name === 'string' ? byName.get(name.toLowerCase())?.id ?? null : null);
  const s = (v: unknown, max = 4000) => String(v ?? '').slice(0, max);
  let readings = 0, guides = 0, jumpers = 0;
  const tx = db.raw.transaction(() => {
    for (const p of Array.isArray(n.photos) ? n.photos : []) {
      const ph = typeof p?.file === 'string' ? byName.get(p.file.toLowerCase()) : undefined;
      if (ph) db.updatePhoto(ph.id, { title: s(p.title, 200) || ph.title, side: ['top', 'bottom', 'other'].includes(p.side) ? p.side : ph.side, align: typeof p.align === 'string' ? p.align : ph.align });
    }
    const haveR = new Set(db.listReadings({ model_id: modelId }).map((r) => [r.type, r.part, r.pin, r.net, r.value, r.author].join('\u0000')));
    for (const r of Array.isArray(n.readings) ? n.readings : []) {
      const type = ['diode', 'voltage', 'resistance', 'note'].includes(r?.type) ? r.type : 'note';
      const key = [type, s(r.part, 80), s(r.pin, 40), s(r.net, 120), s(r.value, 80), s(r.author, 120)].join('\u0000');
      if (haveR.has(key)) continue;
      haveR.add(key);
      const pid = photoId(r.photo);
      db.saveReading({
        model_id: modelId, photo_id: pid, x: pid != null && Number.isFinite(r.x) ? r.x : null, y: pid != null && Number.isFinite(r.y) ? r.y : null,
        type, part: s(r.part, 80), pin: s(r.pin, 40), net: s(r.net, 120), value: s(r.value, 80),
        color: /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : '#f5a524', note: s(r.note), author: s(r.author, 120),
      });
      readings++;
    }
    const haveG = new Set(db.listGuides(modelId).map((g) => g.title + '\u0000' + g.author));
    for (const g of Array.isArray(n.guides) ? n.guides : []) {
      if (!g?.title || haveG.has(s(g.title, 200) + '\u0000' + s(g.author, 120))) continue;
      const ids = (Array.isArray(g.photos) ? g.photos : []).map(photoId).filter((x: number | null) => x != null);
      db.saveGuide({ model_id: modelId, title: s(g.title, 200), symptom: s(g.symptom), steps: s(g.steps, 20000), parts: s(g.parts), nets: s(g.nets), author: s(g.author, 120), photo_ids: ids.join(',') });
      guides++;
    }
    for (const j of Array.isArray(n.jumpers) ? n.jumpers : []) {
      const pid = photoId(j?.photo);
      const pts = Array.isArray(j?.points) ? j.points.filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).slice(0, 500) : [];
      if (pid == null || pts.length < 2) continue;
      const same = db.listJumpers(pid).some((x) => JSON.stringify(x.points) === JSON.stringify(pts));
      if (same) continue;
      db.saveJumper({ photo_id: pid, points: pts, color: /^#[0-9a-f]{3,8}$/i.test(j.color) ? j.color : '#ef4444', label: s(j.label, 200), note: s(j.note), author: s(j.author, 120), layer: s(j.layer, 40), kind: j.kind === 'trace' ? 'trace' : 'jumper', net: s(j.net, 120) });
      jumpers++;
    }
  });
  tx();
  return { readings, guides, jumpers };
}
