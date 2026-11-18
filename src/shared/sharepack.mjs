// "Share to library" packs: a technician's own work on one model (board
// photos, diode/voltage readings, fault solutions, jumper wires, and only the
// files they made themselves), packed as a zip that ERA reviews before it is
// added to the online library.
//
// Layout inside the zip (the same Brand/Series/Model layout the library uses):
//   <Brand>/<Series>/<Model>/model.json
//   <Brand>/<Series>/<Model>/shop-notes.json
//   <Brand>/<Series>/<Model>/<photos and files>
import { zipStore, unzip } from './zipstore.mjs';

export const SHARE_LICENSE = 'CC-BY-SA-4.0';
export const SHARE_EMAIL = 'info@eratechnologiz.com.ng';
export const DECLARATION =
  'I made everything in this pack myself (photos, readings, notes and any files), or I have the owner\'s permission to share it. ' +
  'None of it was copied from paid tools, other websites or leaked manufacturer files. ' +
  'I agree that it is shared under the Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0), credited to me.';

/** Board formats that usually come from manufacturers or paid tools: a reviewer must look at these by hand. */
export const OEM_BOARD_EXT = new Set(['brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'cae', 'asc', 'pcb', 'cad', 'gcd', 'gencad', 'pcbdoc', 'tgz', 'tar', 'gz', 'zip']);

export const safeName = (s) =>
  String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();

const extOf = (n) => (/\.([^./\\]+)$/.exec(n || '')?.[1] || '').toLowerCase();

/**
 * @param {{
 *   brand: string, series?: string, model: string,
 *   contributor: string, contact?: string, declaration: boolean, appVersion?: string, date?: string,
 *   files: { name: string, kind: 'photo'|'board'|'schematic', data: Uint8Array }[],
 *   notes: { photos: any[], guides: any[], readings: any[], jumpers: any[] },
 * }} p
 */
export function buildSharePack(p) {
  if (!p.declaration) throw new Error('Tick the box to confirm this is your own work.');
  if (!String(p.contributor || '').trim()) throw new Error('Enter your name or shop name so you get the credit.');
  if (!String(p.brand || '').trim() || !String(p.model || '').trim()) throw new Error('This model needs a brand and a model name.');
  const brand = p.brand.trim(), model = p.model.trim(), series = String(p.series || '').trim();
  const dir = [safeName(brand), series ? safeName(series) : null, safeName(model)].filter(Boolean).join('/');
  const date = p.date || new Date().toISOString().slice(0, 10);
  const used = new Set(['model.json', 'shop-notes.json']);
  const entries = [];
  const files = [];
  for (const f of p.files) {
    let name = safeName(f.name) || 'file';
    for (let i = 2; used.has(name.toLowerCase()); i++) name = name.replace(/(\.[^.]+)?$/, (e) => `-${i}${e || ''}`);
    used.add(name.toLowerCase());
    entries.push({ name: `${dir}/${name}`, data: f.data });
    files.push({ path: name, kind: f.kind, bytes: f.data.length, original: f.name });
  }
  const rename = new Map(files.map((f) => [f.original, f.path]));
  const mapPhoto = (n) => (n == null ? null : rename.get(n) || null);
  const notes = {
    app: 'FixMyCircuit', kind: 'shop-notes', version: 1,
    photos: (p.notes.photos || []).map((x) => ({ ...x, file: mapPhoto(x.file) })).filter((x) => x.file),
    guides: (p.notes.guides || []).map((g) => ({ ...g, photos: (g.photos || []).map(mapPhoto).filter(Boolean) })),
    readings: (p.notes.readings || []).map((r) => ({ ...r, photo: mapPhoto(r.photo) })),
    jumpers: (p.notes.jumpers || []).map((j) => ({ ...j, photo: mapPhoto(j.photo) })).filter((j) => j.photo),
  };
  files.forEach((f) => delete f.original);
  files.push({ path: 'shop-notes.json', kind: 'notes' });
  const contributor = p.contributor.trim();
  const meta = {
    brand, series, model,
    files,
    source: { url: 'fixmycircuit-contribution', contributor, contact: String(p.contact || '').trim(), date, app: `FixMyCircuit ${p.appVersion || ''}`.trim() },
    license: { spdx: SHARE_LICENSE, attribution: `Shared by ${contributor} through FixMyCircuit, ${date}.`, url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    contribution: { declaration: DECLARATION, agreed: true },
    notes: `Shop work: ${notes.readings.length} readings, ${notes.guides.length} fault solutions, ${notes.photos.length} photos.`,
  };
  entries.unshift({ name: `${dir}/shop-notes.json`, data: JSON.stringify(notes, null, 2) });
  entries.unshift({ name: `${dir}/model.json`, data: JSON.stringify(meta, null, 2) });
  return { zip: zipStore(entries), dir, meta, notes };
}

/** Read a pack back: its model.json, shop notes and files. */
export function readSharePack(bytes) {
  const items = unzip(bytes);
  const metaItem = items.find((i) => /(^|\/)model\.json$/i.test(i.name));
  if (!metaItem) throw new Error('This pack has no model.json');
  const dir = metaItem.name.replace(/\/?model\.json$/i, '');
  const meta = JSON.parse(new TextDecoder().decode(metaItem.data));
  const notesItem = items.find((i) => i.name === (dir ? `${dir}/` : '') + 'shop-notes.json');
  const notes = notesItem ? JSON.parse(new TextDecoder().decode(notesItem.data)) : null;
  const files = items.filter((i) => i !== metaItem && i !== notesItem).map((i) => ({ name: i.name.slice(dir ? dir.length + 1 : 0), data: i.data }));
  return { dir, meta, notes, files };
}

/** Checks a reviewer runs before a pack goes public. Errors block it; warnings need a human look. */
export function checkSharePack(pack, { allowBoards = false } = {}) {
  const errors = [], warnings = [];
  const m = pack.meta || {};
  if (!m.brand || !m.model) errors.push('model.json has no brand or model');
  if (!m.contribution?.agreed || m.contribution?.declaration !== DECLARATION) errors.push('The contributor did not confirm the ownership declaration');
  if (m.license?.spdx !== SHARE_LICENSE) errors.push(`Licence must be ${SHARE_LICENSE}`);
  if (!m.source?.contributor) errors.push('No contributor name for the credit');
  const listed = new Set((m.files || []).map((f) => f.path));
  for (const f of pack.files) {
    if (f.name.includes('/') || f.name.startsWith('.')) errors.push(`Unexpected path in pack: ${f.name}`);
    if (!listed.has(f.name)) errors.push(`File not listed in model.json: ${f.name}`);
    const ext = extOf(f.name);
    if (OEM_BOARD_EXT.has(ext)) {
      (allowBoards ? warnings : errors).push(`${f.name}: .${ext} board files are usually manufacturer data. Check it was really made by the contributor${allowBoards ? '' : ' (use --allow-boards after checking)'}`);
    } else if (ext === 'kicad_pcb' || ext === 'pdf') warnings.push(`${f.name}: check the contributor drew this themselves`);
    else if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) errors.push(`${f.name}: file type not accepted`);
  }
  if (pack.notes && pack.notes.kind !== 'shop-notes') errors.push('shop-notes.json is not a FixMyCircuit shop-notes file');
  return { ok: errors.length === 0, errors, warnings };
}
