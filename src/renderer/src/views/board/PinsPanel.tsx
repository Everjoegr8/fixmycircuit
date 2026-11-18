// Right-hand inspector in the style repair techs know: a NET tab listing every
// pad on the picked net (No, part code, pad), a Component tab with a part
// lookup and its pins, and a Sheet tab with the model's measurement points and
// common faults, built only from the shop's own readings and fault solutions.
import { useEffect, useMemo, useState } from 'react';
import type { Guide, Reading } from '@shared/types';
import { TYPE_LABEL, type BoardIndex } from '@shared/netindex';
import { netHint } from '@shared/netdesc';
import { Icon } from '../../components/Icon';

export type PinsTab = 'net' | 'part' | 'sheet';

interface Props {
  board: any;
  idx: BoardIndex;
  sel: { part: number | null; pin: number | null; net: string | null };
  tab: PinsTab;
  onTab: (t: PinsTab) => void;
  readings: Reading[];
  guides: Guide[];
  onPin: (pin: number) => void;
  onNet: (net: string) => void;
  onPart: (index: number) => void;
  onClose: () => void;
}

const up = (s: string) => (s || '').trim().toUpperCase();

/** Latest shop value per net and type. */
export function readingsByNet(readings: Reading[]) {
  const out = new Map<string, { net: string; diode?: string; voltage?: string; resistance?: string; demo: boolean }>();
  const sorted = readings.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const r of sorted) {
    if (!r.net || r.type === 'note' || !r.value) continue;
    const k = up(r.net);
    let e = out.get(k);
    if (!e) out.set(k, (e = { net: r.net, demo: false }));
    (e as any)[r.type] = r.value;
    if (/synthetic|demo/i.test(r.note || '')) e.demo = true;
  }
  return out;
}

