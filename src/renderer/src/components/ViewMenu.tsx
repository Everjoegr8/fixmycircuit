import { useEffect, useRef, useState } from 'react';
import { PANELS, layout, useLayout } from '../lib/layout';
import { Icon } from './Icon';

/** The View menu: tick what you want on screen, or go full board. */
export function ViewMenuList({ onPick }: { onPick?: () => void }) {
  const l = useLayout();
  return (
    <div className="w-80 rounded-md border border-bench-600 bg-bench-850 p-1 text-[12.5px] shadow-2xl" data-testid="view-menu" role="menu">
      <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bench-700" onClick={() => { layout.setFull(!l.full); onPick?.(); }} data-testid="view-full" role="menuitemcheckbox" aria-checked={l.full}>
        <Icon name="fit" size={14} /> <span className="flex-1 font-semibold text-amber-200">{l.full ? 'Leave full board' : 'Full board (hide everything)'}</span>
        <span className="text-[11px] text-slate-500">F11</span>
      </button>
      <div className="my-1 border-t border-bench-700" />
      {PANELS.map((p) => (
        <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-bench-700" title={p.hint} role="menuitemcheckbox" aria-checked={l.show[p.key]}>
          <input type="checkbox" checked={!l.full && l.show[p.key]} onChange={() => layout.toggle(p.key)} data-testid={`view-${p.key}`} />
          <span className="flex-1 text-slate-200">{p.label}</span>
          {p.keys && <span className="text-[11px] text-slate-500">{p.keys}</span>}
        </label>
      ))}
      <div className="my-1 border-t border-bench-700" />
      <button className="w-full rounded px-2 py-1 text-left text-slate-300 hover:bg-bench-700" onClick={() => { layout.showAll(); onPick?.(); }} data-testid="view-all">Show everything</button>
      <div className="px-2 pb-1 pt-0.5 text-[11px] text-slate-500">Your layout is kept for next time.</div>
    </div>
  );
}

/** A View button that opens the menu below (or above) it. */
export default function ViewMenu({ className = '', label = true, up = false, left = false, testid = 'view-menu-btn' }: { className?: string; label?: boolean; up?: boolean; left?: boolean; testid?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', f);
    return () => window.removeEventListener('mousedown', f);
  }, [open]);
  return (
    <div className="relative flex" ref={ref}>
      <button className={className} onClick={() => setOpen((x) => !x)} title="Show or hide panels (View)" data-testid={testid} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="grid" size={14} />{label && <span>View</span>}
      </button>
      {open && <div className={`absolute ${left ? 'left-0' : 'right-0'} z-50 ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`}><ViewMenuList onPick={() => setOpen(false)} /></div>}
    </div>
  );
}
