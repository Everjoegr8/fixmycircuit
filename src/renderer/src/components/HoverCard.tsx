import type { Reading } from '@shared/types';
import { LAYER_BY_ID, layerOfNet } from '@shared/layers';

export interface HoverData {
  x: number;
  y: number;
  pin?: string;
  net?: string;
  part?: string;
  readings: Reading[];
  ics: string[];
}

/** Floating reference card: pin, net, diode and voltage readings, connected ICs. */
export default function HoverCard({ d }: { d: HoverData }) {
  const layer = layerOfNet(d.net);
  const pick = (t: string) => d.readings.filter((r) => r.type === t);
  const diode = pick('diode');
  const volt = pick('voltage');
  const row = (k: string, v: React.ReactNode, cls = 'text-slate-100') => (
    <div className="flex gap-3"><span className="w-20 shrink-0 text-slate-500">{k}</span><span className={`min-w-0 flex-1 truncate ${cls}`}>{v}</span></div>
  );
  const fmt = (rs: Reading[], unit: string) => (rs.length ? [...new Set(rs.map((r) => `${r.value}${unit}`))].slice(0, 3).join(' / ') : <span className="text-slate-600">no reading yet</span>);
  return (
    <div className="pointer-events-none absolute z-30 w-64 rounded-lg border border-bench-500 bg-bench-950/95 p-2.5 font-mono text-[11.5px] shadow-2xl" style={{ left: d.x + 16, top: d.y + 16 }} data-testid="hover-card">
      {row('Pin', d.pin || '—', 'text-cyan-300')}
      {row('Net', <>{d.net || 'no net'}{layer && <span className="ml-1.5 rounded px-1 text-[10px] text-black" style={{ background: LAYER_BY_ID[layer].color }}>{LAYER_BY_ID[layer].label.split(' /')[0]}</span>}</>, 'text-amber-300')}
      {row('Diode', fmt(diode, ' V'))}
      {row('Voltage', fmt(volt, ' V'), 'text-green-300')}
      {row('IC', d.ics.length ? d.ics.slice(0, 4).join(', ') : '—', 'text-slate-200')}
      {diode[0]?.note && <div className="mt-1 line-clamp-2 font-sans text-[10.5px] text-slate-500">{diode[0].note}</div>}
    </div>
  );
}
