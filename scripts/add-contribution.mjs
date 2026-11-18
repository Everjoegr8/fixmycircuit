#!/usr/bin/env node
// Review a "Share to library" pack from a technician and add it to the
// community part of the online library.
//
//   node scripts/add-contribution.mjs <pack.zip> [--allow-boards] [--dry-run]
//
// The pack must carry the contributor's ownership declaration and the
// CC BY-SA 4.0 licence. Photos, readings and notes are accepted; board files in
// formats that usually come from manufacturers or paid tools are refused unless
// you have checked them and pass --allow-boards. After adding, run
// `npm run library` to refresh library/library-index.hosted.json, then commit.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSharePack, checkSharePack, safeName } from '../src/shared/sharepack.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Usage: node scripts/add-contribution.mjs <pack.zip> [--allow-boards] [--dry-run]'); process.exit(2); }
const pack = readSharePack(new Uint8Array(readFileSync(file)));
const res = checkSharePack(pack, { allowBoards: args.includes('--allow-boards') });
const m = pack.meta;
console.log(`${m.brand} / ${m.series || '-'} / ${m.model}  shared by ${m.source?.contributor} (${m.source?.contact || 'no contact'}) on ${m.source?.date}`);
console.log(`  ${pack.files.length} files, ${pack.notes?.readings?.length || 0} readings, ${pack.notes?.guides?.length || 0} fault solutions, ${pack.notes?.jumpers?.length || 0} jumpers`);
for (const w of res.warnings) console.log('  check: ' + w);
for (const e of res.errors) console.log('  REFUSED: ' + e);
if (!res.ok) process.exit(1);
if (args.includes('--dry-run')) { console.log('Dry run: nothing written.'); process.exit(0); }

const communityDir = join(root, 'library', 'community');
const rel = [safeName(m.brand), m.series ? safeName(m.series) : null, safeName(m.model)].filter(Boolean).join('/');
const out = join(communityDir, rel);
mkdirSync(out, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const files = [];
for (const f of pack.files) {
  writeFileSync(join(out, f.name), f.data);
  const kind = (m.files || []).find((x) => x.path === f.name)?.kind || 'photo';
  files.push({ path: f.name, kind, bytes: f.data.length, sha256: sha(f.data) });
}
const notesBytes = Buffer.from(JSON.stringify(pack.notes || { app: 'FixMyCircuit', kind: 'shop-notes', version: 1 }, null, 2));
writeFileSync(join(out, 'shop-notes.json'), notesBytes);
files.push({ path: 'shop-notes.json', kind: 'notes', bytes: notesBytes.length, sha256: sha(notesBytes) });
const meta = { ...m, files, source: { ...m.source, contact: undefined, url: 'fixmycircuit-contribution' } };
delete meta.source.contact; // contact details stay private; ERA keeps them from the email
writeFileSync(join(out, 'model.json'), JSON.stringify(meta, null, 2) + '\n');

const idxFile = join(communityDir, 'index.json');
const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : { name: 'FixMyCircuit community library', models: [] };
const id = 'community-' + rel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
idx.models = idx.models.filter((x) => x.id !== id);
idx.models.push({ id, dir: rel, ...meta });
idx.models.sort((a, b) => a.dir.localeCompare(b.dir));
writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n');
console.log(`Added to library/community/${rel}. Now run: npm run library -- out/open-library && cp out/open-library/library-index.hosted.json library/`);
