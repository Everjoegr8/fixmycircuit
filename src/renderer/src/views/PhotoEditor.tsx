// Shop Contributor Mode: drop reading pins, draw jumper wires and trace real
// copper on a board photo. Traced copper on an aligned photo shows on the boardview.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Jumper, Photo, Reading, ReadingType } from '@shared/types';
import { api, fileUrl } from '../api';
import { Icon } from '../components/Icon';
import type { Focus } from '../types';
import { loadBoard } from '@parsers/index.js';
import { LAYERS, LAYER_BY_ID, layerOfNet, layerOfText, type LayerId } from '@shared/layers';
import LayerToggles, { useLayers } from '../components/LayerToggles';
import HoverCard, { type HoverData } from '../components/HoverCard';
import { netSegments, netsByLayer } from '../lib/netlines';
import { parseAlign, syncBus } from '../lib/sync';

type Tool = 'select' | 'pin' | 'jumper' | 'trace';
const SHOP_TRACE = '#22c55e';
type Sel = { kind: 'pin'; id: number } | { kind: 'jumper'; id: number } | null;

const TYPE_COLORS: Record<ReadingType, string> = { diode: '#f5a524', voltage: '#22c55e', resistance: '#38bdf8', note: '#e879f9' };
const TYPE_UNIT: Record<ReadingType, string> = { diode: 'V (diode)', voltage: 'V', resistance: 'Ω', note: '' };

interface Props {
  photoId: number;
  active: boolean;
  onChanged: () => void;
  onFocus: (f: Focus) => void;
  /** Part or net selected elsewhere (board, schematic, jump bar): matching pins glow. */
  focus?: Focus;
  syncKey?: string;
  sync?: boolean;
}

