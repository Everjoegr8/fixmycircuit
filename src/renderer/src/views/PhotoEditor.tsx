// Shop Contributor Mode: drop reading pins and draw jumper wires on a board photo.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Jumper, Photo, Reading, ReadingType } from '@shared/types';
import { api, fileUrl } from '../api';
import { Icon } from '../components/Icon';
import type { Focus } from '../types';

type Tool = 'select' | 'pin' | 'jumper';
type Sel = { kind: 'pin'; id: number } | { kind: 'jumper'; id: number } | null;

const TYPE_COLORS: Record<ReadingType, string> = { diode: '#f5a524', voltage: '#22c55e', resistance: '#38bdf8', note: '#e879f9' };
const TYPE_UNIT: Record<ReadingType, string> = { diode: 'V (diode)', voltage: 'V', resistance: 'Ω', note: '' };

interface Props {
  photoId: number;
  active: boolean;
  onChanged: () => void;
  onFocus: (f: Focus) => void;
}

export default function PhotoEditor(p: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [pins, setPins] = useState<Reading[]>([]);
  const [jumpers, setJumpers] = useState<Jumper[]>([]);
  const [tool, setTool] = useState<Tool>('pin');
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [author, setAuthor] = useState('');
  const [lastType, setLastType] = useState<ReadingType>('diode');
  const hostRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const ph = await api.getPhoto(p.photoId);
    setPhoto(ph || null);
    setPins(await api.listReadings({ photo_id: p.photoId }));
    setJumpers(await api.listJumpers(p.photoId));
  }, [p.photoId]);

  useEffect(() => { load(); api.getSettings().then((s) => setAuthor(s.author)); }, [load]);

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !img) return;
    const s = Math.min(host.clientWidth / img.w, host.clientHeight / img.h) * 0.95;
    setView({ scale: s, x: (host.clientWidth - img.w * s) / 2, y: (host.clientHeight - img.h * s) / 2 });
  }, [img]);
  useEffect(() => { fit(); }, [fit]);

  // Report focus for the repair panel
  useEffect(() => {
    if (!p.active) return;
    if (sel?.kind === 'pin') {
      const r = pins.find((x) => x.id === sel.id);
      if (r) p.onFocus({ part: r.part || undefined, pin: r.pin || undefined, net: r.net || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, pins, p.active]);

  const toImage = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.scale / (img?.w || 1), y: (e.clientY - r.top - view.y) / view.scale / (img?.h || 1) };
  };

  const addPin = async (pt: { x: number; y: number }) => {
    if (!photo) return;
    const r = await api.saveReading({ model_id: photo.model_id, photo_id: photo.id, x: pt.x, y: pt.y, type: lastType, color: TYPE_COLORS[lastType], author });
    setPins((x) => [...x, r]);
    setSel({ kind: 'pin', id: r.id });
    p.onChanged();
  };

  const finishJumper = async () => {
    if (!photo || draft.length < 2) { setDraft([]); return; }
    const j = await api.saveJumper({ photo_id: photo.id, points: draft, author });
    setJumpers((x) => [...x, j]);
    setDraft([]);
    setSel({ kind: 'jumper', id: j.id });
    setTool('select');
  };

  // Pointer handling
  const drag = useRef<{ mode: 'pan' | 'pin'; id?: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pinId = target.closest('[data-pin]')?.getAttribute('data-pin');
    const jId = target.closest('[data-jumper]')?.getAttribute('data-jumper');
    if (e.button === 1 || (e.button === 0 && tool === 'select' && !pinId && !jId)) {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      return;
    }
    if (e.button !== 0) return;
    if (pinId && tool !== 'jumper') {
      setSel({ kind: 'pin', id: Number(pinId) });
      drag.current = { mode: 'pin', id: Number(pinId), sx: e.clientX, sy: e.clientY, vx: 0, vy: 0, moved: false };
      return;
    }
    if (jId && tool !== 'jumper') { setSel({ kind: 'jumper', id: Number(jId) }); return; }
    const pt = toImage(e);
    if (pt.x < 0 || pt.y < 0 || pt.x > 1 || pt.y > 1) return;
    if (tool === 'pin') addPin(pt);
    else if (tool === 'jumper') setDraft((d) => [...d, pt]);
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (tool === 'jumper') setCursorPt(toImage(e));
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else if (d.mode === 'pin' && d.moved) {
      const pt = toImage(e);
      setPins((ps) => ps.map((r) => (r.id === d.id ? { ...r, x: Math.min(Math.max(pt.x, 0), 1), y: Math.min(Math.max(pt.y, 0), 1) } : r)));
    }
  };
  const onUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'pin' && d.moved) {
      const r = pins.find((x) => x.id === d.id);
      if (r) await api.saveReading(r);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = hostRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.pow(1.0015, -e.deltaY);
    setView((v) => {
      const s = Math.min(Math.max(v.scale * f, 0.02), 40);
      return { scale: s, x: mx - ((mx - v.x) * s) / v.scale, y: my - ((my - v.y) * s) / v.scale };
    });
  };

  useEffect(() => {
    if (!p.active) return;
    const k = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === 'Escape') { setDraft([]); setSel(null); }
      if (typing) return;
      if (e.key === 'Enter' && tool === 'jumper') finishJumper();
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'p') setTool('pin');
      if (e.key.toLowerCase() === 'j') setTool('jumper');
      if (e.key.toLowerCase() === 'f') fit();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) remove();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const selPin = sel?.kind === 'pin' ? pins.find((x) => x.id === sel.id) : undefined;
  const selJumper = sel?.kind === 'jumper' ? jumpers.find((x) => x.id === sel.id) : undefined;

  const updatePin = (patch: Partial<Reading>) => {
    if (!selPin) return;
    const next = { ...selPin, ...patch };
    if (patch.type) { next.color = TYPE_COLORS[patch.type]; setLastType(patch.type); }
    setPins((ps) => ps.map((r) => (r.id === next.id ? next : r)));
  };
  const savePin = async () => { if (selPin) { await api.saveReading(selPin); p.onChanged(); } };
  const updateJumper = (patch: Partial<Jumper>) => {
    if (!selJumper) return;
    setJumpers((js) => js.map((j) => (j.id === selJumper.id ? { ...j, ...patch } : j)));
  };
  const saveJumper = async () => { if (selJumper) await api.saveJumper(selJumper); };
  const remove = async () => {
    if (sel?.kind === 'pin') { await api.deleteReading(sel.id); setPins((x) => x.filter((r) => r.id !== sel.id)); p.onChanged(); }
    if (sel?.kind === 'jumper') { await api.deleteJumper(sel.id); setJumpers((x) => x.filter((r) => r.id !== sel.id)); }
    setSel(null);
  };

  if (!photo) return <div className="grid h-full place-items-center text-slate-400">Loading photo…</div>;
  const W = img?.w || 1, H = img?.h || 1;
  const k = 1 / view.scale; // keep markers a constant screen size
  const ptStr = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x * W},${q.y * H}`).join(' ');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-bench-700 bg-bench-900 px-2 py-1.5">
        <span className="mr-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">Contributor mode</span>
        <div className="flex overflow-hidden rounded-md border border-bench-600">
          {([['select', 'cursor', 'Select / move (V)'], ['pin', 'pin', 'Drop reading pin (P)'], ['jumper', 'line', 'Draw jumper wire (J)']] as const).map(([t, icon, title]) => (
            <button key={t} title={title} className={`flex items-center gap-1 px-2.5 py-1 ${tool === t ? 'bg-amber-500/20 text-amber-200' : 'bg-bench-800 text-slate-300 hover:bg-bench-700'}`} onClick={() => { setTool(t); setDraft([]); }}>
              <Icon name={icon} size={13} /> {t === 'select' ? 'Select' : t === 'pin' ? 'Pin' : 'Jumper'}
            </button>
          ))}
        </div>
        {tool === 'pin' && (
          <select className="input w-32 py-0.5" value={lastType} onChange={(e) => setLastType(e.target.value as ReadingType)} title="Type for new pins">
            <option value="diode">Diode mode</option>
            <option value="voltage">Voltage</option>
            <option value="resistance">Resistance</option>
            <option value="note">Note</option>
          </select>
        )}
        {tool === 'jumper' && (
          <span className="text-[12px] text-slate-400">
            Click to add points · <button className="text-amber-300 underline" onClick={finishJumper} disabled={draft.length < 2}>Finish (Enter)</button> · Esc cancels
          </span>
        )}
        <div className="flex-1" />
        <input
          className="input w-56 py-0.5"
          value={photo.title}
          onChange={(e) => setPhoto({ ...photo, title: e.target.value })}
          onBlur={() => api.updatePhoto(photo.id, { title: photo.title }).then(p.onChanged)}
          title="Photo title"
        />
        <select className="input w-24 py-0.5" value={photo.side} onChange={(e) => { const side = e.target.value as Photo['side']; setPhoto({ ...photo, side }); api.updatePhoto(photo.id, { side }); }}>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="other">Other</option>
        </select>
        <button className="btn" title="Fit (F)" onClick={fit}><Icon name="fit" size={14} /></button>
      </div>
      <div
        ref={hostRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-bench-950 ${tool === 'select' ? 'cursor-grab' : 'cursor-crosshair'}`}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => { onUp(); setCursorPt(null); }}
        onWheel={onWheel}
        onDoubleClick={() => tool === 'jumper' && finishJumper()}
        data-testid="photo-host"
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <img
            src={fileUrl(photo.file_id)}
            draggable={false}
            className="block max-w-none select-none"
            onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            alt={photo.title}
          />
          {img && (
            <svg className="absolute left-0 top-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {jumpers.map((j) => (
                <g key={j.id} data-jumper={j.id} className="cursor-pointer">
                  <polyline points={ptStr(j.points)} fill="none" stroke="#000a" strokeWidth={7 * k} strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={ptStr(j.points)} fill="none" stroke={j.color} strokeWidth={(sel?.kind === 'jumper' && sel.id === j.id ? 5 : 3.5) * k} strokeLinecap="round" strokeLinejoin="round" />
                  {j.points.map((q, i) => <circle key={i} cx={q.x * W} cy={q.y * H} r={4 * k} fill={j.color} />)}
                  {j.label && (
                    <text x={j.points[0].x * W + 8 * k} y={j.points[0].y * H - 8 * k} fontSize={13 * k} fill="#fff" stroke="#000" strokeWidth={3 * k} paintOrder="stroke" fontWeight={600}>{j.label}</text>
                  )}
                </g>
              ))}
              {draft.length > 0 && (
                <polyline points={ptStr(cursorPt ? [...draft, cursorPt] : draft)} fill="none" stroke="#ef4444" strokeDasharray={`${6 * k} ${4 * k}`} strokeWidth={3 * k} />
              )}
              {pins.map((r) => {
                if (r.x == null || r.y == null) return null;
                const isSel = sel?.kind === 'pin' && sel.id === r.id;
                const label = [r.part && `${r.part}${r.pin ? '.' + r.pin : ''}`, r.value].filter(Boolean).join('  ');
                return (
                  <g key={r.id} data-pin={r.id} className="cursor-pointer" transform={`translate(${r.x * W} ${r.y * H})`}>
                    <circle r={(isSel ? 9 : 7) * k} fill={r.color} stroke={isSel ? '#fff' : '#000'} strokeWidth={2 * k} />
                    <circle r={2 * k} fill="#000" />
                    {label && (
                      <text x={11 * k} y={4 * k} fontSize={13 * k} fill="#fff" stroke="#000" strokeWidth={3 * k} paintOrder="stroke" fontWeight={600} fontFamily="Consolas, monospace">{label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        {(selPin || selJumper) && (
          <div className="absolute right-2 top-2 z-10 w-72 rounded-lg border border-bench-600 bg-bench-900/95 p-3 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} data-testid="pin-editor">
            {selPin && (
              <div className="space-y-2">
                <div className="flex items-center">
                  <span className="flex-1 font-semibold text-slate-100">Reading pin</span>
                  <button className="btn-ghost text-red-300" onClick={remove} title="Delete (Del)"><Icon name="trash" size={13} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="label">Type</label>
                    <select className="input" value={selPin.type} onChange={(e) => updatePin({ type: e.target.value as ReadingType })} onBlur={savePin}>
                      <option value="diode">Diode mode</option>
                      <option value="voltage">Voltage</option>
                      <option value="resistance">Resistance</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Part</label>
                    <input className="input font-mono" placeholder="U2 / J1 / C120" value={selPin.part} onChange={(e) => updatePin({ part: e.target.value })} onBlur={savePin} autoFocus />
                  </div>
                  <div>
                    <label className="label">Pin</label>
                    <input className="input font-mono" placeholder="1 / A3" value={selPin.pin} onChange={(e) => updatePin({ pin: e.target.value })} onBlur={savePin} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Net / line</label>
                    <input className="input font-mono" placeholder="VBUS, VBAT, VCC_MAIN…" value={selPin.net} onChange={(e) => updatePin({ net: e.target.value })} onBlur={savePin} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Value {TYPE_UNIT[selPin.type] && <span className="normal-case text-slate-500">({TYPE_UNIT[selPin.type]})</span>}</label>
                    <input className="input font-mono" placeholder={selPin.type === 'diode' ? '0.452' : selPin.type === 'voltage' ? '3.8' : selPin.type === 'resistance' ? '10k' : ''} value={selPin.value} onChange={(e) => updatePin({ value: e.target.value })} onBlur={savePin} onKeyDown={(e) => e.key === 'Enter' && savePin()} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Note</label>
                    <textarea className="input h-14" placeholder="Red probe on GND, black on pin…" value={selPin.note} onChange={(e) => updatePin({ note: e.target.value })} onBlur={savePin} />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">{selPin.author ? `Added by ${selPin.author}` : 'Tip: set your name in Settings'} · drag the pin to move it</div>
              </div>
            )}
            {selJumper && (
              <div className="space-y-2">
                <div className="flex items-center">
                  <span className="flex-1 font-semibold text-slate-100">Jumper wire</span>
                  <button className="btn-ghost text-red-300" onClick={remove} title="Delete (Del)"><Icon name="trash" size={13} /></button>
                </div>
                <div>
                  <label className="label">Label</label>
                  <input className="input" placeholder="e.g. VBUS jumper from F1 to U2 pin 1" value={selJumper.label} onChange={(e) => updateJumper({ label: e.target.value })} onBlur={saveJumper} autoFocus />
                </div>
                <div>
                  <label className="label">Colour</label>
                  <div className="flex gap-1.5">
                    {['#ef4444', '#f5a524', '#22c55e', '#38bdf8', '#e879f9', '#ffffff'].map((c) => (
                      <button key={c} className={`h-6 w-6 rounded-full border-2 ${selJumper.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} onClick={() => { updateJumper({ color: c }); api.saveJumper({ ...selJumper, color: c }); }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Note</label>
                  <textarea className="input h-16" placeholder="Wire gauge, when to use this jumper…" value={selJumper.note} onChange={(e) => updateJumper({ note: e.target.value })} onBlur={saveJumper} />
                </div>
              </div>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-500">
          {pins.length} readings · {jumpers.length} jumpers · wheel to zoom · {tool === 'select' ? 'drag to pan' : 'middle-drag to pan'}
        </div>
      </div>
    </div>
  );
}
