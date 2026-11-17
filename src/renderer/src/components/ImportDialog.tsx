import { useEffect, useMemo, useState } from 'react';
import { guessBrand, kindForExt, type Brand, type LibraryFile, type FileKind } from '@shared/types';
import { api, type TreeModel } from '../api';
import Modal from './Modal';
import { Icon } from './Icon';

interface Props {
  brands: Brand[];
  models: TreeModel[];
  initialModelId: number | null;
  initialPaths?: string[];
  onClose: () => void;
  onDone: (files: LibraryFile[]) => void;
  onReloadTree: () => void;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const extOf = (p: string) => (/\.([^.]+)$/.exec(p)?.[1] || '').toLowerCase();
const KIND_LABEL: Record<FileKind, string> = { schematic: 'Schematic PDF', boardview: 'BoardView', photo: 'Board photo', other: 'Other' };

export default function ImportDialog(p: Props) {
  const [paths, setPaths] = useState<string[]>(p.initialPaths || []);
  const initialModel = p.models.find((m) => m.id === p.initialModelId);
  const [brandId, setBrandId] = useState<number | ''>(initialModel?.brand_id ?? '');
  const [modelId, setModelId] = useState<number | '' | 'new'>(initialModel?.id ?? '');
  const [newModel, setNewModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  // Guess the brand from the first file name when none is chosen yet.
  useEffect(() => {
    if (brandId !== '' || !paths.length) return;
    const g = guessBrand(baseName(paths[0]));
    const b = g && p.brands.find((x) => x.name.toLowerCase() === g.toLowerCase());
    if (b) setBrandId(b.id);
  }, [paths, brandId, p.brands]);

  const brandModels = useMemo(() => p.models.filter((m) => m.brand_id === brandId), [p.models, brandId]);

  const pick = async () => {
    const r = await api.pickFiles();
    if (r.length) setPaths((x) => [...new Set([...x, ...r])]);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      let mid: number | null = null;
      if (modelId === 'new') {
        if (brandId === '' || !newModel.trim()) throw new Error('Choose a brand and type the model name.');
        mid = (await api.addModel(brandId, newModel.trim())).id;
      } else if (modelId !== '') mid = modelId;
      const files = await api.importFiles({ paths, model_id: mid });
      p.onDone(files);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import files to your offline library" onClose={p.onClose} width={620}>
      <div
        className={`mb-3 rounded-lg border-2 border-dashed p-4 text-center ${drag ? 'border-amber-400 bg-amber-500/10' : 'border-bench-600'}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const dropped = Array.from(e.dataTransfer.files).map((f) => api.pathForFile(f)).filter(Boolean);
          setPaths((x) => [...new Set([...x, ...dropped])]);
        }}
      >
        <div className="mb-2 text-slate-400">Drop schematics (.pdf), boardviews (.brd .bdv .bv .bvr .cst .fz .asc .pcb) or board photos here</div>
        <button className="btn" onClick={pick}><Icon name="upload" size={13} /> Choose files…</button>
        <div className="mt-2 text-[11px] text-slate-500">Files are copied into the app's data folder so they open offline.</div>
      </div>
      {paths.length > 0 && (
        <div className="mb-3 max-h-48 overflow-auto rounded-md border border-bench-700">
          {paths.map((x) => (
            <div key={x} className="flex items-center gap-2 border-b border-bench-800 px-2 py-1 last:border-0">
              <span className="chip">{KIND_LABEL[kindForExt(extOf(x))]}</span>
              <span className="flex-1 truncate" title={x}>{baseName(x)}</span>
              <button className="btn-ghost" onClick={() => setPaths(paths.filter((y) => y !== x))}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Brand</label>
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value ? Number(e.target.value) : ''); setModelId(''); }}>
            <option value="">— Leave unsorted —</option>
            {p.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Model</label>
          <select className="input" value={modelId} disabled={brandId === ''} onChange={(e) => setModelId(e.target.value === 'new' ? 'new' : e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Leave unsorted —</option>
            {brandModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="new">+ New model…</option>
          </select>
        </div>
        {modelId === 'new' && (
          <div className="col-span-2">
            <label className="label">New model name</label>
            <input className="input" autoFocus placeholder="e.g. Spark 10 Pro (KI7)" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
          </div>
        )}
      </div>
      {error && <div className="mt-3 text-red-300">{error}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={p.onClose}>Cancel</button>
        <button className="btn-primary" disabled={!paths.length || busy} onClick={submit}>{busy ? 'Importing…' : `Import ${paths.length || ''} file${paths.length === 1 ? '' : 's'}`}</button>
      </div>
    </Modal>
  );
}
