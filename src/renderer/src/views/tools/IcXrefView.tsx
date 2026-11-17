import { useEffect, useState } from 'react';
import type { IcXref } from '@shared/types';
import { api } from '../../api';
import { Icon } from '../../components/Icon';

const EMPTY = { ic: '', function: '', platform: '', used_in: '', alternatives: '', notes: '' };

export default function IcXrefView() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<IcXref[]>([]);
  const [edit, setEdit] = useState<Partial<IcXref> | null>(null);
  const [n, setN] = useState(0);
  const [show, setShow] = useState<'all' | 'verified' | 'unverified'>('all');
  const shown = rows.filter((r) => show === 'all' || (show === 'verified' ? !!r.verified_at : !r.verified_at));
  const nVer = rows.filter((r) => r.verified_at).length;
  const verify = async (r: IcXref, on: boolean) => { await api.verifyIc(r.id, on); setN((x) => x + 1); };

  useEffect(() => {
    const t = setTimeout(() => api.listIcs(q.trim() || undefined).then(setRows), 120);
    return () => clearTimeout(t);
  }, [q, n]);

  const save = async () => {
    if (!edit?.ic?.trim()) return;
    await api.saveIc({ ...edit, ic: edit.ic.trim(), source: 'shop' });
    setEdit(null);
    setN((x) => x + 1);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-100">IC cross-reference</h1>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => setEdit({ ...EMPTY })}><Icon name="plus" size={13} /> Add IC</button>
      </div>
      <p className="mt-1 max-w-3xl text-slate-400">Which charging, power and audio ICs turn up on which platforms, and what is often swapped for what. Starter entries are typical pairings, not checked against real boards. When you confirm one on a board in your hands, press Verify: your name and the date are saved with it.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-md" placeholder="Search IC, phone, platform… (e.g. MT6358, Helio, iPhone 12)" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ic-search" />
        <div className="flex overflow-hidden rounded-md border border-bench-600" data-testid="ic-filter">
          {(['all', 'verified', 'unverified'] as const).map((k) => (
            <button key={k} className={`px-2.5 py-1 text-[12px] ${show === k ? 'bg-amber-500/20 text-amber-200' : 'text-slate-300 hover:bg-bench-800'}`} onClick={() => setShow(k)} data-ic-filter={k}>
              {k === 'all' ? `All (${rows.length})` : k === 'verified' ? `Verified (${nVer})` : `To verify (${rows.length - nVer})`}
            </button>
          ))}
        </div>
      </div>
      {edit && (
        <div className="card mt-4 grid gap-2 p-3 md:grid-cols-3" data-testid="ic-editor">
          {(['ic', 'function', 'platform', 'used_in', 'alternatives', 'notes'] as const).map((k) => (
            <div key={k} className={k === 'notes' || k === 'used_in' ? 'md:col-span-3' : ''}>
              <label className="label">{{ ic: 'IC marking', function: 'Function', platform: 'Platform', used_in: 'Used in (models)', alternatives: 'Compatible / alternatives', notes: 'Notes' }[k]}</label>
              <input className={`input ${k === 'ic' ? 'font-mono' : ''}`} value={(edit as any)[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex justify-end gap-2 md:col-span-3">
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn-primary" disabled={!edit.ic?.trim()} onClick={save}>Save</button>
          </div>
        </div>
      )}
      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-bench-900 text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">IC</th><th className="px-3 py-2">Function</th><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Used in</th><th className="px-3 py-2">Alternatives</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} data-testid="ic-row" className="border-t border-bench-700 align-top hover:bg-bench-800/50">
                <td className="px-3 py-2 font-mono font-semibold text-cyan-300">{r.ic}{r.verified_at
                  ? <div className="mt-0.5 font-sans text-[9.5px] font-normal uppercase tracking-wide text-green-300" title={`Verified ${r.verified_at}`} data-testid="ic-verified">✓ verified by {r.verified_by} · {r.verified_at.slice(0, 10)}</div>
                  : <div className="mt-0.5 font-sans text-[9.5px] font-normal uppercase tracking-wide text-amber-300/70">{r.source === 'starter' ? 'starter · ' : ''}not verified</div>}</td>
                <td className="px-3 py-2 text-slate-200">{r.function}</td>
                <td className="px-3 py-2 text-slate-300">{r.platform}</td>
                <td className="px-3 py-2 text-slate-300">{r.used_in}{r.notes && <div className="mt-0.5 text-[11px] text-slate-500">{r.notes}</div>}</td>
                <td className="px-3 py-2 text-slate-300">{r.alternatives}</td>
                <td className="whitespace-nowrap px-2 py-2">
                  {r.verified_at
                    ? <button className="btn-ghost text-[11px] text-slate-400" title="Remove the verification" onClick={() => verify(r, false)}>Unverify</button>
                    : <button className="btn-ghost text-[11px] text-green-300" title="I checked this on a real board" onClick={() => verify(r, true)} data-testid="ic-verify">✓ Verify</button>}
                  <button className="btn-ghost" title="Edit" onClick={() => setEdit(r)}><Icon name="edit" size={13} /></button>
                  <button className="btn-ghost text-red-300/80" title="Delete" onClick={async () => { await api.deleteIc(r.id); setN((x) => x + 1); }}><Icon name="trash" size={13} /></button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No entries match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
