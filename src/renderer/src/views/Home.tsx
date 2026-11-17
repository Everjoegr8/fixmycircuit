import { useEffect, useState } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, type TreeModel } from '../api';
import { Icon } from '../components/Icon';
import { TOOLS, type Nav } from '../types';

interface Props {
  models: TreeModel[];
  brands: Brand[];
  onNav: (n: Nav) => void;
  onImport: () => void;
  onOpenFile: (f: LibraryFile) => void;
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
  onReload: () => void;
  rev: number;
}

export default function Home(p: Props) {
  const [recent, setRecent] = useState<LibraryFile[]>([]);
  useEffect(() => {
    api.listFiles().then((fs) => setRecent(fs.filter((f) => f.kind !== 'photo').sort((a, b) => b.added_at.localeCompare(a.added_at)).slice(0, 8)));
  }, [p.rev]);
  const [busy, setBusy] = useState(false);
  const demo = p.models.filter((m) => m.demo);
  const loadDemo = async () => { setBusy(true); await api.loadDemo(); setBusy(false); p.onReload(); };
  const removeDemo = async () => { setBusy(true); await api.removeDemo(); setBusy(false); p.onReload(); };
  const openDemo = async (what: 'board' | 'photo' | 'schematic') => {
    const m = demo[0];
    if (!m) return;
    if (what === 'photo') {
      const ph = (await api.listPhotos(m.id))[0];
      if (ph) p.onOpenPhoto(ph.id, ph.title, ph.model_id);
      return;
    }
    const f = (await api.listFiles(m.id, what === 'board' ? 'boardview' : 'schematic'))[0];
    if (f) p.onOpenFile(f);
  };
  const totals = p.models.reduce((t, m) => ({ files: t.files + m.files, guides: t.guides + m.guides, readings: t.readings + m.readings, photos: t.photos + m.photos }), { files: 0, guides: 0, readings: 0, photos: 0 });
  const label = (id: number | null) => {
    const m = p.models.find((x) => x.id === id);
    return m ? `${p.brands.find((b) => b.id === m.brand_id)?.name} ${m.name}` : 'Unsorted';
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold text-slate-100">Welcome to the bench</h1>
      <p className="mt-1 max-w-2xl text-slate-400">
        Open schematics and boardviews side by side, light up nets, and keep your shop's own diode readings, jumper wires and fault fixes. Everything works offline.
      </p>
      {demo.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3" data-testid="demo-banner">
          <div className="min-w-[260px] flex-1">
            <div className="font-semibold text-sky-100">Demo workshop loaded: {demo.length} sample models</div>
            <div className="text-[12px] text-sky-200/70">{demo.map((m) => `${p.brands.find((b) => b.id === m.brand_id)?.name} ${m.name}`).join(' · ')}. They share one invented board; readings are synthetic, not from real phones.</div>
          </div>
          <button className="btn-primary" onClick={() => openDemo('photo')}><Icon name="camera" size={13} /> Board photo + layers</button>
          <button className="btn" onClick={() => openDemo('board')}><Icon name="board" size={13} /> Boardview</button>
          <button className="btn" onClick={() => openDemo('schematic')}><Icon name="doc" size={13} /> Schematic</button>
          <button className="btn" disabled={busy} onClick={removeDemo} title="Delete the demo models and their files">Remove demo</button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-bench-600 bg-bench-850 p-3">
          <div className="flex-1 text-slate-300">Want to try every feature first? Load four sample models (Tecno, Infinix, Samsung, iPhone) on a synthetic demo board.</div>
          <button className="btn-primary" disabled={busy} onClick={loadDemo} data-testid="load-demo">Load demo workshop</button>
          <button className="btn" onClick={() => api.saveSamples()}><Icon name="download" size={13} /> Save sample files…</button>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Models', p.models.length, 'chip'],
          ['Library files', totals.files, 'doc'],
          ['Fault solutions', totals.guides, 'wrench'],
          ['Readings', totals.readings, 'meter'],
          ['Board photos', totals.photos, 'camera'],
        ].map(([k, v, icon]) => (
          <div key={k as string} className="card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500"><Icon name={icon as string} size={12} /> {k}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-100">Get started</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-slate-300">
            <li>Add a model under a brand in the sidebar (hover a brand, click +).</li>
            <li><button className="text-amber-300 hover:underline" onClick={p.onImport}>Import</button> the schematic PDF and boardview you already have for it.</li>
            <li>Open the boardview, click a part or pin, and the whole net lights up. Use "Schematic" to jump to it in the PDF.</li>
            <li>Under Board Photos, add a microscope photo and drop pins with your diode readings and jumper lines.</li>
          </ol>
          <button className="btn-primary mt-3" onClick={p.onImport}><Icon name="upload" size={13} /> Import files</button>
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-100">Recently added</h2>
          {!recent.length && <div className="text-slate-500">Nothing yet. Imported schematics and boardviews appear here.</div>}
          {recent.map((f) => (
            <button key={f.id} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-bench-800" onClick={() => p.onOpenFile(f)}>
              <Icon name={f.kind === 'schematic' ? 'doc' : 'board'} size={14} className="text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-slate-200">{f.name}</span>
              <span className="text-[11px] text-slate-500">{label(f.model_id)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workbench tools</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {TOOLS.map((t) => (
            <button key={t.id} className="card flex flex-col items-start gap-1 p-3 text-left hover:border-amber-500/60" onClick={() => p.onNav({ kind: 'tool', tool: t.id })}>
              <Icon name={t.icon} size={18} className="text-amber-300" />
              <span className="font-semibold text-slate-100">{t.label}</span>
              <span className="text-[11px] text-slate-500">{{ knowledge: 'Step-by-step fault guides and reference tables', calculators: 'SMD codes, dividers, Ohm\'s law', ics: 'Which ICs fit which phones', microscope: 'Live view, freeze and capture', mirror: 'Control a phone with a broken screen' }[t.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Brands</h2>
        <div className="flex flex-wrap gap-2">
          {p.brands.map((b) => {
            const ms = p.models.filter((m) => m.brand_id === b.id);
            return (
              <div key={b.id} className="card min-w-[150px] p-3">
                <div className="font-semibold text-slate-100">{b.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ms.slice(0, 6).map((m) => <button key={m.id} className="chip hover:border-amber-400" onClick={() => p.onNav({ kind: 'model', modelId: m.id, category: 'faults' })}>{m.name}</button>)}
                  {!ms.length && <span className="text-[11px] text-slate-500">No models yet</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-8 text-[11px] text-slate-600">FixMyCircuit is free. Boardview readers are based on OpenBoardView (MIT). Open the files you already have; nothing is downloaded or uploaded.</p>
    </div>
  );
}
