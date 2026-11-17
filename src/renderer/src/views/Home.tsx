// Home: the repair command centre. Every number on this page comes from the
// local library; nothing is invented.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, fileUrl, type ActivityItem, type DayCount, type TreeModel } from '../api';
import { Icon } from '../components/Icon';
import { TOOLS, type Nav } from '../types';
import { history, lastSession, timeAgo, type LastSession } from '../lib/session';
import { PHOTOS } from '../assets/photos';
import { AppMark } from '../brand/Logo';

interface Props {
  models: TreeModel[];
  brands: Brand[];
  onNav: (n: Nav) => void;
  onImport: () => void;
  onOpenFile: (f: LibraryFile) => void;
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
  onOpenDoc: (d: LastSession) => void;
  onReload: () => void;
  rev: number;
}

type Activity = Awaited<ReturnType<typeof api.activity>>;

export default function Home(p: Props) {
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [act, setAct] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('fmc.libView') as 'grid' | 'list') || 'grid');
  const [brandFilter, setBrandFilter] = useState<number | null>(null);
  const libRef = useRef<HTMLDivElement>(null);
  const last = lastSession();
  const hist = history();

  useEffect(() => {
    api.recentActivity(8).then(setRecent);
    api.activity(14).then(setAct);
  }, [p.rev]);
  useEffect(() => { try { localStorage.setItem('fmc.libView', view); } catch { /* ignore */ } }, [view]);

  const brandName = (id: number) => p.brands.find((b) => b.id === id)?.name ?? '';
  const label = (id: number | null) => {
    const m = p.models.find((x) => x.id === id);
    return m ? `${brandName(m.brand_id)} ${m.name}` : 'Unsorted';
  };
  const demo = p.models.filter((m) => m.demo);
  const loadDemo = async () => { setBusy(true); await api.loadDemo(); setBusy(false); p.onReload(); };
  const removeDemo = async () => { setBusy(true); await api.removeDemo(); setBusy(false); p.onReload(); };

  const totals = p.models.reduce(
    (t, m) => ({ files: t.files + m.files, guides: t.guides + m.guides, readings: t.readings + m.readings, photos: t.photos + m.photos }),
    { files: 0, guides: 0, readings: 0, photos: 0 },
  );

  const models = useMemo(() => {
    const t = q.trim().toLowerCase();
    return p.models
      .filter((m) => (brandFilter == null || m.brand_id === brandFilter) && (!t || `${brandName(m.brand_id)} ${m.name}`.toLowerCase().includes(t)))
      .sort((a, b) => (b.last_activity || '').localeCompare(a.last_activity || '') || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.models, p.brands, q, brandFilter]);

  /** Model to act on for quick actions: the one worked on last, else the first. */
  const focusModel = p.models.find((m) => m.id === last?.modelId) || models[0] || null;

  const openKind = async (kind: 'schematic' | 'boardview') => {
    const files = (await api.listFiles(focusModel?.id ?? undefined, kind));
    const f = files[0] || (await api.listFiles(undefined, kind))[0];
    if (f) p.onOpenFile(f);
    else p.onImport();
  };
  const openRecent = async (a: ActivityItem) => {
    if (a.type === 'file') {
      const f = (await api.listFiles(a.model_id)).find((x) => x.id === a.ref);
      if (f) p.onOpenFile(f);
    } else if (a.type === 'photo') p.onOpenPhoto(Number(a.ref), a.title, a.model_id);
    else if (a.model_id != null) p.onNav({ kind: 'model', modelId: a.model_id, category: a.type === 'guide' ? 'faults' : 'readings' });
  };

  const series = (k: keyof Activity) => days14(act?.[k] || []);

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 p-6" data-testid="home">
      {/* Hero */}
      <section className="fmc-rise relative overflow-hidden rounded-2xl border border-bench-700 bg-[#0b0f14]" data-testid="hero">
        {PHOTOS.hero && <img src={PHOTOS.hero} alt="Microscope view of a phone board under repair" className="absolute inset-0 h-full w-full object-cover object-[75%_45%]" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f14] via-[#0b0f14cc] to-[#0b0f1426]" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" preserveAspectRatio="none" viewBox="0 0 800 260" aria-hidden>
          <path d="M0 252 H220 L236 240 H420 L432 250 H800" fill="none" stroke="#37C9E8" strokeWidth="1.2" className="fmc-trace" />
          <path d="M560 0 V18 L580 34 H800" fill="none" stroke="#F2B544" strokeWidth="1.2" className="fmc-trace" style={{ animationDelay: '-.8s' }} />
        </svg>
        <div className="relative grid gap-6 p-7 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              <AppMark size={18} /> Repair command centre
            </div>
            <h1 className="mt-3 font-display text-[34px] font-semibold leading-tight tracking-tight text-white">Your repair bench is ready.</h1>
            <p className="mt-2 max-w-xl text-[14px] text-[#c8d2de]">
              Open a schematic and boardview side by side, light up any net, trace a path between parts, and keep your shop's own readings and fixes. Everything stays on this PC.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-solid" onClick={() => (last ? p.onOpenDoc(last) : focusModel ? p.onNav({ kind: 'model', modelId: focusModel.id, category: 'faults' }) : p.onImport())} data-testid="start-repair">
                <Icon name="play" size={14} /> Start a repair
              </button>
              <button className="btn border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => libRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                <Icon name="grid" size={14} /> Open device library
              </button>
              <button className="btn border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={p.onImport}>
                <Icon name="upload" size={14} /> Import files
              </button>
            </div>
          </div>
          <ContinueCard last={last} hist={hist} onOpen={p.onOpenDoc} />
        </div>
      </section>

      {/* Demo label */}
      {demo.length > 0 ? (
        <div className="fmc-rise flex flex-wrap items-center gap-2 text-[12px]" data-testid="demo-banner" style={{ animationDelay: '60ms' }}>
          <span className="rounded-full border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-200">Demo mode</span>
          <span className="text-slate-400">{demo.length} sample models share one synthetic board. Their readings are made up for practice, not taken from real phones.</span>
          <button className="btn-ghost" disabled={busy} onClick={removeDemo} title="Delete the demo models and their files">Remove demo</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-slate-400">Want to try every feature first?</span>
          <button className="btn-primary" disabled={busy} onClick={loadDemo} data-testid="load-demo">Load demo workshop</button>
          <button className="btn-ghost" onClick={() => api.saveSamples()}><Icon name="download" size={12} /> Save sample files…</button>
        </div>
      )}

      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="stats">
        {([
          ['Devices', p.models.length, 'phone', null, '#F2B544'],
          ['Library files', totals.files, 'doc', series('files'), '#37C9E8'],
          ['Fault solutions', totals.guides, 'wrench', series('guides'), '#6FD69B'],
          ['Readings', totals.readings, 'meter', series('readings'), '#E879F9'],
          ['Board photos', totals.photos, 'camera', series('photos'), '#7DD3FC'],
        ] as const).map(([k, v, icon, s, color], i) => (
          <div key={k} className="card fmc-rise p-3" style={{ animationDelay: `${80 + i * 50}ms` }}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500"><Icon name={icon} size={12} /> {k}</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="font-display text-[26px] font-semibold leading-none text-slate-100"><Counter value={v} /></div>
              {s ? <Spark data={s} color={color} /> : <span className="text-[11px] text-slate-500">{p.brands.length} brands</span>}
            </div>
            {s && <div className="mt-1 text-[10.5px] text-slate-500">{sum(s) ? `+${sum(s)} in the last 14 days` : 'No new items in 14 days'}</div>}
          </div>
        ))}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="section-title">Quick actions{focusModel ? <span className="ml-1 normal-case tracking-normal text-slate-500">· for {label(focusModel.id)}</span> : null}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="quick-actions">
          <Quick color="#37C9E8" icon="doc" title="Open schematic" sub="Search parts and nets in the PDF" onClick={() => openKind('schematic')} />
          <Quick color="#F2B544" icon="board" title="Open boardview" sub="Click a pin, light the net" onClick={() => openKind('boardview')} />
          <Quick color="#E879F9" icon="scope" title="Capture board photo" sub="Live microscope, freeze, save" onClick={() => p.onNav({ kind: 'tool', tool: 'microscope' })} />
          <Quick color="#6FD69B" icon="wrench" title="Add fault solution" sub="Write down a fix that worked" onClick={() => (focusModel ? p.onNav({ kind: 'model', modelId: focusModel.id, category: 'faults' }) : p.onImport())} />
          <Quick color="#F59E0B" icon="meter" title="Record measurement" sub="Diode, voltage, resistance" onClick={() => (focusModel ? p.onNav({ kind: 'model', modelId: focusModel.id, category: 'readings' }) : p.onImport())} />
          <Quick color="#7DD3FC" icon="upload" title="Import documents" sub="PDF, boardview, photos" onClick={p.onImport} />
        </div>
      </section>

      {/* Device library */}
      <section ref={libRef} data-testid="device-library">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="section-title mb-0 mr-2">Device library</h2>
          <div className="relative w-64">
            <input className="input pl-7" placeholder="Search devices" value={q} onChange={(e) => setQ(e.target.value)} data-testid="device-search" />
            <span className="pointer-events-none absolute left-2 top-[7px] text-slate-500"><Icon name="search" size={13} /></span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button className={`chip ${brandFilter == null ? 'border-amber-400 text-amber-200' : ''}`} onClick={() => setBrandFilter(null)}>All</button>
            {p.brands.filter((b) => p.models.some((m) => m.brand_id === b.id)).map((b) => (
              <button key={b.id} className={`chip ${brandFilter === b.id ? 'border-amber-400 text-amber-200' : ''}`} onClick={() => setBrandFilter(brandFilter === b.id ? null : b.id)}>{b.name}</button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex overflow-hidden rounded-md border border-bench-600">
            <button className={`px-2 py-1 ${view === 'grid' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-bench-800'}`} onClick={() => setView('grid')} title="Grid" data-testid="view-grid"><Icon name="grid" size={13} /></button>
            <button className={`px-2 py-1 ${view === 'list' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-bench-800'}`} onClick={() => setView('list')} title="List" data-testid="view-list"><Icon name="list" size={13} /></button>
          </div>
        </div>
        {!p.models.length && (
          <div className="card p-6 text-center text-slate-400">No devices yet. Add a model under a brand in the sidebar, or import a schematic or boardview and FixMyCircuit will suggest the brand.</div>
        )}
        {p.models.length > 0 && !models.length && <div className="card p-4 text-slate-500">No device matches “{q}”.</div>}
        {view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {models.map((m, i) => <DeviceCard key={m.id} m={m} brand={brandName(m.brand_id)} i={i} onNav={p.onNav} />)}
          </div>
        ) : (
          <div className="card divide-y divide-bench-700">
            {models.map((m) => <DeviceRow key={m.id} m={m} brand={brandName(m.brand_id)} onNav={p.onNav} />)}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Workshop tools */}
        <section>
          <h2 className="section-title">Workshop tools</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {TOOLS.map((t) => (
              <button key={t.id} className="card lift group overflow-hidden text-left" onClick={() => p.onNav({ kind: 'tool', tool: t.id })} data-testid={`tool-card-${t.id}`}>
                <div className="relative h-20 overflow-hidden bg-bench-800">
                  {PHOTOS[t.id] ? (
                    <img src={PHOTOS[t.id]} alt="" className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105 group-hover:opacity-100" />
                  ) : (
                    <ToolArt id={t.id} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-bench-850 to-transparent" />
                  <div className="absolute bottom-1.5 left-2 grid h-7 w-7 place-items-center rounded-md bg-bench-900/90 text-amber-300"><Icon name={t.icon} size={15} /></div>
                </div>
                <div className="p-2.5 pt-1.5">
                  <div className="font-semibold text-slate-100">{t.label}</div>
                  <div className="text-[11px] text-slate-500">{TOOL_SUB[t.id]}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <h2 className="section-title">Recent activity</h2>
          <div className="card p-1.5" data-testid="recent-activity">
            {!recent.length && <div className="p-3 text-slate-500">Nothing yet. Imports, fixes, readings and photos appear here.</div>}
            {recent.map((a) => (
              <button key={a.type + a.ref} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-bench-800" onClick={() => openRecent(a)}>
                <FileBadge a={a} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-200">{a.title || '(untitled)'}</div>
                  <div className="truncate text-[11px] text-slate-500">{label(a.model_id)}</div>
                </div>
                <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(a.at.replace(' ', 'T') + (a.at.includes('Z') ? '' : 'Z'))}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <p className="pb-2 text-center text-[11px] text-slate-500">FixMyCircuit is free. Boardview readers are based on OpenBoardView (MIT). Open the files you already have; nothing is uploaded unless you turn on the AI assistant.</p>
    </div>
  );
}

const TOOL_SUB: Record<string, string> = {
  ai: 'Optional: ask about a fault, it reads the board',
  knowledge: 'Step-by-step fault guides and tables',
  calculators: "SMD codes, dividers, Ohm's law",
  ics: 'Which ICs fit which phones',
  microscope: 'Live view, freeze and capture',
  mirror: 'Control a phone with a broken screen',
};

function ContinueCard({ last, hist, onOpen }: { last: LastSession | null; hist: LastSession[]; onOpen: (d: LastSession) => void }) {
  return (
    <div className="self-end rounded-xl border border-white/10 bg-[#0b0f14b3] p-4 backdrop-blur" data-testid="continue-card">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8d99a9]"><Icon name="clock" size={12} /> Continue your work</div>
      {last ? (
        <>
          <button className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[#F2B544]/40 bg-[#F2B544]/10 p-2.5 text-left transition hover:bg-[#F2B544]/20" onClick={() => onOpen(last)}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#F2B544]/20 text-[#F2B544]"><Icon name={last.type === 'pdf' ? 'doc' : last.type === 'board' ? 'board' : 'camera'} size={17} /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">{last.label}</div>
              <div className="truncate text-[12px] text-[#b3becb]">{last.title}</div>
            </div>
            <span className="text-[11px] text-[#8d99a9]">{timeAgo(last.at)}</span>
          </button>
          {hist.filter((h) => h.key !== last.key).slice(0, 3).map((h) => (
            <button key={h.key} className="mt-1 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] text-[#b3becb] hover:bg-white/5" onClick={() => onOpen(h)}>
              <Icon name={h.type === 'pdf' ? 'doc' : h.type === 'board' ? 'board' : 'camera'} size={12} />
              <span className="min-w-0 flex-1 truncate">{h.title}</span>
              <span className="text-[10.5px] text-[#6b7889]">{timeAgo(h.at)}</span>
            </button>
          ))}
        </>
      ) : (
        <div className="mt-2 text-[12.5px] text-[#b3becb]">No session yet. Open a schematic, boardview or board photo and it will be here next time.</div>
      )}
    </div>
  );
}

function Quick({ color, icon, title, sub, onClick }: { color: string; icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="card lift group relative overflow-hidden p-3 text-left" onClick={onClick}>
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-xl transition group-hover:opacity-40" style={{ background: color }} />
      <div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: color + '26', color }}><Icon name={icon} size={18} /></div>
      <div className="mt-2 font-semibold text-slate-100">{title}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </button>
  );
}

const RES = [
  ['schematics', 'Schematic', 'doc'],
  ['boardviews', 'Boardview', 'board'],
  ['photos', 'Photos', 'camera'],
  ['guides', 'Fixes', 'wrench'],
  ['readings', 'Readings', 'meter'],
] as const;

function completeness(m: TreeModel) {
  const have = RES.filter(([k]) => (m as any)[k] > 0).length;
  return Math.round((have / RES.length) * 100);
}

function DeviceImage({ m, brand, className = '' }: { m: TreeModel; brand: string; className?: string }) {
  if (m.photo_file) return <img src={fileUrl(m.photo_file)} alt="" className={`object-cover ${className}`} loading="lazy" />;
  return (
    <div className={`grid place-items-center bg-gradient-to-br from-bench-800 to-bench-900 ${className}`}>
      <svg viewBox="0 0 60 100" className="h-[78%]" aria-hidden>
        <rect x="6" y="3" width="48" height="94" rx="9" fill="rgb(var(--c-bench-700))" stroke="rgb(var(--c-bench-500))" strokeWidth="1.5" />
        <rect x="10" y="12" width="40" height="74" rx="3" fill="rgb(var(--c-bench-900))" />
        <rect x="24" y="6.5" width="12" height="2" rx="1" fill="rgb(var(--c-bench-500))" />
        <text x="30" y="54" textAnchor="middle" fontSize="18" fontWeight="700" fill="rgb(var(--c-amber-300))" fontFamily="Segoe UI, sans-serif">{brand.slice(0, 1)}</text>
      </svg>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 14;
  const color = pct >= 80 ? 'rgb(var(--c-green-400))' : pct >= 40 ? 'rgb(var(--c-amber-400))' : 'rgb(var(--c-red-400))';
  return (
    <div className="relative grid h-10 w-10 place-items-center" title={`${pct}% complete: schematic, boardview, photos, fixes, readings`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="rgb(var(--c-bench-700))" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <span className="text-[9px] font-semibold tracking-tight text-slate-200">{pct}</span>
    </div>
  );
}

function DeviceCard({ m, brand, i, onNav }: { m: TreeModel; brand: string; i: number; onNav: (n: Nav) => void }) {
  const pct = completeness(m);
  return (
    <button className="card lift fmc-rise group overflow-hidden text-left" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }} onClick={() => onNav({ kind: 'model', modelId: m.id, category: 'faults' })} data-testid="device-card">
      <div className="relative h-28 overflow-hidden">
        <DeviceImage m={m} brand={brand} className="h-full w-full transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-bench-850 via-transparent to-transparent" />
        {m.demo ? <span className="absolute left-2 top-2 rounded-full bg-sky-500/80 px-1.5 text-[10px] font-semibold text-white">DEMO</span> : null}
      </div>
      <div className="flex items-start gap-2 p-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{brand}</div>
          <div className="truncate font-semibold text-slate-100">{m.name}</div>
        </div>
        <Ring pct={pct} />
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-3">
        {RES.map(([k, l, icon]) => {
          const n = (m as any)[k] as number;
          return (
            <span key={k} className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] ${n ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-bench-700 text-slate-500'}`}>
              <Icon name={icon} size={10} /> {n ? `${l}${n > 1 ? ` ${n}` : ''}` : l}
            </span>
          );
        })}
      </div>
    </button>
  );
}

function DeviceRow({ m, brand, onNav }: { m: TreeModel; brand: string; onNav: (n: Nav) => void }) {
  return (
    <button className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-bench-800" onClick={() => onNav({ kind: 'model', modelId: m.id, category: 'faults' })} data-testid="device-row">
      <DeviceImage m={m} brand={brand} className="h-10 w-14 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-slate-100">{brand} {m.name} {m.demo ? <span className="ml-1 rounded bg-sky-500/20 px-1 text-[10px] text-sky-200">DEMO</span> : null}</div>
        <div className="text-[11px] text-slate-500">{m.schematics} schematic · {m.boardviews} boardview · {m.photos} photos · {m.guides} fixes · {m.readings} readings</div>
      </div>
      <Ring pct={completeness(m)} />
    </button>
  );
}

function FileBadge({ a }: { a: ActivityItem }) {
  const [t, color, icon] =
    a.type === 'file' ? (a.sub === 'schematic' ? ['PDF', '#ef4444', 'doc'] : ['BRD', '#F2B544', 'board'])
    : a.type === 'photo' ? ['IMG', '#37C9E8', 'camera']
    : a.type === 'guide' ? ['FIX', '#6FD69B', 'wrench']
    : ['RDG', '#E879F9', 'meter'];
  return (
    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: color + '22', color }}>
      <Icon name={icon} size={14} />
      <span className="absolute -bottom-1 -right-1 rounded px-0.5 text-[7.5px] font-bold text-white" style={{ background: color }}>{t}</span>
    </div>
  );
}

function ToolArt({ id }: { id: string }) {
  const c = { ai: '#F2B544', knowledge: '#F2B544', calculators: '#37C9E8', ics: '#6FD69B', microscope: '#E879F9', mirror: '#7DD3FC' }[id] || '#F2B544';
  return (
    <svg viewBox="0 0 200 80" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="200" height="80" fill="rgb(var(--c-bench-800))" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${-10 + i * 46} 80 V${50 - i * 4} L${20 + i * 46} ${30 - i * 3} H${60 + i * 40}`} fill="none" stroke={c} strokeOpacity={0.25 + i * 0.1} strokeWidth="2" />)}
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={60 + i * 40} cy={30 - i * 3} r="3.5" fill={c} className="fmc-node-glow" style={{ animationDelay: `${i * 0.3}s` }} />)}
    </svg>
  );
}

/** Counts up to the value when it first appears or changes. */
export function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current, dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span data-value={value}>{shown}</span>;
}

function days14(rows: DayCount[]) {
  const m = new Map(rows.map((r) => [r.d, r.n]));
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push(m.get(d) || 0);
  }
  return out;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function Spark({ data, color }: { data: number[]; color: string }): ReactNode {
  const max = Math.max(1, ...data);
  return (
    <svg width="64" height="26" viewBox="0 0 64 26" aria-label="Last 14 days" className="shrink-0">
      {data.map((v, i) => {
        const h = v ? Math.max(3, (v / max) * 24) : 1.5;
        return <rect key={i} x={i * 4.6} y={26 - h} width="3.2" height={h} rx="1" fill={color} opacity={v ? 0.9 : 0.25} className="fmc-bar" style={{ animationDelay: `${i * 25}ms` }} />;
      })}
    </svg>
  );
}
