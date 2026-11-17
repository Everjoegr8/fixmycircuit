import { useEffect, useState } from 'react';
import type { Brand, Guide, LibraryFile, Photo, Reading } from '@shared/types';
import { api, fileUrl, type TreeModel } from '../api';
import { Icon } from '../components/Icon';
import { CATEGORIES, categoryLabel, type Category } from '../types';
import { GuideCard, GuideEditor, ReadingsTable } from './shared';

interface Props {
  modelId: number | null;
  category: Category;
  unsorted: boolean;
  title: string;
  models: TreeModel[];
  brands: Brand[];
  rev: number;
  onReload: () => void;
  onCategory: (c: Category) => void;
  onOpenFile: (f: LibraryFile) => void;
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
  onImport: (kind?: string) => void;
  onFindInSchematic: (q: string) => void;
  onFindOnBoard: (q: string) => void;
}

const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function ModelView(p: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const model = p.models.find((m) => m.id === p.modelId);

  return (
    <div className="mx-auto max-w-6xl p-5">
      <div className="mb-4 flex items-end gap-3">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{p.unsorted ? 'Library' : p.brands.find((b) => b.id === model?.brand_id)?.name}</div>
          {renaming ? (
            <input
              className="input text-xl"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={async (e) => { if (e.key === 'Enter') { await api.renameModel(p.modelId!, name); setRenaming(false); p.onReload(); } if (e.key === 'Escape') setRenaming(false); }}
              onBlur={() => setRenaming(false)}
            />
          ) : (
            <h1 className="text-2xl font-semibold text-slate-100">
              {p.unsorted ? 'Unsorted files' : model?.name}
              {!p.unsorted && (
                <button className="btn-ghost ml-2 align-middle" title="Rename model" onClick={() => { setName(model?.name || ''); setRenaming(true); }}><Icon name="edit" size={14} /></button>
              )}
            </h1>
          )}
        </div>
        {!p.unsorted && (
          <button className="btn-danger" onClick={async () => { if (confirm(`Delete ${p.title} and all its guides, readings and photos? Library files are kept as unsorted.`)) { await api.deleteModel(p.modelId!); p.onReload(); } }}>
            <Icon name="trash" size={13} /> Delete model
          </button>
        )}
      </div>
      {!p.unsorted && (
        <div className="mb-4 flex gap-1 border-b border-bench-700">
          {CATEGORIES.map((c) => (
            <button key={c} className={`-mb-px border-b-2 px-3 py-2 ${p.category === c ? 'border-amber-400 text-amber-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`} onClick={() => p.onCategory(c)}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>
      )}
      {p.unsorted ? (
        <FilesSection {...p} kinds={['schematic', 'boardview', 'other']} />
      ) : p.category === 'faults' ? (
        <FaultsSection {...p} />
      ) : p.category === 'readings' ? (
        <ReadingsSection {...p} />
      ) : p.category === 'schematics' ? (
        <FilesSection {...p} kinds={['schematic']} />
      ) : p.category === 'boardview' ? (
        <FilesSection {...p} kinds={['boardview']} />
      ) : (
        <PhotosSection {...p} />
      )}
    </div>
  );
}

function FaultsSection(p: Props) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Guide | 'new' | null>(null);
  const load = async () => setGuides(await api.listGuides(p.modelId, q.trim() || undefined));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [p.modelId, p.rev, q]);
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="input max-w-sm" placeholder="Search fault solutions…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={() => setEditing('new')} data-testid="new-guide"><Icon name="plus" size={13} /> New fault solution</button>
      </div>
      {editing && (
        <div className="mb-4">
          <GuideEditor guide={editing === 'new' ? null : editing} modelId={p.modelId} onSaved={() => { setEditing(null); load(); p.onReload(); }} onCancel={() => setEditing(null)} />
        </div>
      )}
      {!guides.length && !editing && (
        <Empty icon="wrench" title="No fault solutions yet" text="Write down how your shop fixed this model: symptoms, readings to take, parts to change and jumpers to add. It is saved offline and shows up next to the schematic and boardview." />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {guides.map((g) => (
          <GuideCard key={g.id} g={g} onEdit={() => setEditing(g)} onDelete={async () => { if (confirm(`Delete "${g.title}"?`)) { await api.deleteGuide(g.id); load(); p.onReload(); } }} onPart={p.onFindOnBoard} onNet={p.onFindOnBoard} />
        ))}
      </div>
    </div>
  );
}

function ReadingsSection(p: Props) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [q, setQ] = useState('');
  const load = async () => setReadings(await api.listReadings({ model_id: p.modelId }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [p.modelId, p.rev]);
  const ql = q.trim().toUpperCase();
  const shown = ql ? readings.filter((r) => `${r.part} ${r.pin} ${r.net} ${r.note}`.toUpperCase().includes(ql)) : readings;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input className="input max-w-sm" placeholder="Filter by part, net or note…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-[12px] text-slate-500">Readings dropped on board photos in Contributor mode show up here too.</span>
      </div>
      <div className="card p-3">
        <ReadingsTable readings={shown} modelId={p.modelId} onChanged={() => { load(); p.onReload(); }} onPart={p.onFindOnBoard} onNet={p.onFindOnBoard} />
      </div>
    </div>
  );
}

function FilesSection(p: Props & { kinds: string[] }) {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const load = async () => {
    const all = await api.listFiles(p.modelId);
    setFiles(all.filter((f) => p.kinds.includes(f.kind)));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [p.modelId, p.rev, p.kinds.join()]);
  const isBoard = p.kinds.length === 1 && p.kinds[0] === 'boardview';
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button className="btn-primary" onClick={() => p.onImport()}><Icon name="upload" size={13} /> Import {p.unsorted ? 'files' : isBoard ? 'boardview' : 'schematic'}</button>
      </div>
      {!files.length && (
        <Empty
          icon={isBoard ? 'board' : 'doc'}
          title={p.unsorted ? 'Nothing unsorted' : isBoard ? 'No boardview files yet' : 'No schematics yet'}
          text={isBoard ? 'Import .brd, .bdv, .bv, .bvr, .cst, .fz, .asc or XZZ .pcb files. Click a part to see its pins and nets; click a pin to light up the whole net.' : 'Import schematic PDFs. They are copied into your offline library and are searchable by part and net name.'}
        />
      )}
      <div className="card divide-y divide-bench-700 overflow-hidden">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-bench-800/60">
            <Icon name={f.kind === 'schematic' ? 'doc' : 'board'} size={16} className="text-slate-500" />
            <button className="min-w-0 flex-1 truncate text-left text-slate-100 hover:text-amber-200" onClick={() => p.onOpenFile(f)} title="Open">{f.name}</button>
            <span className="chip uppercase">{f.ext}</span>
            <span className="w-16 text-right text-[11px] text-slate-500">{fmtSize(f.size)}</span>
            <MoveToModel file={f} models={p.models} brands={p.brands} onMoved={() => { load(); p.onReload(); }} />
            <button className="btn-ghost" title="Show in folder" onClick={() => api.revealFile(f.id)}><Icon name="folder" size={13} /></button>
            <button className="btn-ghost text-red-300/80" title="Remove from library" onClick={async () => { if (confirm(`Remove ${f.name} from the library?`)) { await api.deleteFile(f.id); load(); p.onReload(); } }}><Icon name="trash" size={13} /></button>
            <button className="btn" onClick={() => p.onOpenFile(f)}>Open</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveToModel({ file, models, brands, onMoved }: { file: LibraryFile; models: TreeModel[]; brands: Brand[]; onMoved: () => void }) {
  return (
    <select
      className="input w-44 py-0.5 text-[12px]"
      value={file.model_id ?? ''}
      title="File under model"
      onChange={async (e) => { await api.updateFile(file.id, { model_id: e.target.value ? Number(e.target.value) : null }); onMoved(); }}
    >
      <option value="">Unsorted</option>
      {brands.map((b) => {
        const ms = models.filter((m) => m.brand_id === b.id);
        return ms.length ? (
          <optgroup key={b.id} label={b.name}>
            {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

function PhotosSection(p: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const load = async () => setPhotos(await api.listPhotos(p.modelId));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [p.modelId, p.rev]);
  const add = async () => {
    const paths = await api.pickFiles([{ name: 'Board photos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]);
    if (!paths.length) return;
    await api.importFiles({ paths, model_id: p.modelId, kind: 'photo' });
    await load();
    p.onReload();
  };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-primary" onClick={add}><Icon name="camera" size={13} /> Add board photo</button>
        <span className="text-[12px] text-slate-500">Shop Contributor mode: take a clear microscope photo, drop pins with diode readings, draw jumper wires. It all stays yours and offline.</span>
      </div>
      {!photos.length && <Empty icon="camera" title="No board photos yet" text="Add a photo of the motherboard (top or bottom). Then click to drop reading pins on components and draw jumper lines." />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((ph) => (
          <div key={ph.id} className="card group overflow-hidden">
            <button data-testid="photo-open" className="block aspect-[4/3] w-full overflow-hidden bg-bench-950" onClick={() => p.onOpenPhoto(ph.id, ph.title, ph.model_id)}>
              <img src={fileUrl(ph.file_id)} alt={ph.title} className="h-full w-full object-cover transition group-hover:scale-105" />
            </button>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{ph.title}</span>
              <span className="chip capitalize">{ph.side}</span>
              <button className="btn-ghost text-red-300/80" title="Delete photo" onClick={async () => { if (confirm(`Delete photo "${ph.title}" with its pins and jumpers?`)) { await api.deletePhoto(ph.id); load(); p.onReload(); } }}><Icon name="trash" size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="mb-4 rounded-lg border border-dashed border-bench-600 p-8 text-center">
      <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-bench-800 text-slate-400"><Icon name={icon} size={18} /></div>
      <div className="font-semibold text-slate-200">{title}</div>
      <div className="mx-auto mt-1 max-w-md text-[12px] text-slate-400">{text}</div>
    </div>
  );
}
