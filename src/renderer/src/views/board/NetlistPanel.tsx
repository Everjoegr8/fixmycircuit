// Netlist browser: every net and part in the file, board health, and a DC path
// tracer between two parts or nets.
import { useMemo, useState } from 'react';
import { LAYER_BY_ID, layerOfNet } from '@shared/layers';
import { TYPE_LABEL, findPath, resolveRef, type BoardIndex, type PartType, type PathStep } from '@shared/netindex';
import { Icon } from '../../components/Icon';

interface Props {
  idx: BoardIndex;
  onNet: (net: string) => void;
  onPart: (name: string) => void;
  onPath: (nets: string[]) => void;
  onClose: () => void;
  initialTab?: Tab;
}
type Tab = 'nets' | 'parts' | 'path';

export default function NetlistPanel(p: Props) {
  const [tab, setTab] = useState<Tab>(p.initialTab || 'nets');
  const [q, setQ] = useState('');
  const [netKind, setNetKind] = useState<'all' | 'rail' | 'gnd' | 'signal'>('all');
  const [ptype, setPtype] = useState<PartType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [path, setPath] = useState<PathStep[] | null | 'none' | 'bad'>(null);
  const s = p.idx.stats;

  const nets = useMemo(() => {
    const t = q.trim().toUpperCase();
    return [...p.idx.nets.values()]
      .filter((n) => (!t || n.name.toUpperCase().includes(t)) && (netKind === 'all' || (netKind === 'rail' ? n.rail : netKind === 'gnd' ? n.ground : !n.rail && !n.ground)))
      .sort((a, b) => b.pins - a.pins || a.name.localeCompare(b.name));
  }, [p.idx, q, netKind]);
  const parts = useMemo(() => {
    const t = q.trim().toUpperCase();
    return [...p.idx.parts.values()]
      .filter((x) => (!t || x.name.toUpperCase().includes(t) || (x.mfgcode || '').toUpperCase().includes(t)) && (!ptype || x.type === ptype))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [p.idx, q, ptype]);

  const trace = () => {
    const a = resolveRef(p.idx, from), b = resolveRef(p.idx, to);
    if (!a || !b) { setPath('bad'); p.onPath([]); return; }
    const r = findPath(p.idx, a.name, b.name);
    setPath(r || 'none');
    p.onPath(r ? r.map((x) => x.net) : []);
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-bench-600 bg-bench-900/95 shadow-2xl backdrop-blur" data-testid="netlist-panel">
      <div className="flex items-center gap-2 border-b border-bench-700 px-3 py-2">
        <Icon name="net" size={14} className="text-cyan-300" />
        <span className="font-semibold text-slate-100">Netlist</span>
        <div className="flex-1" />
        <button className="btn-ghost" onClick={p.onClose} title="Close"><Icon name="x" size={13} /></button>
      </div>
      <div className="grid grid-cols-3 gap-1 border-b border-bench-700 p-2 text-center text-[11px]" data-testid="board-health">
        <Stat k="Parts" v={s.parts} />
        <Stat k="Nets" v={s.nets} />
        <Stat k="Pins" v={s.pins} />
        <Stat k="NC pins" v={s.ncPins} />
        <Stat k="1-pin nets" v={s.singlePinNets} />
        <Stat k="Ground nets" v={s.groundNets.length} />
      </div>
      <div className="flex border-b border-bench-700">
        {(['nets', 'parts', 'path'] as Tab[]).map((t) => (
          <button key={t} className={`flex-1 py-1.5 capitalize ${tab === t ? 'border-b-2 border-amber-400 text-amber-200' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => setTab(t)} data-testid={`netlist-tab-${t}`}>
            {t === 'path' ? 'Trace path' : `${t} (${t === 'nets' ? s.nets : s.parts})`}
          </button>
        ))}
      </div>
      {tab !== 'path' && (
        <div className="space-y-1.5 p-2">
          <input className="input" placeholder={tab === 'nets' ? 'Filter nets' : 'Filter parts or codes'} value={q} onChange={(e) => setQ(e.target.value)} data-testid="netlist-filter" />
          {tab === 'nets' ? (
            <div className="flex gap-1">
              {(['all', 'rail', 'signal', 'gnd'] as const).map((k) => (
                <button key={k} className={`chip ${netKind === k ? 'border-amber-400 text-amber-200' : ''}`} onClick={() => setNetKind(k)}>{k === 'all' ? 'All' : k === 'rail' ? 'Rails' : k === 'gnd' ? 'Ground' : 'Signals'}</button>
              ))}
            </div>
          ) : (
            <select className="input py-0.5" value={ptype} onChange={(e) => setPtype(e.target.value as PartType | '')}>
              <option value="">All types</option>
              {Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => <option key={t} value={t}>{TYPE_LABEL[t as PartType]} ({n})</option>)}
            </select>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        {tab === 'nets' && (
          <>
            {nets.slice(0, 600).map((n) => {
              const l = layerOfNet(n.name);
              return (
                <button key={n.name} className="flex w-full items-center gap-2 rounded px-2 py-[3px] text-left hover:bg-bench-800" onClick={() => p.onNet(n.name)} data-testid="net-row">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l ? LAYER_BY_ID[l].color : 'rgb(var(--c-bench-600))' }} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{n.name}</span>
                  {n.rail && <span className="rounded bg-amber-500/15 px-1 text-[9.5px] font-semibold text-amber-300">RAIL</span>}
                  <span className="text-[11px] text-slate-500">{n.pins}</span>
                </button>
              );
            })}
            {nets.length > 600 && <div className="p-2 text-[11px] text-slate-500">Showing 600 of {nets.length}. Type to narrow.</div>}
          </>
        )}
        {tab === 'parts' && (
          <>
            {parts.slice(0, 600).map((x) => (
              <button key={x.name} className="flex w-full items-center gap-2 rounded px-2 py-[3px] text-left hover:bg-bench-800" onClick={() => p.onPart(x.name)} data-testid="part-row">
                <span className="w-20 shrink-0 truncate font-mono text-[12px] text-cyan-300">{x.name}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{TYPE_LABEL[x.type]}{x.mfgcode ? ` · ${x.mfgcode}` : ''}</span>
                <span className="text-[11px] text-slate-500">{x.pins.length}p</span>
              </button>
            ))}
            {parts.length > 600 && <div className="p-2 text-[11px] text-slate-500">Showing 600 of {parts.length}. Type to narrow.</div>}
          </>
        )}
        {tab === 'path' && (
          <div className="space-y-2 p-2" data-testid="path-tracer">
            <p className="text-[11.5px] text-slate-400">Find how two parts or nets connect through resistors, coils, fuses, ferrites, jumpers and diodes. Ground is never crossed. Only connections in the boardview file are used.</p>
            <datalist id="fmc-refs">
              {[...p.idx.nets.keys()].slice(0, 4000).map((n) => <option key={'n' + n} value={n} />)}
              {[...p.idx.parts.keys()].slice(0, 4000).map((n) => <option key={'p' + n} value={n} />)}
            </datalist>
            <label className="label">From part or net</label>
            <input className="input font-mono" list="fmc-refs" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. J1 or VBUS" data-testid="path-from" />
            <label className="label">To part or net</label>
            <input className="input font-mono" list="fmc-refs" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && trace()} placeholder="e.g. U1 or VSYS" data-testid="path-to" />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={trace} data-testid="path-go"><Icon name="path" size={13} /> Trace</button>
              <button className="btn" onClick={() => { const a = from; setFrom(to); setTo(a); }}>⇅</button>
              {path && <button className="btn-ghost" onClick={() => { setPath(null); p.onPath([]); }}>Clear</button>}
            </div>
            {path === 'bad' && <div className="text-[12px] text-red-300">Not found in this board. Check the spelling of both names.</div>}
            {path === 'none' && <div className="text-[12px] text-amber-200">No DC path through series parts. They may connect through an IC, a transistor or a capacitor, which this tracer does not cross.</div>}
            {Array.isArray(path) && (
              <ol className="relative mt-2 space-y-0" data-testid="path-result">
                {path.map((st, i) => (
                  <li key={st.net + i}>
                    {st.via && (
                      <button className="ml-3 flex items-center gap-1 border-l-2 border-dashed border-cyan-400/60 py-1 pl-3 text-[11.5px] text-slate-300 hover:text-cyan-200" onClick={() => p.onPart(st.via!.part)}>
                        through <span className="font-mono text-cyan-300">{st.via.part}</span> <span className="text-slate-500">({TYPE_LABEL[st.via.type]})</span>
                      </button>
                    )}
                    <button className="flex w-full items-center gap-2 rounded border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-left hover:bg-cyan-400/20" onClick={() => p.onNet(st.net)}>
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-400/25 text-[10px] font-bold text-cyan-200">{i + 1}</span>
                      <span className="font-mono text-[12px] text-slate-100">{st.net}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded bg-bench-850 py-1">
      <div className="font-semibold text-slate-100">{v.toLocaleString()}</div>
      <div className="text-[10px] text-slate-500">{k}</div>
    </div>
  );
}
