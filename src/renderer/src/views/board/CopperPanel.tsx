// Real copper on the boardview: what the lines mean, the copper that came with
// the file (KiCad layout), Gerber copper layers the shop added, and copper the
// shop traced on aligned photos.
import { useState } from 'react';
import type { CopperLayer } from '@shared/types';
import { alignGerber, guessGerberSide, parseGerber, placeGerber } from '@parsers/gerber.js';
import { api } from '../../api';
import { Icon } from '../../components/Icon';

export interface ShopTraceInfo { photos: number; traces: number; unaligned: number }

interface Props {
  board: any;
  fileId: string;
  layers: CopperLayer[];
  shop: ShopTraceInfo;
  fileTraces: number;
  onChanged: () => void;
  onClose: () => void;
}

export default function CopperPanel(p: Props) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (paths?: string[]) => {
    setBusy(true);
    setMsg('');
    try {
      const files = await api.readGerbers(paths);
      const notes: string[] = [];
      for (const f of files) {
        const g = parseGerber(f.text);
        if (!g.traces.length) { notes.push(`${f.name}: no tracks found (is it a copper layer?)`); continue; }
        const side = g.side || guessGerberSide(f.name) || 'top';
        const fit = alignGerber(g, p.board);
        const traces = placeGerber(g, fit, side);
        await api.addCopper({ file_id: p.fileId, name: f.name, side, method: fit.method, traces });
        notes.push(fit.method === 'pins'
          ? `${f.name}: ${traces.length} tracks, lined up on ${fit.matched} pads.`
          : `${f.name}: ${traces.length} tracks, stretched to the board outline. Check it lines up by eye.`);
      }
      setMsg(notes.join(' '));
      p.onChanged();
    } catch (e: any) {
      setMsg('Could not read that file: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-80 rounded-lg border border-bench-600 bg-bench-900/95 p-3 text-[12px] shadow-2xl" data-testid="copper-panel">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="layers" size={14} className="text-amber-300" />
        <span className="flex-1 font-semibold text-slate-100">Copper traces</span>
        <button className="btn-ghost" onClick={p.onClose}><Icon name="x" size={13} /></button>
      </div>
      <div className="space-y-1.5 rounded-md bg-bench-850 p-2" data-testid="copper-legend">
        <Legend style={{ background: 'rgb(var(--c-amber-500))', height: 4 }} text="Real copper from a layout file or Gerber layer" />
        <Legend style={{ background: '#22c55e', height: 3 }} text="Copper traced by your shop on a board photo (verified)" />
        <Legend style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(var(--c-slate-400)) 0 6px, transparent 6px 10px)', height: 2 }} text="Computed: shortest lines between pins of the same net. Shows what connects, not where the copper runs." />
      </div>
      <div className="mt-3 space-y-1" data-testid="copper-sources">
        <Row ok={p.fileTraces > 0} label="This file" detail={p.fileTraces ? `${p.fileTraces.toLocaleString()} real tracks` : 'Boardview files hold pins and nets only, no copper'} />
        {p.layers.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-bench-800" data-testid="copper-layer">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="min-w-0 flex-1 truncate" title={l.name}>{l.name} <span className="text-slate-500">· {l.side} · {l.traces.length} tracks · {l.method === 'pins' ? 'lined up on pads' : 'fitted to outline'}</span></span>
            <button className="btn-ghost text-red-300" title="Remove this layer" onClick={async () => { await api.deleteCopper(l.id); p.onChanged(); }}><Icon name="trash" size={12} /></button>
          </div>
        ))}
        <Row ok={p.shop.traces > 0} label="Shop traces" detail={p.shop.traces ? `${p.shop.traces} from ${p.shop.photos} aligned photo${p.shop.photos === 1 ? '' : 's'}` : 'None yet'} />
        {p.shop.unaligned > 0 && <div className="pl-4 text-[11px] text-amber-200/80">{p.shop.unaligned} traced on photos that are not aligned yet. Open the photo and press "Align to boardview".</div>}
      </div>
      <button className="btn-primary mt-3 w-full justify-center" disabled={busy} onClick={() => add()} data-testid="copper-add"><Icon name="plus" size={13} /> Add Gerber copper layer…</button>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        For real routing, open the KiCad layout (.kicad_pcb) or ODB++ job (.tgz or .zip), or add the board's Gerber copper files (top .gtl, bottom .gbl, inner .g1…). Gerber X2 files line up on the pads automatically. Or trace copper yourself on a board photo in Contributor mode with the Trace tool.
      </p>
      {msg && <div className="mt-2 text-[11.5px] text-slate-300" data-testid="copper-msg">{msg}</div>}
    </div>
  );
}

function Legend({ style, text }: { style: React.CSSProperties; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 rounded-full" style={style} />
      <span className="text-slate-300">{text}</span>
    </div>
  );
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-400' : 'bg-bench-600'}`} />
      <span className="text-slate-200">{label}</span>
      <span className="min-w-0 flex-1 truncate text-slate-500">{detail}</span>
    </div>
  );
}
