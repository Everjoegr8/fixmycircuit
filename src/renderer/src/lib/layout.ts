// Which panels are on screen. Every panel can be hidden from the View menu so
// the board can fill the screen; the choice is kept between sessions.
import { useEffect, useState } from 'react';

export type PanelKey = 'sidebar' | 'tabs' | 'banner' | 'status' | 'repair' | 'toolbar' | 'info' | 'pins';

export const PANELS: { key: PanelKey; label: string; hint: string; keys?: string }[] = [
  { key: 'sidebar', label: 'Model library (left)', hint: 'Brand > Series > Model, search and workbench', keys: 'Ctrl+B' },
  { key: 'tabs', label: 'Tabs', hint: 'Open documents, Split and View buttons' },
  { key: 'toolbar', label: 'Toolbar', hint: 'Search, side, zoom, Pins, Diode map (boards, schematics and photos)', },
  { key: 'pins', label: 'NET / Component panel', hint: 'Pin tables and part lookup (right)', keys: 'Ctrl+J' },
  { key: 'info', label: 'Part and net card', hint: 'The card on the board for the selected part or net', },
  { key: 'repair', label: 'Repair panel', hint: 'Faults, measurements and notes (right)', keys: 'Ctrl+E' },
  { key: 'banner', label: 'Trial notice', hint: 'The licence line at the top (the status bar still shows it)' },
  { key: 'status', label: 'Status bar', hint: 'Version and licence line at the bottom' },
];

export interface Layout { show: Record<PanelKey, boolean>; full: boolean }

const KEY = 'fmc.layout';
const EVT = 'fmc-layout';

function initial(): Layout {
  const show = Object.fromEntries(PANELS.map((p) => [p.key, true])) as Record<PanelKey, boolean>;
  try {
    // Carry over the older single switches.
    if (localStorage.getItem('fmc.pinsPanel') === '0') show.pins = false;
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && typeof j === 'object') {
      for (const p of PANELS) if (typeof j.show?.[p.key] === 'boolean') show[p.key] = j.show[p.key];
      return { show, full: !!j.full };
    }
  } catch { /* private mode */ }
  return { show, full: false };
}

let state: Layout = initial();

function set(next: Layout) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT));
}

export const layout = {
  get: () => state,
  /** Is this panel on screen now (full board hides everything)? */
  on: (k: PanelKey) => !state.full && state.show[k],
  toggle(k: PanelKey) {
    // Asking for a panel while in full board leaves full board with just that change.
    if (state.full) return set({ full: false, show: { ...state.show, [k]: true } });
    set({ ...state, show: { ...state.show, [k]: !state.show[k] } });
  },
  setShown(k: PanelKey, v: boolean) { set({ full: false, show: { ...state.show, [k]: v } }); },
  setFull(v: boolean) { set({ ...state, full: v }); },
  showAll() { set({ full: false, show: Object.fromEntries(PANELS.map((p) => [p.key, true])) as Record<PanelKey, boolean> }); },
};

export function useLayout(): Layout {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener(EVT, f);
    return () => window.removeEventListener(EVT, f);
  }, []);
  return state;
}

/** Shortcut keys for the View menu. */
export function layoutKey(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F11' || (mod && e.shiftKey && e.key.toLowerCase() === 'f')) { layout.setFull(!state.full); return true; }
  if (!mod || e.altKey || e.shiftKey) return false;
  const k = ({ b: 'sidebar', j: 'pins', e: 'repair' } as Record<string, PanelKey>)[e.key.toLowerCase()];
  if (!k) return false;
  layout.toggle(k);
  return true;
}
