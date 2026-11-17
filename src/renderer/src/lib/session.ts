// The last document a technician worked on, for "Continue your work" on Home.
export interface LastSession { key: string; type: 'pdf' | 'board' | 'photo'; id: string | number; title: string; modelId: number | null; label: string; at: string }
const KEY = 'fmc.lastSession';
const HIST = 'fmc.history';

export function saveSession(s: Omit<LastSession, 'at'>) {
  try {
    const v: LastSession = { ...s, at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(v));
    const h: LastSession[] = JSON.parse(localStorage.getItem(HIST) || '[]').filter((x: LastSession) => x.key !== v.key);
    localStorage.setItem(HIST, JSON.stringify([v, ...h].slice(0, 12)));
  } catch { /* ignore */ }
}

export function lastSession(): LastSession | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function history(): LastSession[] {
  try { return JSON.parse(localStorage.getItem(HIST) || '[]'); } catch { return []; }
}

export function forgetSession(key: string) {
  try {
    const l = lastSession();
    if (l?.key === key) localStorage.removeItem(KEY);
    localStorage.setItem(HIST, JSON.stringify(history().filter((x) => x.key !== key)));
  } catch { /* ignore */ }
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
