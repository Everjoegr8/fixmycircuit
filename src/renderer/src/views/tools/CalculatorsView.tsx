import { useState } from 'react';
import { decodeCapacitor, decodeResistor, divider, dividerR2, formatSI, ohmsLaw, parallel, parseSI, series } from '@shared/calc';
import { REF_TABLES } from '@shared/knowledge';

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`card p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <h2 className="mb-3 font-semibold text-slate-100">{title}</h2>
      {children}
    </div>
  );
}

function Result({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[15px] text-amber-100" data-testid={testid}>{children}</div>;
}

export default function CalculatorsView() {
  const [res, setRes] = useState('472');
  const [cap, setCap] = useState('104');
  const [dv, setDv] = useState({ vin: '5', r1: '10k', r2: '10k', target: '1.8' });
  const [ohm, setOhm] = useState({ V: '3.8', I: '', R: '10', P: '' });
  const [list, setList] = useState('10k, 10k, 4.7k');

  const r = decodeResistor(res);
  const c = decodeCapacitor(cap);
  const vin = parseSI(dv.vin), r1 = parseSI(dv.r1), r2 = parseSI(dv.r2), target = parseSI(dv.target);
  const vout = divider(vin, r1, r2);
  const needR2 = dividerR2(vin, target, r1);
  const o = ohmsLaw(Object.fromEntries(Object.entries(ohm).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, parseSI(v)])));
  const values = list.split(/[,;\s]+/).map(parseSI).filter((x) => isFinite(x) && x > 0);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-semibold text-slate-100">Quick repair calculators</h1>
      <p className="mt-1 text-slate-400">Decode SMD markings and work out values at the bench. Values accept k, M, m, u, n and p (for example 4.7k or 100n).</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card title="SMD resistor code">
          <input className="input font-mono text-lg" value={res} onChange={(e) => setRes(e.target.value)} placeholder="472, 4702, 4R7, 01C" data-testid="res-code" />
          <div className="mt-2 flex flex-wrap gap-1">
            {['103', '472', '1002', '4R7', 'R100', '01C', '68X', '000'].map((x) => <button key={x} className="chip hover:border-amber-400" onClick={() => setRes(x)}>{x}</button>)}
          </div>
          {r ? (
            <Result testid="res-result">{formatSI(r.ohms, 'Ω')} <span className="text-[12px] text-amber-200/70">· {r.tolerance}</span><div className="font-sans text-[11px] text-slate-400">{r.system}</div></Result>
          ) : <Result>Not a known code</Result>}
          <p className="mt-2 text-[11px] text-slate-500">3-digit: two digits then the number of zeros. 4-digit: three digits then zeros. EIA-96: two digits from the E96 table then a letter multiplier. R marks the decimal point.</p>
        </Card>
        <Card title="Capacitor code">
          <input className="input font-mono text-lg" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="104, 225, 4p7, 2n2" />
          {c ? <Result>{formatSI(c.farads, 'F')}<div className="font-sans text-[11px] text-slate-400">{c.system}</div></Result> : <Result>Not a known code</Result>}
          <p className="mt-2 text-[11px] text-slate-500">Most phone MLCCs are not marked at all: measure with an LCR meter out of circuit, or read the value from the boardview or schematic.</p>
        </Card>
        <Card title="Voltage divider">
          <div className="grid grid-cols-3 gap-2">
            {(['vin', 'r1', 'r2'] as const).map((k) => (
              <div key={k}><label className="label">{k === 'vin' ? 'Vin (V)' : k.toUpperCase() + ' (Ω)'}</label><input className="input font-mono" value={dv[k]} onChange={(e) => setDv({ ...dv, [k]: e.target.value })} data-testid={`dv-${k}`} /></div>
            ))}
          </div>
          <Result testid="dv-result">Vout = {isFinite(vout) ? `${formatSI(vout, 'V')}` : '—'}</Result>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1"><label className="label">Target Vout (V)</label><input className="input font-mono" value={dv.target} onChange={(e) => setDv({ ...dv, target: e.target.value })} /></div>
            <div className="flex-1 pb-1.5 font-mono text-slate-200">R2 = {isFinite(needR2) && needR2 > 0 ? formatSI(needR2, 'Ω') : '—'}</div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Vout = Vin × R2 / (R1 + R2), with R2 to GND. Useful for feedback resistors on buck and boost converters.</p>
        </Card>
        <Card title="Ohm's law and power">
          <div className="grid grid-cols-4 gap-2">
            {(['V', 'I', 'R', 'P'] as const).map((k) => (
              <div key={k}><label className="label">{{ V: 'Volts', I: 'Amps', R: 'Ohms', P: 'Watts' }[k]}</label><input className="input font-mono" value={ohm[k]} onChange={(e) => setOhm({ ...ohm, [k]: e.target.value })} placeholder="?" /></div>
            ))}
          </div>
          {o ? (
            <Result>{formatSI(o.V, 'V')} · {formatSI(o.I, 'A')} · {formatSI(o.R, 'Ω')} · {formatSI(o.P, 'W')}</Result>
          ) : <Result>Fill in exactly two values</Result>}
          <button className="btn mt-2" onClick={() => setOhm({ V: '', I: '', R: '', P: '' })}>Clear</button>
        </Card>
        <Card title="Series and parallel">
          <input className="input font-mono" value={list} onChange={(e) => setList(e.target.value)} placeholder="10k, 4.7k, 2.2k" />
          <Result>Series {formatSI(series(values), 'Ω')} · Parallel {formatSI(parallel(values), 'Ω')}</Result>
          <p className="mt-2 text-[11px] text-slate-500">For capacitors swap the results: parallel capacitors add, series capacitors combine like parallel resistors.</p>
        </Card>
        <Card title="Bench reference">
          <ul className="space-y-1 text-[12px] text-slate-300">
            {REF_TABLES.find((t) => t.id === 'diode-mode')!.rows.slice(0, 4).map((row) => <li key={row[0]}><span className="font-mono text-amber-200">{row[0]}</span> {row[1]}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Full tables are under Repair knowledge → Reference tables.</p>
        </Card>
      </div>
    </div>
  );
}
