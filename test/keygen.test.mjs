import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve('tools/keygen/keygen.mjs');

test('command-line key generator makes keys the app accepts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmc-keygen-'));
  const out = execFileSync(process.execPath, [CLI, '--new-keypair'], { cwd: dir }).toString();
  const pub = /\n(MCow[A-Za-z0-9+/=]+)/.exec(out)[1];
  const run = (...a) => execFileSync(process.execPath, [CLI, ...a], { cwd: dir }).toString();
  const res = run('--machine', 'abcd-1234-ef56-7890', '--days', '30', '--name', 'Tunde Phones', '--start', '2026-12-01');
  const key = /(FMC1-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(res)[1];
  const [pl, sig] = key.slice(5).split('.');
  const pubKey = crypto.createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' });
  assert.ok(crypto.verify(null, Buffer.from(pl), pubKey, Buffer.from(sig, 'base64url')));
  const p = JSON.parse(Buffer.from(pl, 'base64url').toString());
  assert.deepEqual(p, { v: 1, m: 'ABCD-1234-EF56-7890', n: 'Tunde Phones', p: '30 days', i: '2026-12-01', e: '2026-12-30' });
  assert.match(run('--check', key), /Signature: valid/);
  assert.match(fs.readFileSync(path.join(dir, 'issued-keys.csv'), 'utf8'), /ABCD-1234-EF56-7890/);
  assert.throws(() => execFileSync(process.execPath, [CLI, '--machine', 'XYZ', '--days', '3'], { cwd: dir, stdio: 'pipe' }));
});
