// Licence checking in the main process: machine ID, trial, signed keys, grace period.
import { app } from 'electron';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GRACE_DAYS, TRIAL_DAYS, WARN_DAYS, daysUntil, fromB64url, normaliseMachineId, splitKey, addDays,
  type LicensePayload, type LicenseStatus,
} from '../shared/license';

/** Ed25519 public key (SPKI, base64) matching the private key used by the key generator. */
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAAtcPlLfo3ID5lupMQEFSFRpZuS0twNPjJQMT4sI7PsM=';
/** WhatsApp number (international format, digits only) that key requests go to. */
export const SUPPORT_WHATSAPP = '';

const dev = () => !app.isPackaged;
/** Current time; tests can move it with FMC_NOW when running from source. */
export const nowMs = () => (dev() && process.env.FMC_NOW ? Date.parse(process.env.FMC_NOW) : Date.now());

function rawMachineId(): string {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(out);
      if (m) return m[1];
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      const m = /"IOPlatformUUID" = "([^"]+)"/.exec(out);
      if (m) return m[1];
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    }
  } catch { /* fall through */ }
  return `${os.hostname()}|${os.cpus()[0]?.model}|${os.totalmem()}`;
}

let cachedId = '';
export function machineId() {
  if (!cachedId) {
    const override = dev() ? process.env.FMC_MACHINE_ID : undefined;
    const h = createHash('sha256').update('fixmycircuit|' + (override || rawMachineId())).digest('hex').slice(0, 16);
    cachedId = normaliseMachineId(h);
  }
  return cachedId;
}

function publicKey() {
  const k = (dev() && process.env.FMC_LICENSE_PUBKEY) || PUBLIC_KEY;
  return createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' });
}

/** Check a key's signature and machine. Returns the payload or a reason. */
export function checkKey(key: string): { ok: true; payload: LicensePayload } | { ok: false; reason: string } {
  const parts = splitKey(key);
  if (!parts) return { ok: false, reason: 'That is not a FixMyCircuit key. It should start with FMC1-.' };
  let good = false;
  try { good = verify(null, Buffer.from(parts.payloadPart), publicKey(), Buffer.from(fromB64url(parts.sigPart), 'base64')); } catch { good = false; }
  if (!good) return { ok: false, reason: 'This key is not valid. Check that it was copied completely.' };
  let payload: LicensePayload;
  try { payload = JSON.parse(Buffer.from(fromB64url(parts.payloadPart), 'base64').toString('utf8')); } catch { return { ok: false, reason: 'This key is damaged.' }; }
  if (normaliseMachineId(payload.m) !== machineId()) return { ok: false, reason: `This key is for another computer (${payload.m}). This computer is ${machineId()}.` };
  return { ok: true, payload };
}

interface Store { get(k: string): string | undefined; set(k: string, v: string): void }

const today = (t: number) => new Date(t).toISOString().slice(0, 10);

function trialFile() { return path.join(app.getPath('userData'), '.fmc-trial'); }

export function licenseStatus(store: Store, now = nowMs()): LicenseStatus {
  const id = machineId();
  // Never let the clock run backwards past the latest time we have seen.
  const lastSeen = Number(store.get('licLastSeen') || 0);
  const clockProblem = lastSeen - now > 86400000;
  const t = Math.max(now, lastSeen);
  if (t > lastSeen) store.set('licLastSeen', String(t));

  const base = { machineId: id, supportWhatsApp: SUPPORT_WHATSAPP, clockProblem };
  const key = store.get('licenseKey') || '';
  if (key) {
    const r = checkKey(key);
    if (r.ok) {
      const left = daysUntil(r.payload.e, t);
      const info = { ...base, expires: r.payload.e, name: r.payload.n, plan: r.payload.p, daysLeft: left };
      if (left >= WARN_DAYS) return { ...info, state: 'licensed', locked: false, message: `Licensed to ${r.payload.n || 'this shop'} until ${r.payload.e}.` };
      if (left >= 0) return { ...info, state: 'warning', locked: false, message: `Your key expires on ${r.payload.e} (${left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'} left`}). Request a renewal key.` };
      if (left >= -GRACE_DAYS) return { ...info, state: 'grace', locked: false, message: `Your key expired on ${r.payload.e}. FixMyCircuit keeps working until ${addDays(r.payload.e, GRACE_DAYS)}. Request a renewal key now.` };
      return { ...info, state: 'expired', locked: true, message: `Your key expired on ${r.payload.e}. Enter a renewal key to continue.` };
    }
  }
  // Trial: start date kept in the database and in a file; the earliest wins.
  let start = store.get('trialStart') || '';
  try { const f = fs.readFileSync(trialFile(), 'utf8').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(f) && (!start || f < start)) start = f; } catch { /* none yet */ }
  if (!start) start = today(t);
  store.set('trialStart', start);
  try { fs.mkdirSync(path.dirname(trialFile()), { recursive: true }); fs.writeFileSync(trialFile(), start); } catch { /* ignore */ }
  const end = addDays(start, TRIAL_DAYS - 1);
  const left = daysUntil(end, t);
  if (left >= 0) return { ...base, state: 'trial', locked: false, daysLeft: left, expires: end, message: `Free trial: ${left + 1} day${left === 0 ? '' : 's'} left. Request a key to keep using FixMyCircuit.` };
  return { ...base, state: 'trial-expired', locked: true, daysLeft: left, expires: end, message: 'Your free trial has ended. Request a key on WhatsApp and enter it below.' };
}

export function activate(store: Store, key: string) {
  const r = checkKey(key);
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const left = daysUntil(r.payload.e, Math.max(nowMs(), Number(store.get('licLastSeen') || 0)));
  if (left < 0) return { ok: false as const, reason: `This key already expired on ${r.payload.e}.` };
  store.set('licenseKey', key.trim().replace(/\s+/g, ''));
  return { ok: true as const };
}