const jumperLayer = (j: Jumper): LayerId | null => (j.layer as LayerId) || layerOfText(`${j.label} ${j.note}`);

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
  const [layers] = useLayers();
  const [board, setBoard] = useState<any>(null);
  const [showNetLines, setShowNetLines] = useState(() => { try { return localStorage.getItem('fmc.photoNetLines') === '1'; } catch { return false; } });
  const [hover, setHover] = useState<HoverData | null>(null);
  const [alignMsg, setAlignMsg] = useState('');
  const align = parseAlign(photo?.align);

  // Aligned photos (the demo ones, for now) can show the boardview's net lines on top.
  useEffect(() => {
    if (!photo || photo.model_id == null) { setBoard(null); return; }
    let dead = false;
    (async () => {
      const files = await api.listFiles(photo.model_id, 'boardview');
      if (!files.length) return;
      const [{ file, bytes }, st] = await Promise.all([api.readFile(files[0].id), api.getSettings()]);
      try {
        const b = loadBoard(new Uint8Array(bytes), file.name, { fzKey: st.fzKey, caeKey: st.caeKey, xzzKey: st.xzzKey });
        if (!dead) setBoard(b);
      } catch { /* photo still works without it */ }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id, photo?.model_id]);

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
    const j = await api.saveJumper(tool === 'trace' ? { photo_id: photo.id, points: draft, author, kind: 'trace', color: SHOP_TRACE } : { photo_id: photo.id, points: draft, author });
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
    if (pinId && tool !== 'jumper' && tool !== 'trace') {
      setSel({ kind: 'pin', id: Number(pinId) });
      drag.current = { mode: 'pin', id: Number(pinId), sx: e.clientX, sy: e.clientY, vx: 0, vy: 0, moved: false };
      return;
    }
    if (jId && tool !== 'jumper' && tool !== 'trace') { setSel({ kind: 'jumper', id: Number(jId) }); return; }
    const pt = toImage(e);
    if (pt.x < 0 || pt.y < 0 || pt.x > 1 || pt.y > 1) return;
    if (tool === 'pin') addPin(pt);
    else if (tool === 'jumper' || tool === 'trace') setDraft((d) => [...d, pt]);
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (tool === 'jumper' || tool === 'trace') setCursorPt(toImage(e));
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    if (d.mode === 'pan') {
      const next = { ...view, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy };
      setView(next);
      emitView(next);
    }
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
    const v = view;
    const sc = Math.min(Math.max(v.scale * f, 0.02), 40);
    const next = { scale: sc, x: mx - ((mx - v.x) * sc) / v.scale, y: my - ((my - v.y) * sc) / v.scale };
    setView(next);
    emitView(next);
    if (p.sync && p.syncKey) syncBus.emit({ type: 'zoom', source: p.syncKey, factor: f });
  };

  // --- split-screen sync (aligned photos share board coordinates) ---------------
  const emitView = (v: { scale: number; x: number; y: number }) => {
    const host = hostRef.current;
    if (!p.sync || !p.syncKey || !align || !img || !host) return;
    const px = (host.clientWidth / 2 - v.x) / v.scale, py = (host.clientHeight / 2 - v.y) / v.scale;
    syncBus.emit({
      type: 'view',
      source: p.syncKey,
      cx: align.x0 + (px / img.w) * (align.x1 - align.x0),
      cy: align.y1 - (py / img.h) * (align.y1 - align.y0),
      upp: (align.x1 - align.x0) / img.w / v.scale,
    });
  };
  useEffect(() => {
    if (!p.sync || !img) return;
    return syncBus.on((e) => {
      const host = hostRef.current;
      if (e.source === p.syncKey || !host) return;
      if (e.type === 'zoom' && e.pdf) {
        const mx = host.clientWidth / 2, my = host.clientHeight / 2;
        setView((v) => { const sc = Math.min(Math.max(v.scale * e.factor, 0.02), 40); return { scale: sc, x: mx - ((mx - v.x) * sc) / v.scale, y: my - ((my - v.y) * sc) / v.scale }; });
        return;
      }
      if (!align) return;
      if (e.type === 'view') {
        const sc = (align.x1 - align.x0) / img.w / e.upp;
        const px = ((e.cx - align.x0) / (align.x1 - align.x0)) * img.w;
        const py = ((align.y1 - e.cy) / (align.y1 - align.y0)) * img.h;
        setView({ scale: sc, x: host.clientWidth / 2 - px * sc, y: host.clientHeight / 2 - py * sc });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sync, p.syncKey, photo?.align, img]);

  useEffect(() => {
    if (!p.active) return;
    const k = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === 'Escape') { setDraft([]); setSel(null); }
      if (typing) return;
      if (e.key === 'Enter' && (tool === 'jumper' || tool === 'trace')) finishJumper();
      if (e.key.toLowerCase() === 't') setTool('trace');
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'p') setTool('pin');
      if (e.key.toLowerCase() === 'j') setTool('jumper');
      if (e.key.toLowerCase() === 'f') fit();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) remove();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const netLines = useMemo(() => {
    if (!board || !align || !img || !showNetLines) return [] as [LayerId, string][];
    const tx = (x: number) => (((x - align.x0) / (align.x1 - align.x0)) * img.w).toFixed(1);
    const ty = (y: number) => (((align.y1 - y) / (align.y1 - align.y0)) * img.h).toFixed(1);
    const out: [LayerId, string][] = [];
    for (const [layer, nets] of netsByLayer(board)) {
      if (layer === 'gnd' || !layers.has(layer)) continue;
      let d = '';
      for (const net of nets) for (const sg of netSegments(board, net, photo?.side === 'bottom' ? 'bottom' : 'top')) d += `M${tx(sg.x1)} ${ty(sg.y1)}L${tx(sg.x2)} ${ty(sg.y2)}`;
      if (d) out.push([layer, d]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, photo?.align, img, layers, showNetLines, photo?.side]);
  const layerCounts = useMemo(() => {
    const c: Partial<Record<LayerId, number>> = {};
    for (const l of LAYERS) c[l.id] = 0;
    for (const j of jumpers) { const l = jumperLayer(j); if (l) c[l] = (c[l] || 0) + 1; }
    return c;
  }, [jumpers]);
  void layerOfNet;

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

  const up = (x?: string) => (x || '').toUpperCase();
  const focused = (r: Reading) => !!p.focus && ((!!p.focus.net && up(r.net) === up(p.focus.net)) || (!!p.focus.part && up(r.part) === up(p.focus.part)));
  const showHover = (e: React.MouseEvent, r: Reading) => {
    const host = hostRef.current!.getBoundingClientRect();
    const same = r.net ? pins.filter((x) => up(x.net) === up(r.net)) : [r];
    const ics: string[] = [];
    if (board && r.net && board.nets.has(r.net)) {
      for (const i of board.nets.get(r.net)) {
        const q = board.parts[board.pins[i].part];
        if (q && (/^U/i.test(q.name) || q.pins.length >= 8) && !ics.includes(q.name)) ics.push(q.name);
      }
    } else if (/^U/i.test(r.part)) ics.push(r.part);
    setHover({ x: e.clientX - host.left, y: e.clientY - host.top, pin: `${r.part}${r.pin ? '.' + r.pin : ''}`, net: r.net, part: r.part, readings: same.length ? same : [r], ics });
  };

  if (!photo) return <div className="grid h-full place-items-center text-slate-400">Loading photo…</div>;
  /** Two reading pins with part + pin that exist on the board give the photo's position on it. */
  const alignToBoard = async () => {
    if (!board || !photo) return;
    const at = (r: Reading) => {
      const part = board.parts.find((x: any) => x.name.toUpperCase() === (r.part || '').trim().toUpperCase());
      const pin = part && part.pins.map((i: number) => board.pins[i]).find((q: any) => String(q.snum || q.name).toUpperCase() === (r.pin || '').trim().toUpperCase());
      return pin && r.x != null && r.y != null ? { px: r.x, py: r.y, bx: pin.x, by: pin.y } : null;
    };
    const pts = pins.map(at).filter(Boolean) as { px: number; py: number; bx: number; by: number }[];
    // Use the two pins furthest apart.
    let best: [typeof pts[0], typeof pts[0]] | null = null, bd = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.abs(pts[i].px - pts[j].px) * Math.abs(pts[i].py - pts[j].py);
      if (d > bd) { bd = d; best = [pts[i], pts[j]]; }
    }
    if (!best || bd < 0.01) { setAlignMsg('Drop two reading pins far apart (different rows and columns), fill in their Part and Pin as named in the boardview, then press Align again.'); return; }
    const [a, b] = best;
    const sx = (a.bx - b.bx) / (a.px - b.px), sy = -(a.by - b.by) / (a.py - b.py);
    const x0 = a.bx - a.px * sx, y1 = a.by + a.py * sy;
    const al = { x0, x1: x0 + sx, y0: y1 - sy, y1 };
    const ph = await api.updatePhoto(photo.id, { align: JSON.stringify(al) });
    setPhoto(ph);
    setAlignMsg('Photo aligned. Traced copper on it now shows on the boardview.');
    p.onChanged();
  };

  const W = img?.w || 1, H = img?.h || 1;
  const k = 1 / view.scale; // keep markers a constant screen size
  const ptStr = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x * W},${q.y * H}`).join(' ');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-bench-700 bg-bench-900 px-2 py-1.5">
        <span className="mr-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">Contributor mode</span>
        <div className="flex overflow-hidden rounded-md border border-bench-600">
          {([['select', 'cursor', 'Select / move (V)'], ['pin', 'pin', 'Drop reading pin (P)'], ['jumper', 'line', 'Draw jumper wire (J)'], ['trace', 'path', 'Trace real copper you can see on the photo (T)']] as const).map(([t, icon, title]) => (
            <button key={t} title={title} className={`flex items-center gap-1 px-2.5 py-1 ${tool === t ? 'bg-amber-500/20 text-amber-200' : 'bg-bench-800 text-slate-300 hover:bg-bench-700'}`} onClick={() => { setTool(t); setDraft([]); }} data-tool={t}>
              <Icon name={icon} size={13} /> {t === 'select' ? 'Select' : t === 'pin' ? 'Pin' : t === 'jumper' ? 'Jumper' : 'Trace'}
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
        {(tool === 'jumper' || tool === 'trace') && (
          <span className="text-[12px] text-slate-400">
            {tool === 'trace' ? 'Follow the copper: click along it · ' : ''}Click to add points · <button className="text-amber-300 underline" onClick={finishJumper} disabled={draft.length < 2}>Finish (Enter)</button> · Esc cancels
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
        {board && (
          <button className={`btn ${align ? '' : 'border-amber-500/60 text-amber-200'}`} onClick={alignToBoard} title="Line this photo up with the boardview using two reading pins that have a part and pin filled in" data-testid="align-btn">
            <Icon name="target" size={13} /> {align ? 'Re-align' : 'Align to boardview'}
          </button>
        )}
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
        onDoubleClick={() => (tool === 'jumper' || tool === 'trace') && finishJumper()}
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
              {netLines.map(([layer, d]) => (
                <path key={layer} d={d} fill="none" stroke={LAYER_BY_ID[layer].color} strokeWidth={1.6 * k} opacity={0.7} className="pointer-events-none" data-netlines={layer} />
              ))}
              {jumpers.filter((j) => j.kind === 'trace').map((j) => (
                <g key={j.id} data-jumper={j.id} data-trace="1" className="cursor-pointer">
                  <polyline points={ptStr(j.points)} fill="none" stroke="#052e16cc" strokeWidth={6 * k} strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={ptStr(j.points)} fill="none" stroke={SHOP_TRACE} strokeWidth={(sel?.kind === 'jumper' && sel.id === j.id ? 4 : 2.6) * k} strokeLinecap="round" strokeLinejoin="round" />
                  {(j.net || j.label) && (
                    <text x={j.points[0].x * W + 8 * k} y={j.points[0].y * H - 8 * k} fontSize={12 * k} fill="#bbf7d0" stroke="#000" strokeWidth={3 * k} paintOrder="stroke" fontWeight={600} fontFamily="Consolas, monospace">✓ {j.net || j.label}</text>
                  )}
                </g>
              ))}
              {jumpers.filter((j) => j.kind !== 'trace' && (() => { const l = jumperLayer(j); return !l || layers.has(l); })()).map((j) => (
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
 <polyline points={ptStr(cursorPt ? [...draft, cursorPt] : draft)} fill="none" stroke={tool === 'trace' ? SHOP_TRACE : '#ef4444'} strokeDasharray={`${6 * k} ${4 * k}`} strokeWidth={3 * k} />
              )}
              {pins.map((r) => {
                if (r.x == null || r.y == null) return null;
                const isSel = sel?.kind === 'pin' && sel.id === r.id;
                const label = [r.part && `${r.part}${r.pin ? '.' + r.pin : ''}`, r.value].filter(Boolean).join('  ');
                return (
                  <g key={r.id} data-pin={r.id} className="cursor-pointer" transform={`translate(${r.x * W} ${r.y * H})`}
                    onMouseEnter={(e) => showHover(e, r)} onMouseLeave={() => setHover(null)}>
                    {focused(r) && <circle r={15 * k} fill="none" stroke="#fff" strokeWidth={2.5 * k} className="animate-pulse" data-focused="1" />}
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
        {hover && <HoverCard d={hover} />}
        <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-2">
        <LayerToggles
          title="Jumper / trace layers"
          counts={layerCounts}
          extra={board && align && (
            <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-bench-700 px-1 pt-1.5 text-[11px] text-slate-400">
              <input type="checkbox" checked={showNetLines} onChange={(e) => { setShowNetLines(e.target.checked); try { localStorage.setItem('fmc.photoNetLines', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} data-testid="netlines-toggle" />
              Overlay boardview net lines
            </label>
          )}
        />
        {(selPin || selJumper) && (
          <div className="w-72 rounded-lg border border-bench-600 bg-bench-900/95 p-3 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} data-testid="pin-editor">
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
                  <span className="flex-1 font-semibold text-slate-100">{selJumper.kind === 'trace' ? 'Copper trace (verified by shop)' : 'Jumper wire'}</span>
                  <button className="btn-ghost text-red-300" onClick={remove} title="Delete (Del)"><Icon name="trash" size={13} /></button>
                </div>
                {selJumper.kind === 'trace' && (
                  <div>
                    <label className="label">Net this copper carries</label>
                    <input className="input font-mono" list="fmc-photo-nets" placeholder="VBUS, PP_VDD_MAIN…" value={selJumper.net || ''} onChange={(e) => updateJumper({ net: e.target.value.trim() })} onBlur={saveJumper} autoFocus data-testid="trace-net" />
                    {board && <datalist id="fmc-photo-nets">{[...board.nets.keys()].slice(0, 4000).map((n: string) => <option key={n} value={n} />)}</datalist>}
                    <p className="mt-1 text-[11px] text-slate-500">{align ? 'This trace shows on the boardview in green as real copper.' : 'Align this photo to the boardview to show this trace there.'}</p>
                  </div>
                )}
                <div>
                  <label className="label">Label</label>
                  <input className="input" placeholder={selJumper.kind === 'trace' ? 'e.g. from F1 to U2 under the shield' : 'e.g. VBUS jumper from F1 to U2 pin 1'} value={selJumper.label} onChange={(e) => updateJumper({ label: e.target.value })} onBlur={saveJumper} autoFocus={selJumper.kind !== 'trace'} />
                </div>
                <div>
                  <label className="label">Layer</label>
                  <select className="input" value={selJumper.layer || ''} onChange={(e) => { const layer = e.target.value; const color = layer ? LAYER_BY_ID[layer as LayerId].color : selJumper.color; updateJumper({ layer, color }); api.saveJumper({ ...selJumper, layer, color }); }}>
                    <option value="">Guess from label</option>
                    {LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
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
        </div>
        {alignMsg && <div className="absolute bottom-8 left-3 z-10 max-w-md rounded bg-bench-900/95 px-2 py-1 text-[12px] text-slate-200 shadow" data-testid="align-msg">{alignMsg}</div>}
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-500">
          {pins.length} readings · {jumpers.filter((j) => j.kind !== 'trace').length} jumpers · {jumpers.filter((j) => j.kind === 'trace').length} traced copper · wheel to zoom · {tool === 'select' ? 'drag to pan' : 'middle-drag to pan'}
        </div>
      </div>
    </div>
  );
}
