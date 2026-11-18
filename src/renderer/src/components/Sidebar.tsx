import { useEffect, useRef, useState } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, type TreeModel } from '../api';
import { guessSeries } from '@shared/libsort';
import { CATEGORIES, TOOLS, categoryLabel, type Nav } from '../types';
import { Icon } from './Icon';
import { AppMark, EraBadge } from '../brand/Logo';
import { useTheme } from '../lib/theme';

interface Props {
  brands: Brand[];
  models: TreeModel[];
  nav: Nav | null;
  onNav: (n: Nav) => void;
  onReload: () => void;
  onImport: () => void;
  onSettings: () => void;
  onAbout: () => void;
  onOpenFile: (f: LibraryFile) => void;
  /** Open a model: its board if it has one (like picking the phone in a repair tool), else its page. */
  onOpenModel: (m: TreeModel) => void;
  onAddFolder: () => void;
  recent: LibraryFile[];
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
  modelLabel: (id: number | null) => string;
}

type SearchResult = Awaited<ReturnType<typeof api.search>>;

export default function Sidebar(p: Props) {
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('fmc.tree') || '{}'); } catch { return {}; }
  });
  const [openModels, setOpenModels] = useState<Record<number, boolean>>({});
  const [seriesOpen, setSeriesOpen] = useState<Record<string, boolean>>({});
  const [recentOpen, setRecentOpen] = useState(true);
  const [mq, setMq] = useState('');
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
        <button className="flex items-center gap-2 text-left" onClick={() => p.onNav({ kind: 'home' })} data-testid="brand-home">
          <AppMark size={30} />
          <div>
            <div className="font-display text-[15px] font-semibold leading-tight text-slate-100">Fix<span className="text-amber-300">My</span>Circuit</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Repair workbench</div>
          </div>
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
        <button
          className={`mt-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left ${p.nav?.kind === 'home' ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300 hover:bg-bench-800'}`}
          onClick={() => p.onNav({ kind: 'home' })}
        >
          <Icon name="home" size={13} /> Command centre
        </button>
        <div className="flex items-center px-2 pb-1 pt-3">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Model library</span>
        </div>
        <button className="mx-1 mb-1.5 flex w-[calc(100%-8px)] items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-500/50 px-2 py-1.5 text-[12.5px] text-amber-200 hover:bg-amber-500/10" onClick={p.onAddFolder} data-testid="add-folder" title="Scan a folder (and its sub-folders) and sort every board into Brand, Series and Model. You can also drop folders anywhere on the window.">
          <Icon name="folder" size={13} /> Add a folder of boards
        </button>
        <div className="relative mx-1 mb-1">
          <input className="input py-0.5 pl-6 text-[12px]" placeholder="Find a model, e.g. Camon 20" value={mq} onChange={(e) => setMq(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setMq('')} data-testid="model-filter" />
          <span className="pointer-events-none absolute left-2 top-[6px] text-slate-500"><Icon name="search" size={11} /></span>
        </div>
        {!mq && p.recent.length > 0 && (
          <div className="mb-1">
            <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-medium text-slate-300 hover:bg-bench-800" onClick={() => setRecentOpen((x) => !x)} data-recent="1">
              <Icon name={recentOpen ? 'chevDown' : 'chevRight'} size={12} /> <Icon name="clock" size={12} /> Recently opened
            </button>
            {recentOpen && (
              <div className="ml-3 border-l border-bench-700 pl-1" data-testid="recent-list">
                {p.recent.map((f) => (
                  <button key={f.id} className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-[3px] text-left text-[12px] text-slate-400 hover:bg-bench-800 hover:text-slate-200" onClick={() => p.onOpenFile(f)} title={`${p.modelLabel(f.model_id)} · ${f.name}`}>
                    <Icon name={f.kind === 'schematic' ? 'doc' : 'board'} size={11} />
                    <span className="truncate">{p.modelLabel(f.model_id) !== 'Unsorted' ? p.modelLabel(f.model_id) : f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {p.brands.map((b) => {
          const all = p.models.filter((m) => m.brand_id === b.id);
          const t = mq.trim().toLowerCase();
          const ms = t ? all.filter((m) => `${b.name} ${m.series || ''} ${m.name}`.toLowerCase().includes(t)) : all;
          if (t && !ms.length) return null;
          const isOpen = !!t || !!open[b.id];
          // Group by series (from the library folder / model.json, else worked out from the name).
          const groups = new Map<string, TreeModel[]>();
          for (const m of ms) {
            const sr = m.series || guessSeries(b.name, m.name) || '';
            let g = groups.get(sr);
            if (!g) groups.set(sr, (g = []));
            g.push(m);
          }
          const allSeries = new Set(all.map((m) => m.series || guessSeries(b.name, m.name) || ''));
          const useSeries = allSeries.size > 1 || (allSeries.size === 1 && !allSeries.has('') && all.length > 1);
          const modelRow = (m: TreeModel) => (
            <div key={m.id}>
              <div className={`group flex items-center rounded ${p.nav?.kind === 'model' && (p.nav as any).modelId === m.id ? 'bg-bench-800' : 'hover:bg-bench-800'}`}>
                <button className="px-1 py-1 text-slate-500 hover:text-slate-200" title="Show this model's folders" onClick={() => setOpenModels({ ...openModels, [m.id]: !openModels[m.id] })}>
                  <Icon name={openModels[m.id] ? 'chevDown' : 'chevRight'} size={11} />
                </button>
                <button className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1.5 text-left text-slate-300" onClick={() => p.onOpenModel(m)} title={m.boardviews ? 'Open the board' : 'Open this model'} data-model={m.name}>
                  <span className="truncate">{m.name}</span>
                  {m.boardviews > 0 && <Icon name="board" size={11} className="shrink-0 text-amber-300/70" />}
                </button>
              </div>
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
          );
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
                  {useSeries
                    ? [...groups.entries()].sort((x, y) => (x[0] || '~').localeCompare(y[0] || '~', undefined, { numeric: true })).map(([sr, list]) => {
                        const key = `${b.id}:${sr}`;
                        const so = !!t || seriesOpen[key] !== false;
                        return (
                          <div key={key} data-series={sr || 'Other'}>
                            <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[12.5px] text-slate-300 hover:bg-bench-800" onClick={() => setSeriesOpen({ ...seriesOpen, [key]: !so })}>
                              <Icon name={so ? 'chevDown' : 'chevRight'} size={11} /> <Icon name="folder" size={11} className="text-slate-500" /> {sr || 'Other'}
                              <span className="text-[10.5px] text-slate-500">{list.length}</span>
                            </button>
                            {so && <div className="ml-3 border-l border-bench-800 pl-1">{list.map(modelRow)}</div>}
                          </div>
                        );
                      })
                    : ms.map(modelRow)}
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
        <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workbench</div>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${p.nav?.kind === 'tool' && p.nav.tool === t.id ? 'bg-amber-500/15 text-amber-200' : 'text-slate-300 hover:bg-bench-800'}`}
            onClick={() => p.onNav({ kind: 'tool', tool: t.id })}
            data-tool={t.id}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </nav>
      <div className="flex gap-2 border-t border-bench-700 p-2">
        <button className="btn-primary flex-1 justify-center" onClick={p.onImport}><Icon name="upload" size={13} /> Import files</button>
        <ThemeButton />
        <button className="btn" title="Settings and offline storage" onClick={p.onSettings}><Icon name="gear" size={14} /></button>
      </div>
      <button className="flex items-center justify-between border-t border-bench-700 px-3 py-2 text-left hover:bg-bench-850" onClick={p.onAbout} data-testid="about-btn" title="About FixMyCircuit">
        <EraBadge />
        <Icon name="info" size={13} className="text-slate-500" />
      </button>
    </aside>
  );
}

function ThemeButton() {
  const { theme, setPref } = useTheme();
  return (
    <button className="btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setPref(theme === 'dark' ? 'light' : 'dark')} data-testid="theme-toggle">
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
    </button>
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
