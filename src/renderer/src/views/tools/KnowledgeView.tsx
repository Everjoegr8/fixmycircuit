import { useMemo, useState } from 'react';
import type { Brand } from '@shared/types';
import { BRAND_NOTES, KB_GUIDES, REF_TABLES, type KbGuide } from '@shared/knowledge';
import { api, type TreeModel } from '../../api';
import { Icon } from '../../components/Icon';

interface Props {
  models: TreeModel[];
  brands: Brand[];
  onChanged: () => void;
}

export default function KnowledgeView(p: Props) {
  const [tab, setTab] = useState<'guides' | 'tables' | 'brands'>('guides');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [openId, setOpenId] = useState<string>(KB_GUIDES[0].id);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<number | ''>('');
  const [msg, setMsg] = useState('');

  const cats = [...new Set(KB_GUIDES.map((g) => g.category))];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return KB_GUIDES.filter((g) => (!cat || g.category === cat) && (!t || JSON.stringify(g).toLowerCase().includes(t)));
  }, [q, cat]);
  const g = KB_GUIDES.find((x) => x.id === openId) || list[0];

  const copyToModel = async (guide: KbGuide) => {
    if (target === '') return;
    await api.saveGuide({
      model_id: target,
      title: guide.title,
      symptom: guide.symptoms,
      steps: guide.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`).join('\n') + (guide.culprits.length ? `\n\nUsual culprits: ${guide.culprits.join(', ')}` : ''),
      parts: guide.parts || '',
      nets: guide.nets || '',
      author: 'FixMyCircuit knowledge base',
    });
    const m = p.models.find((x) => x.id === target);
    setMsg(`Added to ${m?.name ?? 'model'} as a fault solution. Edit it there to add model-specific parts and readings.`);
    p.onChanged();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-bench-700 px-4 py-2">
        <Icon name="book" size={16} className="text-amber-300" />
        <h1 className="font-semibold text-slate-100">Repair knowledge</h1>
        <div className="ml-4 flex overflow-hidden rounded-md border border-bench-600">
          {([['guides', `Fault guides (${KB_GUIDES.length})`], ['tables', 'Reference tables'], ['brands', 'Brand notes']] as const).map(([k, l]) => (
            <button key={k} className={`px-3 py-1 ${tab === k ? 'bg-amber-500/20 text-amber-200' : 'bg-bench-800 text-slate-300 hover:bg-bench-700'}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>
      {tab === 'guides' && (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-80 shrink-0 flex-col border-r border-bench-700">
            <div className="space-y-2 p-2">
              <input className="input" placeholder="Search symptoms, parts, lines…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="kb-search" />
              <div className="flex flex-wrap gap-1">
                <button className={`chip ${!cat ? 'border-amber-400 text-amber-200' : ''}`} onClick={() => setCat('')}>All</button>
                {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'border-amber-400 text-amber-200' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
              {list.map((x) => (
                <button key={x.id} className={`block w-full rounded px-2 py-1.5 text-left ${g?.id === x.id ? 'bg-amber-500/15' : 'hover:bg-bench-800'}`} onClick={() => setOpenId(x.id)}>
                  <div className="text-[13px] text-slate-100">{x.title}</div>
                  <div className="text-[11px] text-slate-500">{x.category} · {x.steps.length} steps</div>
                </button>
              ))}
              {!list.length && <div className="p-3 text-slate-500">No guide matches.</div>}
            </div>
          </div>
          {g && (
            <div className="min-h-0 flex-1 overflow-auto p-6" data-testid="kb-guide">
              <div className="text-[11px] uppercase tracking-wider text-amber-300/80">{g.category}</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-100">{g.title}</h2>
              <p className="mt-2 max-w-3xl text-slate-300">{g.symptoms}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {g.tools.map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
              <ol className="mt-5 max-w-3xl space-y-2">
                {g.steps.map((s, i) => {
                  const k = `${g.id}:${i}`;
                  return (
                    <li key={k} className={`card flex gap-3 p-3 ${done[k] ? 'opacity-60' : ''}`}>
                      <input type="checkbox" className="mt-1" checked={!!done[k]} onChange={(e) => setDone({ ...done, [k]: e.target.checked })} />
                      <div>
                        <div className="font-semibold text-slate-100">{i + 1}. {s.title}</div>
                        <div className="mt-0.5 text-slate-300">{s.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-5 grid max-w-3xl gap-4 md:grid-cols-2">
                <div className="card p-3">
                  <div className="label">Usual culprits</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-slate-300">{g.culprits.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
                {g.tips && (
                  <div className="card p-3">
                    <div className="label">Bench tips</div>
                    <ul className="list-disc space-y-0.5 pl-5 text-slate-300">{g.tips.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                )}
              </div>
              <div className="card mt-5 flex max-w-3xl flex-wrap items-center gap-2 p-3">
                <span className="text-slate-300">Save this guide to a model as a fault solution:</span>
                <select className="input w-64" value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Choose model…</option>
                  {p.brands.map((b) => (
                    <optgroup key={b.id} label={b.name}>
                      {p.models.filter((m) => m.brand_id === b.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button className="btn-primary" disabled={target === ''} onClick={() => copyToModel(g)}><Icon name="plus" size={13} /> Add to model</button>
                {msg && <div className="w-full text-[12px] text-amber-200">{msg}</div>}
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'tables' && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl space-y-5">
            {REF_TABLES.map((t) => (
              <div key={t.id} className="card p-4">
                <h2 className="font-semibold text-slate-100">{t.title}</h2>
                <p className="mt-1 text-[12px] text-slate-400">{t.intro}</p>
                <table className="mt-3 w-full text-left text-[12.5px]">
                  <thead><tr>{t.columns.map((c) => <th key={c} className="border-b border-bench-600 py-1 pr-3 text-[11px] uppercase tracking-wide text-slate-500">{c}</th>)}</tr></thead>
                  <tbody>{t.rows.map((r, i) => <tr key={i} className="border-b border-bench-800">{r.map((c, j) => <td key={j} className={`py-1.5 pr-3 align-top ${j === 0 ? 'font-mono text-amber-200' : 'text-slate-300'}`}>{c}</td>)}</tr>)}</tbody>
                </table>
                {t.note && <p className="mt-2 text-[11px] text-slate-500">{t.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'brands' && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
            {Object.entries(BRAND_NOTES).map(([b, notes]) => (
              <div key={b} className="card p-4">
                <h2 className="font-semibold text-slate-100">{b}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
