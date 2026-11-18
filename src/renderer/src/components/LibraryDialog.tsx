// "Add a folder of boards": scan a folder (or dropped files/folders), sort every
// file into Brand > Series > Model, let the tech fix any row, then import.
// Also reads an optional hosted library-index.json the shop fills itself.
import { useEffect, useMemo, useState } from 'react';
import { api, type LibEntry, type LibRemoteModel } from '../api';
import Modal from './Modal';
import { Icon } from './Icon';

interface Props {
  initialPaths?: string[];
  initialTab?: 'folder' | 'online';
  onClose: () => void;
  onDone: (r: { models: number; files: number; modelIds: number[] }) => void;
}

/** FixMyCircuit's own open library: open-hardware boards with their licences, pinned to upstream commits. */
export const OPEN_LIBRARY = 'https://raw.githubusercontent.com/Everjoegr8/fixmycircuit/main/library/library-index.hosted.json';

const HOW: Record<LibEntry['how'], string> = { 'model.json': 'model.json', index: 'library index', folders: 'folders', name: 'file name', unknown: 'not sure' };
const KIND: Record<string, string> = { boardview: 'Board', schematic: 'PDF', photo: 'Photo' };

export default function LibraryDialog(p: Props) {
  const [tab, setTab] = useState<'folder' | 'online'>(p.initialTab || 'folder');
  const [entries, setEntries] = useState<(LibEntry & { on: boolean })[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [drag, setDrag] = useState(false);
  const [onlyUnsure, setOnlyUnsure] = useState(false);
  const [bulk, setBulk] = useState({ brand: '', series: '', model: '' });

  const scan = async (paths: string[]) => {
    if (!paths.length) return;
    setBusy('Looking through the folder…');
    setError('');
    try {
      const r = await api.libraryScan(paths);
      setTruncated(r.truncated);
      setEntries((old) => {
        const seen = new Set(old.map((e) => e.path));
        return [...old, ...r.entries.filter((e) => !seen.has(e.path)).map((e) => ({ ...e, on: !e.dup }))];
      });
      if (!r.entries.length) setError('No boardviews, schematics or board photos were found there.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy('');
    }
  };
  useEffect(() => { if (p.initialPaths?.length) scan(p.initialPaths); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const pickFolder = async () => { const d = await api.libraryPickFolder(); if (d) scan([d]); };
  const shown = useMemo(() => entries.map((e, i) => ({ e, i })).filter(({ e }) => !onlyUnsure || e.how === 'unknown' || e.how === 'name' || !e.brand || !e.model), [entries, onlyUnsure]);
  const chosen = entries.filter((e) => e.on);
  const models = new Set(chosen.filter((e) => e.brand && e.model).map((e) => `${e.brand}|${e.model}`)).size;
  const set = (i: number, patch: Partial<LibEntry & { on: boolean }>) => setEntries((l) => l.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const applyBulk = () => {
    const patch: Partial<LibEntry> = {};
    if (bulk.brand.trim()) patch.brand = bulk.brand.trim();
    if (bulk.series.trim()) patch.series = bulk.series.trim();
    if (bulk.model.trim()) patch.model = bulk.model.trim();
    const ids = new Set(shown.filter(({ e }) => e.on).map(({ i }) => i));
    setEntries((l) => l.map((e, k) => (ids.has(k) ? { ...e, ...patch, how: e.how } : e)));
  };

  const importNow = async () => {
    setBusy(`Importing ${chosen.length} files…`);
    setError('');
    try {
      p.onDone(await api.libraryImport(chosen.map(({ on, ...e }) => e)));
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy('');
    }
  };

  return (
    <Modal title="Add boards to your model library" onClose={p.onClose} width={980}>
      <div className="mb-3 flex gap-1 border-b border-bench-700">
        {([['folder', 'Folder or files'], ['online', 'Online library']] as const).map(([k, l]) => (
          <button key={k} className={`border-b-2 px-3 py-1.5 ${tab === k ? 'border-amber-400 text-amber-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`} onClick={() => setTab(k)} data-testid={`lib-tab-${k}`}>{l}</button>
        ))}
      </div>
      {tab === 'online' ? <Online onDone={p.onDone} /> : (
        <>
          <div
            className={`mb-3 rounded-lg border-2 border-dashed p-4 text-center ${drag ? 'border-amber-400 bg-amber-500/10' : 'border-bench-600'}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); scan(Array.from(e.dataTransfer.files).map((f) => api.pathForFile(f)).filter(Boolean)); }}
            data-testid="lib-drop"
          >
            <div className="mb-2 text-slate-300">Drop a folder of boards here, or choose one. Sub-folders are searched too.</div>
            <button className="btn-primary" onClick={pickFolder} data-testid="lib-pick-folder"><Icon name="folder" size={13} /> Choose a folder…</button>
            <div className="mt-2 text-[11px] leading-snug text-slate-500">
              Best layout: <span className="font-mono">Brand / Series / Model /</span> with the files inside (an optional <span className="font-mono">model.json</span> names the model and its licence).
              Loose files are sorted by their names. Files are copied into the app so they open offline.
            </div>
          </div>
          {busy && <div className="mb-2 text-amber-200">{busy}</div>}
          {entries.length > 0 && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="text-slate-300">{entries.length} files found · {chosen.length} to import into {models} models</span>
                {truncated && <span className="text-amber-300">Stopped at 20,000 files: choose a smaller folder for the rest.</span>}
                <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={onlyUnsure} onChange={(e) => setOnlyUnsure(e.target.checked)} /> Only rows to check</label>
              </div>
              <div className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-bench-700 bg-bench-850 p-2 text-[12px]">
                <span className="text-slate-400">Fix the ticked rows below:</span>
                <input className="input w-36 py-0.5" placeholder="Brand" value={bulk.brand} onChange={(e) => setBulk({ ...bulk, brand: e.target.value })} />
                <input className="input w-36 py-0.5" placeholder="Series" value={bulk.series} onChange={(e) => setBulk({ ...bulk, series: e.target.value })} />
                <input className="input w-48 py-0.5" placeholder="Model" value={bulk.model} onChange={(e) => setBulk({ ...bulk, model: e.target.value })} />
                <button className="btn py-0.5" onClick={applyBulk}>Apply</button>
              </div>
              <div className="max-h-[48vh] overflow-auto rounded-md border border-bench-700">
                <table className="w-full text-[12px]" data-testid="lib-table">
                  <thead className="sticky top-0 bg-bench-850 text-left text-[10.5px] uppercase text-slate-500">
                    <tr><th className="w-6 px-2 py-1" /><th className="px-1 py-1">File</th><th className="px-1 py-1">Brand</th><th className="px-1 py-1">Series</th><th className="px-1 py-1">Model</th><th className="px-2 py-1">Sorted by</th></tr>
                  </thead>
                  <tbody>
                    {shown.map(({ e, i }) => (
                      <tr key={e.path} className={`border-t border-bench-800 ${e.on ? '' : 'opacity-50'}`}>
                        <td className="px-2"><input type="checkbox" checked={e.on} onChange={(x) => set(i, { on: x.target.checked })} /></td>
                        <td className="max-w-[260px] px-1 py-0.5">
                          <div className="flex items-center gap-1.5"><span className="chip">{KIND[e.kind] || e.kind}</span><span className="truncate" title={e.rel}>{e.name}</span></div>
                          {e.dup && <div className="text-[10.5px] text-slate-500">Already in your library</div>}
                          {e.meta?.license?.spdx && <div className="text-[10.5px] text-green-300/80" title={e.meta.license.attribution}>{e.meta.license.spdx}</div>}
                        </td>
                        <td className="px-1"><input className="input py-0.5" value={e.brand} onChange={(x) => set(i, { brand: x.target.value })} placeholder="Brand" /></td>
                        <td className="px-1"><input className="input py-0.5" value={e.series} onChange={(x) => set(i, { series: x.target.value })} placeholder="Series" /></td>
                        <td className="px-1"><input className="input py-0.5" value={e.model} onChange={(x) => set(i, { model: x.target.value })} placeholder="Model" /></td>
                        <td className={`px-2 text-[11px] ${e.how === 'unknown' ? 'text-amber-300' : 'text-slate-500'}`}>{HOW[e.how]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Rows without a brand and model go to Unsorted files.</div>
            </>
          )}
          {error && <div className="mt-2 text-red-300">{error}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn" onClick={p.onClose}>Cancel</button>
            <button className="btn-primary" disabled={!chosen.length || !!busy} onClick={importNow} data-testid="lib-import">Import {chosen.length || ''} file{chosen.length === 1 ? '' : 's'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** A hosted library-index.json (the shop's own, or one it trusts). */
function Online({ onDone }: { onDone: Props['onDone'] }) {
  const [url, setUrl] = useState('');
  const [list, setList] = useState<(LibRemoteModel & { on: boolean })[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { api.getSettings().then((s) => setUrl(s.libraryUrl || OPEN_LIBRARY)); }, []);
  const load = async () => {
    setBusy('Reading the library…'); setError('');
    try {
      await api.setSettings({ libraryUrl: url.trim() });
      setList((await api.libraryFetchIndex(url.trim())).map((m) => ({ ...m, on: false })));
    } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(''); }
  };
  const shown = (list || []).map((m, i) => ({ m, i })).filter(({ m }) => !q.trim() || `${m.brand} ${m.series} ${m.model}`.toLowerCase().includes(q.trim().toLowerCase()));
  const chosen = (list || []).filter((m) => m.on);
  const download = async () => {
    setBusy(`Downloading ${chosen.length} models…`); setError('');
    try {
      onDone(await api.libraryDownload(chosen.flatMap((m) => m.files.map((f) => ({ url: f.url, sha256: f.sha256, brand: m.brand || '', series: m.series || '', model: m.model || '', meta: { source: m.source, license: m.license, notes: m.notes } })))));
    } catch (e: any) { setError(e?.message || String(e)); setBusy(''); }
  };
  return (
    <div>
      <p className="mb-2 text-[12px] text-slate-400">The address below is FixMyCircuit's open library (open-hardware boards that may be shared, each with its licence). You can also point it at a <span className="font-mono">library-index.json</span> on a server you control. Each model lists its files; the app downloads the ones you tick, checks their SHA-256 and files them under Brand, Series and Model. FixMyCircuit does not host a library of phone makers' boards.</p>
      <div className="mb-3 flex gap-2">
        <input className="input flex-1 font-mono" placeholder="https://example.com/boards/library-index.json" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="lib-url" />
        <button className="btn-primary" disabled={!url.trim() || !!busy} onClick={load}>Load</button>
      </div>
      {busy && <div className="mb-2 text-amber-200">{busy}</div>}
      {list && (
        <>
          <input className="input mb-2" placeholder="Filter models" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[48vh] overflow-auto rounded-md border border-bench-700">
            {shown.map(({ m, i }) => (
              <label key={i} className="flex items-center gap-2 border-t border-bench-800 px-2 py-1 first:border-0">
                <input type="checkbox" checked={m.on} onChange={(e) => setList((l) => l!.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                <span className="text-slate-200">{m.brand} · {m.series ? m.series + ' · ' : ''}{m.model}</span>
                <span className="text-[11px] text-slate-500">{m.files.length} files</span>
                {m.license?.spdx && <span className="chip text-green-300/80">{m.license.spdx}</span>}
              </label>
            ))}
            {!shown.length && <div className="p-2 text-slate-500">No models</div>}
          </div>
        </>
      )}
      {error && <div className="mt-2 text-red-300">{error}</div>}
      <div className="mt-3 flex justify-end">
        <button className="btn-primary" disabled={!chosen.length || !!busy} onClick={download}>Download {chosen.length || ''} model{chosen.length === 1 ? '' : 's'}</button>
      </div>
    </div>
  );
}
