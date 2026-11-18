import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../library/catalog.json', import.meta.url), 'utf8'));
const hosted = JSON.parse(readFileSync(new URL('../library/library-index.hosted.json', import.meta.url), 'utf8'));

// Licences that allow redistribution, including commercial use. Anything
// "NC" (non-commercial) or "all rights reserved" must never be added.
const ALLOWED = new Set(['Apache-2.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA-3.0-US', 'CC-BY-SA-4.0',
  'CERN-OHL-P-2.0', 'CERN-OHL-W-2.0', 'CERN-OHL-S-2.0', 'CERN-OHL-1.2', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'TAPR-OHL-1.0']);

test('every catalog model has a source, pinned commit and redistributable licence', () => {
  const ids = new Set();
  for (const m of catalog.models) {
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    for (const k of ['brand', 'series', 'model', 'repo']) assert.ok(m[k], `${m.id}: ${k}`);
    assert.match(m.repo, /^https:\/\//);
    assert.match(m.commit, /^[0-9a-f]{40}$/, `${m.id}: commit must be a full SHA`);
    assert.ok(ALLOWED.has(m.license.spdx), `${m.id}: licence ${m.license.spdx} is not on the allowed list`);
    assert.ok(!/NC/.test(m.license.spdx), `${m.id}: non-commercial licence`);
    assert.ok(m.license.attribution, `${m.id}: attribution`);
    assert.ok(m.license.file || m.license.url, `${m.id}: licence text`);
    assert.ok(m.files.some((f) => f.kind === 'board'), `${m.id}: has a board file`);
    for (const f of m.files) assert.ok(['board', 'schematic', 'photo'].includes(f.kind));
  }
});

test('hosted index matches the catalog and pins files by sha256', () => {
  const open = hosted.models.filter((m) => !String(m.id).startsWith('community-'));
  assert.equal(open.length, catalog.models.length);
  for (const m of hosted.models.filter((x) => String(x.id).startsWith('community-'))) {
    assert.equal(m.license.spdx, 'CC-BY-SA-4.0');
    assert.ok(m.contribution?.agreed, `${m.id}: ownership declaration`);
    for (const f of m.files) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  }
  for (const m of open) {
    const c = catalog.models.find((x) => x.id === m.id);
    assert.ok(c, `${m.id} in catalog`);
    assert.equal(m.source.commit, c.commit);
    for (const f of m.files) {
      assert.ok(f.path.startsWith('https://raw.githubusercontent.com/') && f.path.includes(c.commit), f.path);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
    }
  }
});
