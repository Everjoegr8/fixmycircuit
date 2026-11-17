// Offline licence keys: a signed payload that names one machine and an expiry date.
// Format: FMC1-<base64url(JSON payload)>.<base64url(Ed25519 signature of the payload part)>
// Only the public key is in the app; keys are made with the separate key generator.

export interface LicensePayload {
  v: 1;
  /** Machine ID the key is locked to (XXXX-XXXX-XXXX-XXXX). */
  m: string;
  /** Customer or shop name. */
  n: string;
  /** Plan label, e.g. "30 days". */
  p: string;
  /** Issued and expiry dates, YYYY-MM-DD (the key works through the end of the expiry day). */
  i: string;
  e: string;
}

export type LicenseState = 'trial' | 'licensed' | 'warning' | 'grace' | 'expired' | 'trial-expired';

export interface LicenseStatus {
  state: LicenseState;
  machineId: string;
  /** Whole days left on the key or trial (0 on the last day; negative in grace). */
  daysLeft: number;
  expires?: string;
  name?: string;
  plan?: string;
  /** True when the app must show the activation screen. */
  locked: boolean;
  message: string;
  supportWhatsApp: string;
  clockProblem?: boolean;
}

export const TRIAL_DAYS = 7;
export const WARN_DAYS = 7;
export const GRACE_DAYS = 3;
export const KEY_PREFIX = 'FMC1-';

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);

export function encodePayload(p: LicensePayload, toB64: (s: string) => string) {
  return b64url(toB64(JSON.stringify(p)));
}

export function splitKey(key: string): { payloadPart: string; sigPart: string } | null {
  const k = key.trim().replace(/\s+/g, '');
  if (!k.startsWith(KEY_PREFIX)) return null;
  const [payloadPart, sigPart, extra] = k.slice(KEY_PREFIX.length).split('.');
  if (!payloadPart || !sigPart || extra !== undefined) return null;
  return { payloadPart, sigPart };
}

export function normaliseMachineId(s: string) {
  return s.toUpperCase().replace(/[^0-9A-F]/g, '').replace(/(.{4})(?=.)/g, '$1-');
}

/** Days from `now` until the end of `ymd` (UTC). */
export function daysUntil(ymd: string, now: number) {
  const end = Date.parse(ymd + 'T23:59:59Z');
  return Math.floor((end - now) / 86400000);
}

export function addDays(ymd: string, days: number) {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

export function whatsappLink(number: string, text: string) {
  const n = number.replace(/[^0-9]/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function requestMessage(machineId: string, name: string, renew: boolean) {
  return `Hello ERA Technologiz, I would like a FixMyCircuit ${renew ? 'renewal' : 'licence'} key.\nMachine ID: ${machineId}${name ? `\nShop: ${name}` : ''}\nPlan (days): `;
}
