// Right-hand pane next to any open schematic, boardview or photo: the model's
// readings and fault solutions, narrowed to the part or net you are looking at.
import { useEffect, useState } from 'react';
import type { Guide, Reading } from '@shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import type { Focus } from '../types';
import { GuideCard, GuideEditor, ReadingsTable } from './shared';
import AiAssistant from '../components/AiAssistant';

interface Props {
  modelId: number | null;
  modelLabel: string;
  focus: Focus;
  rev: number;
  onChanged: () => void;
  onFindInSchematic: (q: string) => void;
  onFindOnBoard: (q: string) => void;
  demo?: boolean;
  onOpenSettings?: () => void;
}

export default function RepairPanel(p: Props) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [useFocus, setUseFocus] = useState(true);
  const [editing, setEditing] = useState<Guide | 'new' | null>(null);
  const [n, setN] = useState(0);
  const [tab, setTab] = useState<'bench' | 'ai'>(() => (localStorage.getItem('fmc.panelTab') === 'ai' ? 'ai' : 'bench'));
  useEffect(() => { try { localStorage.setItem('fmc.panelTab', tab); } catch { /* ignore */ } }, [tab]);

  useEffect(() => {
    (async () => {
      setReadings(await api.listReadings({ model_id: p.modelId ?? undefined }));
      setGuides(p.modelId != null ? await api.listGuides(p.modelId) : []);
    })();
  }, [p.modelId, p.rev, n]);

  const f = useFocus ? p.focus : {};
  const hasFocus = !!(f.part || f.net);
  const up = (s?: string) => (s || '').toUpperCase();
  const filteredReadings = hasFocus ? readings.filter((r) => (f.net && up(r.net) === up(f.net)) || (f.part && up(r.part) === up(f.part))) : readings;
  const mentions = (g: Guide) => {
    const text = up(`${g.parts} ${g.nets} ${g.title} ${g.steps}`);
    return (f.part && text.includes(up(f.part))) || (f.net && text.includes(up(f.net)));
  };
  const sortedGuides = hasFocus ? [...guides.filter(mentions), ...guides.filter((g) => !mentions(g))] : guides;
  const changed = () => { setN((x) => x + 1); p.onChanged(); };

  return (
    <div className="flex h-full flex-col" data-testid="repair-panel">
      <div className="border-b border-bench-700 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Repair panel</div>
        <div className="font-semibold text-slate-100">{p.modelLabel}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {p.focus.part && <span className="chip text-cyan-300">{p.focus.part}{p.focus.pin ? '.' + p.focus.pin : ''}</span>}
          {p.focus.net && <span className="chip text-amber-300">{p.focus.net}</span>}
          {(p.focus.part || p.focus.net) && (
            <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
              <input type="checkbox" checked={useFocus} onChange={(e) => setUseFocus(e.target.checked)} /> Filter to selection
            </label>
          )}
          {!p.focus.part && !p.focus.net && <span className="text-[11px] text-slate-500">Click a part or net to filter readings</span>}
        </div>
        <div className="mt-2 flex overflow-hidden rounded-md border border-bench-600 text-[12px]">
          <button className={`flex flex-1 items-center justify-center gap-1 py-1 ${tab === 'bench' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-bench-800'}`} onClick={() => setTab('bench')}><Icon name="wrench" size={12} /> Readings &amp; fixes</button>
          <button className={`flex flex-1 items-center justify-center gap-1 py-1 ${tab === 'ai' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-bench-800'}`} onClick={() => setTab('ai')} data-testid="panel-ai-tab"><Icon name="sparkle" size={12} /> AI assistant</button>
        </div>
      </div>
      {tab === 'ai' ? (
        <div className="min-h-0 flex-1">
          <AiAssistant ctx={{ modelId: p.modelId, modelLabel: p.modelLabel, demo: !!p.demo, focus: p.focus }} onFindOnBoard={p.onFindOnBoard} onOpenSettings={p.onOpenSettings} />
        </div>
      ) : (
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {p.modelId == null && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[12px] text-amber-100">
            This file is not filed under a model yet. Move it to a model from its library page to see and add readings and fault solutions here.
          </div>
        )}
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon name="meter" size={12} /> Readings {hasFocus && <span className="normal-case text-slate-500">· {filteredReadings.length} of {readings.length}</span>}</h3>
          {filteredReadings.length === 0 && <div className="mb-1 text-[12px] text-slate-500">No readings {hasFocus ? 'for this selection ' : ''}yet.</div>}
          {p.modelId != null && (
            <ReadingsTable
              compact
              readings={filteredReadings}
              modelId={p.modelId}
              onChanged={changed}
              prefill={{ part: p.focus.part || '', pin: p.focus.pin || '', net: p.focus.net || '' }}
              onPart={p.onFindOnBoard}
              onNet={p.onFindOnBoard}
            />
          )}
        </section>
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon name="wrench" size={12} /> Fault solutions</h3>
          {editing ? (
            <GuideEditor
              guide={editing === 'new' ? { parts: p.focus.part || '', nets: p.focus.net || '' } as any : editing}
              modelId={p.modelId}
              onSaved={() => { setEditing(null); changed(); }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            p.modelId != null && <button className="btn mb-2" onClick={() => setEditing('new')}><Icon name="plus" size={12} /> New fault solution</button>
          )}
          <div className="space-y-2">
            {sortedGuides.map((g) => (
              <GuideCard
                key={g.id}
                g={g}
                defaultOpen={hasFocus && !!mentions(g)}
                onEdit={() => setEditing(g)}
                onDelete={async () => { if (confirm(`Delete "${g.title}"?`)) { await api.deleteGuide(g.id); changed(); } }}
                onPart={p.onFindOnBoard}
                onNet={p.onFindOnBoard}
              />
            ))}
            {!sortedGuides.length && p.modelId != null && <div className="text-[12px] text-slate-500">No fault solutions for this model yet.</div>}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
