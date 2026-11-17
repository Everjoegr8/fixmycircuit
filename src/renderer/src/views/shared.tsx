// Fault-solution and reading widgets shared by the model pages and the repair panel.
import { useState } from 'react';
import type { Guide, Reading, ReadingType } from '@shared/types';
import { useEffect } from 'react';
import type { Photo } from '@shared/types';
import { api, fileUrl } from '../api';
import { Icon } from '../components/Icon';

export const READING_TYPES: { value: ReadingType; label: string; unit: string }[] = [
  { value: 'diode', label: 'Diode', unit: 'V' },
  { value: 'voltage', label: 'Voltage', unit: 'V' },
  { value: 'resistance', label: 'Resistance', unit: 'Ω' },
  { value: 'note', label: 'Note', unit: '' },
];
const TYPE_COLORS: Record<ReadingType, string> = { diode: '#f5a524', voltage: '#22c55e', resistance: '#38bdf8', note: '#e879f9' };

export function GuideEditor({ guide, modelId, onSaved, onCancel }: { guide?: Guide | null; modelId: number | null; onSaved: (g: Guide) => void; onCancel: () => void }) {
  const [g, setG] = useState<Partial<Guide>>(guide || { title: '', symptom: '', steps: '', parts: '', nets: '', model_id: modelId });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!g.title?.trim()) return;
    setBusy(true);
    const author = guide?.author || (await api.getSettings()).author;
    const saved = await api.saveGuide({ ...g, title: g.title.trim(), model_id: g.model_id ?? modelId, author });
    setBusy(false);
    onSaved(saved);
  };
  return (
    <div className="card space-y-2 p-3" data-testid="guide-editor">
      <div>
        <label className="label">Fault / title</label>
        <input className="input" autoFocus placeholder="e.g. Not charging, charging icon shows but % does not rise" value={g.title || ''} onChange={(e) => setG({ ...g, title: e.target.value })} />
      </div>
      <div>
        <label className="label">Symptoms</label>
        <textarea className="input h-14" placeholder="What the customer reports and what you see on the ammeter" value={g.symptom || ''} onChange={(e) => setG({ ...g, symptom: e.target.value })} />
      </div>
      <div>
        <label className="label">Repair steps</label>
        <textarea className="input h-36 font-mono text-[12px]" placeholder={'1. Check VBUS at F1 with charger connected\n2. Diode reading on VBUS…\n3. Replace / jumper…'} value={g.steps || ''} onChange={(e) => setG({ ...g, steps: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Parts involved</label>
          <input className="input font-mono" placeholder="U2, F1, J1" value={g.parts || ''} onChange={(e) => setG({ ...g, parts: e.target.value })} />
        </div>
        <div>
          <label className="label">Nets / lines</label>
          <input className="input font-mono" placeholder="VBUS, VBAT" value={g.nets || ''} onChange={(e) => setG({ ...g, nets: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={!g.title?.trim() || busy} onClick={save}>Save fault solution</button>
      </div>
    </div>
  );
}

const splitList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

export function GuideCard({ g, onEdit, onDelete, onPart, onNet, defaultOpen = false }: { g: Guide; onEdit: () => void; onDelete: () => void; onPart?: (s: string) => void; onNet?: (s: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <button className="flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="font-semibold text-slate-100">{g.title}</div>
          {g.symptom && <div className={`mt-0.5 text-[12px] text-slate-400 ${open ? '' : 'line-clamp-2'}`}>{g.symptom}</div>}
        </button>
        <button className="btn-ghost" onClick={onEdit} title="Edit"><Icon name="edit" size={13} /></button>
        <button className="btn-ghost text-red-300/80" onClick={onDelete} title="Delete"><Icon name="trash" size={13} /></button>
      </div>
      {open && g.steps && <pre className="mt-2 whitespace-pre-wrap rounded bg-bench-950 p-2 font-mono text-[12px] leading-relaxed text-slate-200">{g.steps}</pre>}
      {(g.parts || g.nets) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {splitList(g.parts).map((x) => <button key={'p' + x} className="chip text-cyan-300 hover:border-cyan-400" title="Find on board" onClick={() => onPart?.(x)}>{x}</button>)}
          {splitList(g.nets).map((x) => <button key={'n' + x} className="chip text-amber-300 hover:border-amber-400" title="Find on board" onClick={() => onNet?.(x)}>{x}</button>)}
        </div>
      )}
      {open && g.photo_ids && <GuidePhotos ids={g.photo_ids} />}
      {g.author && <div className="mt-1.5 text-[10px] text-slate-500">by {g.author} · {g.updated_at.slice(0, 10)}</div>}
    </div>
  );
}

/** Editable readings table (diode readings and friends). */
export function ReadingsTable({ readings, modelId, onChanged, compact = false, prefill, onPart, onNet }: {
  readings: Reading[];
  modelId: number | null;
  onChanged: () => void;
  compact?: boolean;
  prefill?: Partial<Reading>;
  onPart?: (s: string) => void;
  onNet?: (s: string) => void;
}) {
  const [draft, setDraft] = useState<Partial<Reading> | null>(null);
  const [editing, setEditing] = useState<Reading | null>(null);
  const startAdd = () => setDraft({ type: 'diode', part: '', pin: '', net: '', value: '', note: '', ...prefill });
  const save = async (r: Partial<Reading>) => {
    const author = r.author || (await api.getSettings()).author;
    await api.saveReading({ ...r, model_id: r.model_id ?? modelId, color: TYPE_COLORS[(r.type || 'diode') as ReadingType], author });
    setDraft(null);
    setEditing(null);
    onChanged();
  };
  const row = (r: Partial<Reading>, set: (r: Partial<Reading>) => void, onSave: () => void, onCancel: () => void) => (
    <tr className="bg-bench-800/60">
      <td className="p-1"><input className="input py-0.5 font-mono" placeholder="Part" value={r.part || ''} onChange={(e) => set({ ...r, part: e.target.value })} autoFocus /></td>
      {!compact && <td className="p-1"><input className="input py-0.5 font-mono" placeholder="Pin" value={r.pin || ''} onChange={(e) => set({ ...r, pin: e.target.value })} /></td>}
      <td className="p-1"><input className="input py-0.5 font-mono" placeholder="Net" value={r.net || ''} onChange={(e) => set({ ...r, net: e.target.value })} /></td>
      <td className="p-1">
        <select className="input py-0.5" value={r.type} onChange={(e) => set({ ...r, type: e.target.value as ReadingType })}>
          {READING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>
      <td className="p-1"><input className="input py-0.5 font-mono" placeholder="0.452" value={r.value || ''} onChange={(e) => set({ ...r, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onSave()} /></td>
      {!compact && <td className="p-1"><input className="input py-0.5" placeholder="Note" value={r.note || ''} onChange={(e) => set({ ...r, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onSave()} /></td>}
      <td className="whitespace-nowrap p-1">
        <button className="btn-primary px-1.5 py-0.5" onClick={onSave}>Save</button>
        <button className="btn-ghost" onClick={onCancel}><Icon name="x" size={12} /></button>
      </td>
    </tr>
  );
  return (
    <div>
      <table className="w-full text-[12px]" data-testid="readings-table">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
            <th className="px-1 py-1">Part</th>
            {!compact && <th className="px-1">Pin</th>}
            <th className="px-1">Net</th>
            <th className="px-1">Type</th>
            <th className="px-1">Value</th>
            {!compact && <th className="px-1">Note</th>}
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {readings.map((r) =>
            editing?.id === r.id ? (
              <FragmentRow key={r.id}>{row(editing, (x) => setEditing(x as Reading), () => save(editing), () => setEditing(null))}</FragmentRow>
            ) : (
              <tr key={r.id} className="group border-t border-bench-800 hover:bg-bench-800/50">
                <td className="px-1 py-1 font-mono">
                  <button className="text-cyan-300 hover:underline" onClick={() => r.part && onPart?.(r.part)}>{r.part || '—'}</button>
                  {compact && r.pin && <span className="text-slate-500">.{r.pin}</span>}
                </td>
                {!compact && <td className="px-1 font-mono text-slate-400">{r.pin}</td>}
                <td className="px-1 font-mono"><button className="text-amber-300 hover:underline" onClick={() => r.net && onNet?.(r.net)}>{r.net}</button></td>
                <td className="px-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} /> <span className="text-slate-400">{r.type}</span></td>
                <td className="px-1 font-mono font-semibold text-slate-100">{r.value}</td>
                {!compact && <td className="px-1 text-slate-400">{r.note}{r.photo_id ? <span className="ml-1 chip">photo</span> : null}</td>}
                <td className="whitespace-nowrap px-1 text-right opacity-0 group-hover:opacity-100">
                  <button className="btn-ghost" onClick={() => setEditing(r)}><Icon name="edit" size={12} /></button>
                  <button className="btn-ghost text-red-300/80" onClick={async () => { await api.deleteReading(r.id); onChanged(); }}><Icon name="trash" size={12} /></button>
                </td>
              </tr>
            ),
          )}
          {draft && row(draft, setDraft, () => save(draft), () => setDraft(null))}
        </tbody>
      </table>
      {!draft && (
        <button className="btn mt-2" onClick={startAdd} data-testid="add-reading"><Icon name="plus" size={12} /> Add reading</button>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Thumbnails of photos attached to a fault solution; click opens the photo. */
function GuidePhotos({ ids }: { ids: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => {
    Promise.all(ids.split(',').filter(Boolean).map((i) => api.getPhoto(Number(i)))).then((ps) => setPhotos(ps.filter(Boolean) as Photo[]));
  }, [ids]);
  if (!photos.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((ph) => (
        <button key={ph.id} title={`Open ${ph.title}`} onClick={() => window.dispatchEvent(new CustomEvent('fmc-open-photo', { detail: ph }))}>
          <img src={fileUrl(ph.file_id)} className="h-20 rounded border border-bench-600 object-cover hover:border-amber-400" alt={ph.title} />
        </button>
      ))}
    </div>
  );
}
