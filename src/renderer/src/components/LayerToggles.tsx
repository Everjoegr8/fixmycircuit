import { useEffect, useState } from 'react';
import { LAYERS, type LayerId } from '@shared/layers';

const KEY = 'fmc.layers';
const DEFAULT: LayerId[] = ['charging', 'display', 'touch', 'audio', 'rf'];

/**
 * Enabled layers, remembered between runs. Photos and boards keep their own
 * set: boards start with none, so the board looks clean like a repair tool.
 */
export function useLayers(scope: 'photo' | 'board' = 'photo'): [Set<LayerId>, (id: LayerId, on: boolean) => void, (all: boolean) => void] {
  const key = scope === 'board' ? 'fmc.boardLayers' : KEY;
  const def: LayerId[] = scope === 'board' ? [] : DEFAULT;
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return new Set<LayerId>(Array.isArray(v) ? v : def); } catch { return new Set<LayerId>(def); }
  };
  const [set, setSet] = useState<Set<LayerId>>(read);
  useEffect(() => {
    const f = () => setSet(read());
    window.addEventListener('fmc-layers', f);
    return () => window.removeEventListener('fmc-layers', f);
  }, []);
  const write = (next: Set<LayerId>) => {
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
    window.dispatchEvent(new Event('fmc-layers'));
    setSet(next);
  };
  const toggle = (id: LayerId, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    write(next);
  };
  const all = (on: boolean) => write(new Set(on ? LAYERS.map((l) => l.id) : []));
  return [set, toggle, all];
}

export default function LayerToggles({ counts, title = 'Trace layers', extra, scope = 'photo' }: { counts?: Partial<Record<LayerId, number>>; title?: string; extra?: React.ReactNode; scope?: 'photo' | 'board' }) {
  const [on, toggle, all] = useLayers(scope);
  const [open, setOpen] = useState(scope !== 'board');
  return (
    <div className="w-52 rounded-lg border border-bench-600 bg-bench-900/95 p-2 text-[12px] shadow-2xl" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} data-testid="layer-toggles">
      <div className="flex items-center">
        <button className="flex-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {title}</button>
        {open && <button className="btn-ghost text-[10px]" onClick={() => all(on.size < LAYERS.length)}>{on.size < LAYERS.length ? 'All' : 'None'}</button>}
      </div>
      {open && (
        <div className="mt-1 space-y-0.5">
          {LAYERS.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-bench-800">
              <input type="checkbox" checked={on.has(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} data-layer={l.id} />
              <span className="h-2.5 w-5 rounded-sm" style={{ background: l.color }} />
              <span className="flex-1 text-slate-200">{l.label}</span>
              {counts?.[l.id] != null && <span className="text-[10px] text-slate-500">{counts[l.id]}</span>}
            </label>
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}
