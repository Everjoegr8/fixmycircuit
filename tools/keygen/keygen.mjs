#!/usr/bin/env node
// FixMyCircuit licence key generator (command line). For ERA Technologiz only.
// Keep this script and your private signing key on your own computer. The key
// never goes into the app or the repository; the app only has the public key.
//
// Make a key (needs Node.js 18 or newer):
//   node keygen.mjs --key PRIVATE-signing-key.txt --machine ABCD-1234-EF56-7890 --days 30 --name "Tunde Phones"
// Options:
//   --start 2026-12-01   first day of the key (default: today)
//   --until 2027-01-31   last day instead of --days
//   --check FMC1-...     check a key and show what is inside
//   --new-keypair        make a new signing key pair (then put the public key in src/main/license.ts and rebuild)
import crypto from 'node:crypto';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes('--' + name);
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const die = (m) => { console.error('Error: ' + m); process.exit(1); };

if (has('new-keypair')) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const file = opt('out') || 'PRIVATE-signing-key.txt';
  if (fs.existsSync(file)) die(`${file} already exists. Move it away first; keys made with it stop working if you replace it.`);
  fs.writeFileSync(file, `# FixMyCircuit PRIVATE signing key. Never share it or put it in the repository.\n${priv}\n`, { mode: 0o600 });
  console.log(`Private key saved to ${file}`);
  console.log(`Public key (put this in PUBLIC_KEY in src/main/license.ts, then rebuild the app):\n${pub}`);
  process.exit(0);
}

function loadPrivate() {
  const file = opt('key') || 'PRIVATE-signing-key.txt';
  if (!fs.existsSync(file)) die(`private key file not found: ${file} (use --key <file>)`);
  const tok = fs.readFileSync(file, 'utf8').split(/\s+/).filter((t) => /^MC4C[A-Za-z0-9+/=]+$/.test(t))[0];
  if (!tok) die(`no Ed25519 private key found in ${file}`);
  return crypto.createPrivateKey({ key: Buffer.from(tok, 'base64'), format: 'der', type: 'pkcs8' });
}

const priv = loadPrivate();
const pub = crypto.createPublicKey(priv);

if (opt('check')) {
  const k = opt('check').trim().replace(/\s+/g, '');
  if (!k.startsWith('FMC1-')) die('not a FixMyCircuit key');
  const [pl, sig] = k.slice(5).split('.');
  const ok = crypto.verify(null, Buffer.from(pl), pub, unb64u(sig));
  const p = JSON.parse(unb64u(pl).toString('utf8'));
  console.log(ok ? 'Signature: valid (made with this private key)' : 'Signature: NOT valid for this private key');
  console.log(`Machine: ${p.m}\nShop: ${p.n || '-'}\nPlan: ${p.p}\nIssued: ${p.i}\nExpires: ${p.e} (end of day)`);
  process.exit(ok ? 0 : 2);
}

const machine = (opt('machine') || '').toUpperCase().replace(/[^0-9A-F]/g, '');
if (machine.length !== 16) die('--machine must be the 16-character machine ID shown in the app, like ABCD-1234-EF56-7890');
const m = machine.replace(/(.{4})(?=.)/g, '$1-');
const start = opt('start') || today();
if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) die('--start must look like 2026-12-01');
let expiry, plan;
if (opt('until')) { expiry = opt('until'); plan = `until ${expiry}`; }
else {
  const days = parseInt(opt('days') || '', 10);
  if (!(days > 0)) die('give --days <number> or --until <date>');
  expiry = addDays(start, days - 1);
  plan = `${days} days`;
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) die('--until must look like 2027-01-31');
const payload = { v: 1, m, n: opt('name') || '', p: plan, i: start, e: expiry };
const pl = b64u(JSON.stringify(payload));
const key = `FMC1-${pl}.${b64u(crypto.sign(null, Buffer.from(pl), priv))}`;

console.log(`\nKey for ${m}${payload.n ? ` (${payload.n})` : ''}, ${plan}, valid ${start} to ${expiry}:\n`);
console.log(key + '\n');
const msg = `Your FixMyCircuit key (${plan}, valid until ${expiry}):\n${key}\n\nOpen FixMyCircuit, paste it in the activation box (or Settings, Licence) and press Activate.`;
console.log('WhatsApp message:\n' + msg + '\n');
const log = opt('log') || 'issued-keys.csv';
const row = [new Date().toISOString(), m, JSON.stringify(payload.n), plan, start, expiry, key].join(',') + '\n';
if (!fs.existsSync(log)) fs.writeFileSync(log, 'created,machine,shop,plan,start,expiry,key\n');
fs.appendFileSync(log, row);
console.log(`Logged in ${log}`);
