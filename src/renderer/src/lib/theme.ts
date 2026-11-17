// Light / dark theme. Stored per PC in localStorage; "system" follows Windows.
import { useEffect, useState } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'fmc.theme';
const mq = () => window.matchMedia?.('(prefers-color-scheme: light)');

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'light' || v === 'system') return v; } catch { /* ignore */ }
  return 'dark';
}

export function resolvedTheme(pref = getThemePref()): 'dark' | 'light' {
  return pref === 'system' ? (mq()?.matches ? 'light' : 'dark') : pref;
}

export function applyTheme(pref = getThemePref()) {
  const t = resolvedTheme(pref);
  document.documentElement.dataset.theme = t;
  window.dispatchEvent(new CustomEvent('fmc-theme', { detail: t }));
}

export function setThemePref(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme(pref);
}

/** Current resolved theme, re-rendering when it changes. */
export function useTheme() {
  const [t, setT] = useState<'dark' | 'light'>(() => resolvedTheme());
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => {
    const on = () => { setT(resolvedTheme()); setPref(getThemePref()); };
    window.addEventListener('fmc-theme', on);
    const m = mq();
    const sys = () => getThemePref() === 'system' && applyTheme();
    m?.addEventListener?.('change', sys);
    return () => { window.removeEventListener('fmc-theme', on); m?.removeEventListener?.('change', sys); };
  }, []);
  return { theme: t, pref, setPref: setThemePref };
}

export function isLight() {
  return document.documentElement.dataset.theme === 'light';
}
