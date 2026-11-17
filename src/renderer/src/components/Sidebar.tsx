import { useEffect, useRef, useState } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, type TreeModel } from '../api';
import { CATEGORIES, categoryLabel, type Nav } from '../types';
import { Icon } from './Icon';

interface Props {
  brands: Brand[];
  models: TreeModel[];
  nav: Nav | null;
  onNav: (n: Nav) => void;
  onReload: () => void;
  onImport: () => void;
  onSettings: () => void;
  onOpenFile: (f: LibraryFile) => void;
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
  modelLabel: (id: number | null) => string;
}

type SearchResult = Awaited<ReturnType<typeof api.search>>;

export default function Sidebar(p: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('fmc.tree') || '{}'); } catch { return {}; }
  });
  const [openModels, setOpenModels] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState<number | 'brand' | null>(null);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem('fmc.tree', JSON.stringify(open)); } catch { /* ignore */ }
  }, [open]);

  useEffect(() => {
    if (p.nav?.kind === 'model') {
      const m = p.models.find((x) => x.id === (p.nav as any).modelId);
      if (m) { setOpen((o) => ({ ...o, [m.brand_id]: true })); setOpenModels((o) => ({ ...o, [m.id]: true })); }
    }
  }, [p.nav, p.models]);

  useEffect(() => {
    const t = setTimeout(async () => setResults(q.trim().length >= 2 ? await api.search(q.trim()) : null), 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitAdd = async () => {
    const n = name.trim();
    if (!n) return setAdding(null);
    if (adding === 'brand') await api.addBrand(n);
    else if (typeof adding === 'number') {
      const m = await api.addModel(adding, n);
      p.onNav({ kind: 'model', modelId: m.id, category: 'faults' });
    }
    setName('');
    setAdding(null);
    p.onReload();
  };

  const isNav = (modelId: number, c: string) => p.nav?.kind === 'model' && p.nav.modelId === modelId && p.nav.category === c;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-bench-700 bg-bench-900">
      <div className="flex items-center gap-2 border-b border-bench-700 px-3 py-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-amber-500/20 text-amber-400"><Icon name="chip" /></div>
        <button className="text-left" onClick={() => p.onNav({ kind: 'home' })}>
          <div className="text-sm font-semibold leading-tight text-slate-100">FixMyCircuit</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Repair workbench</div>
        </button>
      </div>
      <div className="relative px-3 py-2">
        <input
          ref={searchRef}
          className="input pl-7"
          placeholder="Search everything (Ctrl+K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
        <span className="pointer-events-none absolute left-5 top-[15px] text-slate-500"><Icon name="search" size={13} /></span>
        {results && (
          <div className="absolute left-3 right-3 top-10 z-30 max-h-[70vh] overflow-auto rounded-md border border-bench-600 bg-bench-850 p-1 shadow-2xl">
            {!results.models.length && !results.files.length && !results.guides.length && !results.readings.length && (
              <div className="p-2 text-slate-500">No matches</div>
            )}
            <ResultGroup title="Models" items={results.models.map((m) => ({ key: 'm' + m.id, label: `${m.brand} ${m.name}`, onClick: () => p.onNav({ kind: 'model', modelId: m.id, category: 'faults' }) }))} />
            <ResultGroup title="Files" items={results.files.map((f) => ({ key: 'f' + f.id, label: f.name, sub: p.modelLabel(f.model_id), onClick: () => (f.kind === 'photo' ? api.listPhotos(f.model_id).then((ps) => { const ph = ps.find((x) => x.file_id === f.id); if (ph) p.onOpenPhoto(ph.id, ph.title, ph.model_id); }) : p.onOpenFile(f)) }))} />
            <ResultGroup title="Fault solutions" items={results.guides.map((g) => ({ key: 'g' + g.id, label: g.title, sub: p.modelLabel(g.model_id), onClick: () => g.model_id != null && p.onNav({ kind: 'model', modelId: g.model_id, category: 'faults' }) }))} />
            <ResultGroup title="Readings" items={results.readings.map((r) => ({ key: 'r' + r.id, label: `${r.part}${r.pin ? '.' + r.pin : ''} ${r.net} ${r.value}`.trim(), sub: p.modelLabel(r.model_id), onClick: () => r.model_id != null && p.onNav({ kind: 'model', modelId: r.model_id, category: 'readings' }) }))} />
          </div>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {p.brands.map((b) => {
          const ms = p.models.filter((m) => m.brand_id === b.id);
          const isOpen = !!open[b.id];
          return (
            <div key={b.id}>
              <div className="group flex items-center rounded px-1.5 py-1 hover:bg-bench-800">
                <button className="flex flex-1 items-center gap-1.5 text-left font-medium text-slate-200" onClick={() => setOpen({ ...open, [b.id]: !isOpen })}>
                  <Icon name={isOpen ? 'chevDown' : 'chevRight'} size={12} />
                  {b.name}
                  <span className="text-[11px] font-normal text-slate-500">{ms.length || ''}</span>
                </button>
                <button title={`Add ${b.name} model`} className="btn-ghost opacity-0 group-hover:opacity-100" onClick={() => { setAdding(b.id); setOpen({ ...open, [b.id]: true }); }}>
                  <Icon name="plus" size={12} />
                </button>
              </div>
              {isOpen && (
                <div className="ml-3 border-l border-bench-700 pl-1">
                  {adding === b.id && (
                    <input autoFocus className="input my-1 py-0.5" placeholder="Model name, e.g. Spark 10 (KI5)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(null); }} onBlur={submitAdd} />
                  )}
                  {!ms.length && adding !== b.id && (
                    <button className="px-2 py-1 text-[12px] text-slate-500 hover:text-amber-300" onClick={() => setAdding(b.id)}>+ Add a model</button>
                  )}
                  {ms.map((m) => (
                    <div key={m.id}>
                      <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-slate-300 hover:bg-bench-800" onClick={() => setOpenModels({ ...openModels, [m.id]: !openModels[m.id] })}>
                        <Icon name={openModels[m.id] ? 'chevDown' : 'chevRight'} size={11} />
                        <span className="truncate">{m.name}</span>
                      </button>
                      {openModels[m.id] && (
                        <div className="ml-3 pl-1">
                          {CATEGORIES.map((c) => {
                            const count = c === 'faults' ? m.guides : c === 'readings' ? m.readings : c === 'photos' ? m.photos : undefined;
                            return (
                              <button
                                key={c}
                                className={`flex w-full items-center gap-2 rounded px-2 py-[3px] text-left text-[12px] ${isNav(m.id, c) ? 'bg-amber-500/15 text-amber-200' : 'text-slate-400 hover:bg-bench-800 hover:text-slate-200'}`}
                                onClick={() => p.onNav({ kind: 'model', modelId: m.id, category: c })}
                              >
                                <Icon name={catIcon[c]} size={12} />
                                <span className="flex-1">{categoryLabel(c)}</span>
                                {count ? <span className="text-[10px] text-slate-500">{count}</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {adding === 'brand' ? (
          <input autoFocus className="input mt-2" placeholder="Brand name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(null); }} onBlur={submitAdd} />
        ) : (
          <button className="mt-1 px-2 py-1 text-[12px] text-slate-500 hover:text-amber-300" onClick={() => setAdding('brand')}>+ Add brand</button>
        )}
        <button
          className={`mt-2 flex w-full items-center gap-2 rounded px-2 py-1 text-left ${p.nav?.kind === 'unsorted' ? 'bg-amber-500/15 text-amber-200' : 'text-slate-400 hover:bg-bench-800'}`}
          onClick={() => p.onNav({ kind: 'unsorted' })}
        >
          <Icon name="inbox" size={13} /> Unsorted files
        </button>
      </nav>
      <div className="flex gap-2 border-t border-bench-700 p-2">
        <button className="btn-primary flex-1 justify-center" onClick={p.onImport}><Icon name="upload" size={13} /> Import files</button>
        <button className="btn" title="Settings and offline storage" onClick={p.onSettings}><Icon name="gear" size={14} /></button>
      </div>
    </aside>
  );
}

const catIcon = { faults: 'wrench', readings: 'meter', schematics: 'doc', boardview: 'board', photos: 'camera' } as const;

function ResultGroup({ title, items }: { title: string; items: { key: string; label: string; sub?: string; onClick: () => void }[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-1">
      <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {items.map((i) => (
        <button key={i.key} className="block w-full truncate rounded px-2 py-1 text-left hover:bg-bench-700" onClick={i.onClick}>
          <span className="text-slate-200">{i.label}</span>
          {i.sub && <span className="ml-2 text-[11px] text-slate-500">{i.sub}</span>}
        </button>
      ))}
    </div>
  );
}