export default function PinsPanel(p: Props) {
  const { board, idx } = p;
  const [netQ, setNetQ] = useState('');
  const [partQ, setPartQ] = useState('');
  useEffect(() => { if (p.sel.net) setNetQ(p.sel.net); }, [p.sel.net]);
  useEffect(() => { if (p.sel.part != null) setPartQ(board.parts[p.sel.part]?.name || ''); }, [p.sel.part, board]);

  const netName = useMemo(() => {
    const t = up(netQ);
    if (!t) return null;
    for (const n of board.nets.keys()) if (up(n) === t) return n as string;
    return null;
  }, [netQ, board]);
  const netRows = useMemo(() => {
    if (!netName) return [];
    return (board.nets.get(netName) || [])
      .map((i: number) => ({ i, pin: board.pins[i], part: board.parts[board.pins[i].part] }))
      .sort((a: any, b: any) => (a.part?.name || '').localeCompare(b.part?.name || '', undefined, { numeric: true }) || String(a.pin.snum).localeCompare(String(b.pin.snum), undefined, { numeric: true }));
  }, [netName, board]);
  const netSuggest = useMemo(() => {
    const t = up(netQ);
    if (!t || netName) return [];
    return [...board.nets.keys()].filter((n: string) => up(n).includes(t)).slice(0, 40) as string[];
  }, [netQ, netName, board]);

  const partIndex = useMemo(() => {
    const t = up(partQ);
    if (!t) return null;
    const i = idx.parts.get(partQ.trim())?.index ?? board.parts.findIndex((x: any) => up(x.name) === t);
    return i != null && i >= 0 ? i : null;
  }, [partQ, idx, board]);
  const partSuggest = useMemo(() => {
    const t = up(partQ);
    if (!t || partIndex != null) return [];
    return board.parts.filter((x: any) => !x.testpoint && (up(x.name).includes(t) || up(x.mfgcode || '').includes(t))).slice(0, 40);
  }, [partQ, partIndex, board]);
  const part = partIndex != null ? board.parts[partIndex] : null;

  const values = useMemo(() => readingsByNet(p.readings), [p.readings]);
  const sheet = useMemo(() => {
    const rows: { net: string; what: string; volts: string; diode: string; fromName: boolean; demo: boolean; onBoard: boolean }[] = [];
    const seen = new Set<string>();
    for (const [k, v] of values) {
      seen.add(k);
      const h = netHint(v.net);
      const onBoard = [...board.nets.keys()].some((n: string) => up(n) === k);
      rows.push({ net: v.net, what: h.what, volts: v.voltage || (h.volts != null ? `${h.volts} V` : ''), diode: v.diode || '', fromName: !v.voltage && h.volts != null, demo: v.demo, onBoard });
    }
    // Main rails of this board with no shop value yet, so the tech knows what to measure next.
    const rails = [...idx.nets.values()].filter((n) => n.rail && !n.ground && !seen.has(up(n.name))).sort((a, b) => b.caps - a.caps || b.pins - a.pins).slice(0, 24);
    for (const n of rails) {
      const h = netHint(n.name);
      rows.push({ net: n.name, what: h.what || 'Supply rail', volts: h.volts != null ? `${h.volts} V` : '', diode: '', fromName: h.volts != null, demo: false, onBoard: true });
    }
    return rows;
  }, [values, idx, board]);

  const tabs: [PinsTab, string][] = [['net', 'NET'], ['part', 'Component'], ['sheet', 'Sheet']];
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-bench-600 bg-bench-900" data-testid="pins-panel">
      <div className="flex items-center border-b border-bench-700">
        {tabs.map(([k, l]) => (
          <button key={k} className={`flex-1 border-b-2 px-2 py-2 text-[12.5px] font-semibold ${p.tab === k ? 'border-amber-400 text-amber-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`} onClick={() => p.onTab(k)} data-testid={`pins-tab-${k}`}>{l}</button>
        ))}
        <button className="btn-ghost mx-1" onClick={p.onClose} title="Close"><Icon name="x" size={13} /></button>
      </div>

      {p.tab === 'net' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative p-2">
            <input className="input font-mono" placeholder="Net name, e.g. VBUS" value={netQ} onChange={(e) => setNetQ(e.target.value)} data-testid="pins-net-input" />
            {netSuggest.length > 0 && (
              <div className="absolute left-2 right-2 top-10 z-10 max-h-64 overflow-auto rounded border border-bench-600 bg-bench-850 p-1 shadow-xl">
                {netSuggest.map((n) => <button key={n} className="block w-full truncate rounded px-2 py-0.5 text-left font-mono text-[12px] hover:bg-bench-700" onClick={() => { setNetQ(n); p.onNet(n); }}>{n}</button>)}
              </div>
            )}
            {netName && (() => {
              const h = netHint(netName);
              const v = values.get(up(netName));
              return (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[11.5px]">
                  <span className="chip">{netRows.length} pads</span>
                  {h.what && <span className="chip text-slate-300">{h.what}</span>}
                  {v?.diode && <span className="chip border-red-500/50 text-red-300">Diode {v.diode}</span>}
                  {v?.voltage && <span className="chip border-amber-500/50 text-amber-300">{v.voltage}</span>}
                </div>
              );
            })()}
          </div>
          <Table head={['No', 'Code', 'PAD', 'Side']} testid="pins-net-table">
            {netRows.map((r: any, n: number) => (
              <tr key={r.i} className={`cursor-pointer hover:bg-bench-800 ${p.sel.pin === r.i ? 'bg-amber-500/15 text-amber-100' : ''}`} onClick={() => p.onPin(r.i)}>
                <td className="px-2 py-px text-slate-500">{n + 1}</td>
                <td className="px-2 py-px text-cyan-300">{r.part?.testpoint ? 'TP' : r.part?.name}</td>
                <td className="px-2 py-px">{r.pin.snum || r.pin.name}</td>
                <td className="px-2 py-px text-slate-500">{r.pin.side === 'bottom' ? 'B' : r.pin.side === 'top' ? 'T' : 'T/B'}</td>
              </tr>
            ))}
          </Table>
          {!netName && <p className="px-3 py-2 text-[12px] text-slate-500">Click a pad on the board or type a net name. Every pad on the net is listed here; click one to jump to it.</p>}
        </div>
      )}

      {p.tab === 'part' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative p-2">
            <input className="input font-mono" placeholder="Lookup part, e.g. U2 or C3000" value={partQ} onChange={(e) => setPartQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && partIndex != null) p.onPart(partIndex); }} data-testid="pins-part-input" />
            {partSuggest.length > 0 && (
              <div className="absolute left-2 right-2 top-10 z-10 max-h-64 overflow-auto rounded border border-bench-600 bg-bench-850 p-1 shadow-xl">
                {partSuggest.map((x: any) => <button key={x.index} className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left font-mono text-[12px] hover:bg-bench-700" onClick={() => { setPartQ(x.name); p.onPart(x.index); }}><span>{x.name}</span><span className="truncate text-[10.5px] text-slate-500">{x.mfgcode}</span></button>)}
              </div>
            )}
            {part && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px]">
                <button className="chip border-cyan-500/50 text-cyan-300" onClick={() => p.onPart(part.index)} title="Show on the board">{part.name}</button>
                <span className="chip">{TYPE_LABEL[idx.parts.get(part.name)?.type || 'other']}</span>
                <span className="chip capitalize">{part.side}</span>
                <span className="chip">{part.pins.length} pins</span>
                {part.mfgcode && <span className="chip truncate text-slate-400">{part.mfgcode}</span>}
              </div>
            )}
          </div>
          <Table head={['No', 'PAD', 'NET']} testid="pins-part-table">
            {part && part.pins.map((i: number, n: number) => {
              const pin = board.pins[i];
              return (
                <tr key={i} className={`cursor-pointer hover:bg-bench-800 ${p.sel.pin === i ? 'bg-amber-500/15 text-amber-100' : ''}`} onClick={() => p.onPin(i)}>
                  <td className="px-2 py-px text-slate-500">{n + 1}</td>
                  <td className="px-2 py-px">{pin.snum || pin.name}</td>
                  <td className={`truncate px-2 py-px ${pin.net === p.sel.net ? 'text-amber-300' : 'text-slate-200'}`}>{pin.net || '—'}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      {p.tab === 'sheet' && (
        <div className="min-h-0 flex-1 overflow-auto" data-testid="pins-sheet">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Measurement points</div>
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-bench-850 text-left text-[10.5px] uppercase text-slate-500">
              <tr><th className="px-2 py-1">Signal</th><th className="px-1 py-1">What it is</th><th className="px-1 py-1">Volts</th><th className="px-2 py-1">Diode</th></tr>
            </thead>
            <tbody>
              {sheet.map((r) => (
                <tr key={r.net} className={`border-t border-bench-800 ${r.onBoard ? 'cursor-pointer hover:bg-bench-800' : 'opacity-60'} ${up(p.sel.net || '') === up(r.net) ? 'bg-amber-500/15' : ''}`} onClick={() => { if (r.onBoard) { const n = [...board.nets.keys()].find((x: string) => up(x) === up(r.net)); if (n) p.onNet(n); } }}>
                  <td className="px-2 py-0.5 font-mono text-red-300">{r.net}</td>
                  <td className="px-1 py-0.5 text-slate-400">{r.what}</td>
                  <td className="px-1 py-0.5 font-mono" title={r.fromName ? 'Read from the net name, not measured' : 'Shop reading'}>{r.volts}{r.fromName && r.volts ? <span className="text-slate-500">*</span> : ''}</td>
                  <td className={`px-2 py-0.5 font-mono ${r.demo ? 'text-amber-300' : 'text-slate-100'}`} title={r.demo ? 'Synthetic demo value, not measured on a real phone' : undefined} data-demo={r.demo ? '1' : undefined}>{r.diode || <span className="text-slate-600">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-1 text-[10.5px] leading-snug text-slate-500">Values come from your shop's readings for this model. * = voltage read from the net name, not measured.{sheet.some((r) => r.demo) ? ' Amber values are synthetic demo data, not from a real phone.' : ''} Rails with "—" have no reading yet: measure a good board and add one.</p>
          <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Common faults</div>
          {p.guides.length ? (
            <table className="w-full text-[11.5px]" data-testid="pins-faults">
              <thead className="text-left text-[10.5px] uppercase text-slate-500"><tr><th className="px-2 py-1">Symptom</th><th className="px-1 py-1">Fault point</th><th className="px-2 py-1">Fix</th></tr></thead>
              <tbody>
                {p.guides.map((g) => {
                  const pts = [g.parts, g.nets].filter(Boolean).join(', ');
                  const first = (g.steps || '').split(/\n/).map((x) => x.trim()).filter(Boolean)[0] || '';
                  return (
                    <tr key={g.id} className="border-t border-bench-800 align-top">
                      <td className="px-2 py-1 text-slate-200">{g.title}</td>
                      <td className="px-1 py-1 font-mono">
                        {pts.split(/[,\s]+/).filter(Boolean).slice(0, 6).map((t) => {
                          const pi = board.parts.findIndex((x: any) => up(x.name) === up(t));
                          const net = pi < 0 ? [...board.nets.keys()].find((x: string) => up(x) === up(t)) : null;
                          return <button key={t} className="mr-1 text-cyan-300 hover:underline disabled:text-slate-500 disabled:no-underline" disabled={pi < 0 && !net} onClick={() => (pi >= 0 ? p.onPart(pi) : net && p.onNet(net))}>{t}</button>;
                        })}
                      </td>
                      <td className="px-2 py-1 text-slate-400">{first}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-3 text-[12px] text-slate-500">No fault solutions for this model yet. Add them in the model's Fault solutions tab.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Table({ head, children, testid }: { head: string[]; children: any; testid: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full font-mono text-[12px]" data-testid={testid}>
        <thead className="sticky top-0 bg-bench-850 text-left text-[10.5px] uppercase text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
