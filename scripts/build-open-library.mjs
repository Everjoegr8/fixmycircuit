#!/usr/bin/env node
// Builds the FixMyCircuit open board library from library/catalog.json.
//
// Every board comes from a published open-hardware repository, pinned to an
// exact commit, together with its licence. Nothing here is leaked or
// proprietary manufacturer data, and nothing may be added that is.
//
//   node scripts/build-open-library.mjs [outDir] [--zip] [--no-check]
//
// Output (default out/open-library):
//   <Brand>/<Series>/<Model>/<board and schematic files, unchanged>
//   <Brand>/<Series>/<Model>/model.json     source, commit, licence, attribution
//   <Brand>/<Series>/<Model>/LICENSE.txt    the upstream licence text
//   library-index.json                      every model, paths relative to the root
//   library-index.hosted.json               the same, with raw GitHub URLs + sha256,
//                                           for the app's "hosted library" setting
//   NOTICE.md                               attributions for the whole pack
//
// Needs git on PATH. Repositories are cached in <outDir>/.cache.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const outDir = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'out', 'open-library'));
const wantZip = args.includes('--zip');
const check = !args.includes('--no-check');

const catalog = JSON.parse(readFileSync(join(root, 'library', 'catalog.json'), 'utf8'));
const cacheDir = join(outDir, '.cache');
mkdirSync(cacheDir, { recursive: true });

let loadBoard = null;
if (check) {
  try {
    ({ loadBoard } = await import('../src/parsers/index.js'));
  } catch (e) {
    console.warn('Parser check skipped (run npm install first):', e.message);
  }
}

/** Folder names that are safe on Windows, macOS and Linux. */
export function safeName(s) {
  return String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
}

function git(cwd, ...a) {
  return execFileSync('git', a, { cwd, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
}

const repos = new Map();
function repoAt(url, commit) {
  const key = url + '@' + commit;
  if (repos.has(key)) return repos.get(key);
  const dir = join(cacheDir, url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_'));
  if (!existsSync(join(dir, '.git')) && !existsSync(join(dir, 'HEAD'))) {
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '--bare');
    git(dir, 'remote', 'add', 'origin', url + '.git');
  }
  try {
    git(dir, 'cat-file', '-e', commit + '^{commit}');
  } catch {
    console.log(`  fetching ${url} @ ${commit.slice(0, 7)}`);
    git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit);
  }
  repos.set(key, dir);
  return dir;
}

function rawUrl(repo, commit, path) {
  const m = /github\.com\/([^/]+)\/([^/]+)$/.exec(repo);
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const index = [];
const hosted = [];
const notice = ['# FixMyCircuit open board library: notices', '',
  'Each board below is an open-hardware design published by its authors under the licence shown.',
  'The files are unchanged copies from the commit named. Each model folder holds the full licence text.',
  'FixMyCircuit only displays these files; they are not part of the FixMyCircuit program.', ''];

for (const m of catalog.models) {
  console.log(`${m.brand} / ${m.series} / ${m.model}`);
  const dir = repoAt(m.repo, m.commit);
  const rel = [safeName(m.brand), safeName(m.series), safeName(m.model)].join('/');
  const modelDir = join(outDir, rel);
  rmSync(modelDir, { recursive: true, force: true });
  mkdirSync(modelDir, { recursive: true });

  const files = [];
  const hostedFiles = [];
  let stats = null;
  for (const f of m.files) {
    const bytes = git(dir, 'cat-file', 'blob', `${m.commit}:${f.src}`);
    const name = f.as || basename(f.src);
    writeFileSync(join(modelDir, name), bytes);
    const digest = sha256(bytes);
    files.push({ path: name, kind: f.kind, bytes: bytes.length, sha256: digest });
    hostedFiles.push({ path: rawUrl(m.repo, m.commit, f.src), kind: f.kind, bytes: bytes.length, sha256: digest });
    if (f.kind === 'board' && loadBoard) {
      const t = Date.now();
      const b = loadBoard(new Uint8Array(bytes), name, {});
      stats = { parts: b.parts.length, pins: b.pins.length, nets: b.nets.size, parseMs: Date.now() - t };
      if (!b.parts.length) throw new Error(`${name}: parser found no parts`);
      console.log(`  ${name}: ${stats.parts} parts, ${stats.pins} pins, ${stats.nets} nets`);
    }
  }

  let licenceText;
  if (m.license.file) licenceText = git(dir, 'cat-file', 'blob', `${m.commit}:${m.license.file}`).toString('utf8');
  else licenceText = `${m.license.spdx}\n\nFull text: ${m.license.url}\n`;
  writeFileSync(join(modelDir, 'LICENSE.txt'), `${m.license.attribution}\n\nLicence: ${m.license.spdx}\n\n${licenceText}`);

  const source = { url: m.repo, commit: m.commit, paths: m.files.map((f) => f.src) };
  const license = { spdx: m.license.spdx, attribution: m.license.attribution, url: m.license.url || `${m.repo}/blob/${m.commit}/${m.license.file}` };
  const meta = { id: m.id, brand: m.brand, series: m.series, model: m.model, device: m.device, files, source, license, notes: m.notes || '', check: stats };
  writeFileSync(join(modelDir, 'model.json'), JSON.stringify(meta, null, 2) + '\n');
  index.push({ ...meta, files: files.map((f) => ({ ...f, path: `${rel}/${f.path}` })) });
  hosted.push({ ...meta, files: hostedFiles });
  notice.push(`## ${m.brand} / ${m.series} / ${m.model}`, '', `- Source: ${m.repo} (commit ${m.commit})`, `- Licence: ${m.license.spdx}`, `- ${m.license.attribution}`, '');
}

const header = { name: 'FixMyCircuit open board library', version: catalog.version, generated: new Date().toISOString().slice(0, 10), count: index.length, excluded: catalog.excluded };
writeFileSync(join(outDir, 'library-index.json'), JSON.stringify({ ...header, models: index }, null, 2) + '\n');
writeFileSync(join(outDir, 'library-index.hosted.json'), JSON.stringify({ ...header, models: hosted }, null, 2) + '\n');
notice.push('## Not included', '', ...catalog.excluded.map((e) => `- ${e.name}: ${e.reason}`), '');
writeFileSync(join(outDir, 'NOTICE.md'), notice.join('\n'));
console.log(`\n${index.length} models written to ${outDir}`);

if (wantZip) {
  const zip = join(dirname(outDir), basename(outDir) + '.zip');
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '.cache/*'], { cwd: outDir, stdio: 'inherit' });
  console.log(`Zipped to ${zip}`);
}
