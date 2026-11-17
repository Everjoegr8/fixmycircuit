import { useEffect, useMemo, useRef, useState } from 'react';
import { loadBoard, searchBoard, extOf } from '@parsers/index.js';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { BoardCanvas, type Side } from './board/BoardCanvas';
import type { Focus } from '../types';
import type { Reading } from '@shared/types';
import LayerToggles, { useLayers } from '../components/LayerToggles';
import HoverCard, { type HoverData } from '../components/HoverCard';
import { netsByLayer } from '../lib/netlines';
import { syncBus } from '../lib/sync';
import { indexBoard, railFamily, TYPE_LABEL } from '@shared/netindex';
import NetlistPanel from './board/NetlistPanel';
import { indexModelSchematics, schematicPages, type SchIndex } from '../lib/schindex';
import { registerBoard, touchBoard, unregisterBoard } from '../lib/boards';

interface Props {
  fileId: string;
  active: boolean;
  searchRequest?: { q: string; n: number };
  onFocus: (f: Focus) => void;
  onFindInSchematic: (q: string) => void;
  onOpenSettings: () => void;
  modelId?: number | null;
  rev?: number;
  /** Split-screen sync: this pane's id and whether sync is on. */
  syncKey?: string;
  sync?: boolean;
}

export default function BoardViewer(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<BoardCanvas | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [board, setBoard] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<Side>('top');
  const [sel, setSel] = useState<{ part: number | null; pin: number | null; net: string | null }>({ part: null, pin: null, net: null });
  const [q, setQ] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverData | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [layers] = useLayers();
  const [hiddenNetPins, setHiddenNetPins] = useState(0);
  const [loadNonce, setLoadNonce] = useState(0);
  const [netlist, setNetlist] = useState(false);
  const [pathNets, setPathNets] = useState<string[]>([]);
  const [sch, setSch] = useState<SchIndex[]>([]);
  const idx = useMemo(() => (board ? indexBoard(board) : null), [board]);
  const fileName = useRef('');

  // Load + parse
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [{ file, bytes, extras }, settings] = await Promise.all([api.readFile(p.fileId), api.getSettings()]);
        // Let the spinner paint before a potentially long parse.
        await new Promise((r) => setTimeout(r, 30));
        const b = loadBoard(new Uint8Array(bytes), file.name, {
          fzKey: settings.fzKey,
          xzzKey: settings.xzzKey,
          ascFiles: extOf(file.name) === 'asc' ? { ...extras, [file.name.toLowerCase()]: new Uint8Array(bytes) } : undefined,
        });
        fileName.current = file.name;
        if (!cancelled) setBoard(b);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [p.fileId, loadNonce]);

  // Register for the AI assistant, and index the model's schematics for cross-links.
  useEffect(() => {
    if (!board) return;
    registerBoard({ fileId: p.fileId, name: fileName.current, modelId: p.modelId ?? null, board });
    return () => unregisterBoard(p.fileId);
  }, [board, p.fileId, p.modelId]);
  useEffect(() => { if (p.active) touchBoard(p.fileId); }, [p.active, p.fileId]);
  useEffect(() => {
    if (!board) return;
    let off = false;
    indexModelSchematics(p.modelId).then((x) => !off && setSch(x));
    return () => { off = true; };
  }, [board, p.modelId, p.rev]);
  useEffect(() => { viewRef.current?.setHighlight(pathNets); }, [pathNets, board]);

  useEffect(() => {
    if (p.modelId == null) { setReadings([]); return; }
    api.listReadings({ model_id: p.modelId }).then(setReadings);
  }, [p.modelId, p.rev]);

  const layerCounts = useMemo(() => {
    if (!board) return {};
    const out: Record<string, number> = {};
    for (const [l, nets] of netsByLayer(board)) out[l] = nets.length;
    return out;
  }, [board]);

  useEffect(() => { viewRef.current?.setLayers(layers); }, [layers, board]);

  // Split-screen sync
  const emitView = () => {
    const v = viewRef.current;
    if (!v || !p.sync || !p.syncKey) return;
    syncBus.emit({ type: 'view', source: p.syncKey, ...v.viewState() });
  };
  const emitZoom = (factor: number) => {
    if (p.sync && p.syncKey) syncBus.emit({ type: 'zoom', source: p.syncKey, factor });
  };
  useEffect(() => {
    if (!p.sync) return;
    return syncBus.on((e) => {
      const v = viewRef.current;
      if (!v || e.source === p.syncKey) return;
      if (e.type === 'view' && v.side !== 'bottom' && v.rotation === 0) v.setViewState(e.cx, e.cy, e.upp);
      if (e.type === 'zoom' && e.pdf) v.zoomAt(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2, e.factor);
    });
  }, [p.sync, p.syncKey]);

  // Create renderer
  useEffect(() => {
    if (!board || !canvasRef.current) return;
    const v = new BoardCanvas(canvasRef.current, board);
    viewRef.current = v;
    v.setLayers(layers);
    setSide(v.side);
    v.resize();
    v.fit();
    const ro = new ResizeObserver(() => v.resize());
    ro.observe(canvasRef.current);
    return () => { ro.disconnect(); v.destroy(); viewRef.current = null; };
  }, [board]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.setSelection(sel);
    requestAnimationFrame(() => setHiddenNetPins(v.lastHiddenNetPins));
  }, [sel, side]);

  // Report focus to the repair panel
  useEffect(() => {
    if (!board || !p.active) return;
    const part = sel.part != null ? board.parts[sel.part] : null;
    const pin = sel.pin != null ? board.pins[sel.pin] : null;
    p.onFocus({ part: part && !part.testpoint ? part.name : undefined, pin: pin ? pin.snum || pin.name : undefined, net: sel.net || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, board, p.active]);

  const results = useMemo(() => (board && q.trim() ? searchBoard(board, q, 60) : []), [board, q]);

  const selectPart = (index: number, zoom = true) => {
    const part = board.parts[index];
    setSel({ part: index, pin: null, net: null });
    const v = viewRef.current!;
    if (part.side !== 'both' && v.side !== 'both' && part.side !== v.side) { v.side = part.side; setSide(part.side); }
    if (zoom) v.zoomTo(part.pins.map((i: number) => board.pins[i]), 8);
  };
  const selectNet = (net: string, zoom = true) => {
    setSel({ part: null, pin: null, net });
    const v = viewRef.current!;
    if (zoom) {
      const pins = (board.nets.get(net) || []).map((i: number) => board.pins[i]).filter((pin: any) => v.visible(pin.side));
      if (pins.length) v.zoomTo(pins, 2);
    }
  };
  const choose = (r: any) => {
    if (r.kind === 'part') selectPart(r.index);
    else selectNet(r.name);
    setShowResults(false);
    setQ(r.name);
  };

  // External search (from schematic or repair panel)
  useEffect(() => {
    if (!p.searchRequest || !board) return;
    const query = p.searchRequest.q.trim();
    setQ(query);
    const r = searchBoard(board, query, 5);
    if (r.length && r[0].name.toUpperCase() === query.toUpperCase()) choose(r[0]);
    else { setShowResults(true); searchRef.current?.focus(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.searchRequest?.n, board]);

  // Keyboard shortcuts (only for the active tab)
  useEffect(() => {
    if (!p.active) return;
    const onKey = (e: KeyboardEvent) => {
      const v = viewRef.current;
      if (!v) return;
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (typing) return;
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key.toLowerCase() === 'r') rotate();
      else if (e.key.toLowerCase() === 'f') v.fit();
      else if (e.key === '+' || e.key === '=') v.zoomAt(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2, 1.3);
      else if (e.key === '-') v.zoomAt(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2, 1 / 1.3);
      else if (e.key === 'Escape') setSel({ part: null, pin: null, net: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const flip = () => {
    const v = viewRef.current;
    if (!v) return;
    const next: Side = v.side === 'top' ? 'bottom' : 'top';
    setSideMode(next);
  };
  const setSideMode = (s: Side) => {
    const v = viewRef.current;
    if (!v) return;
    v.side = s;
    setSide(s);
    v.fit();
  };
  const rotate = () => {
    const v = viewRef.current;
    if (!v) return;
    v.rotation = (v.rotation + 90) % 360;
    v.fit();
  };

  // Mouse
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const rect = v.canvas.getBoundingClientRect();
    if (drag.current && e.buttons) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      if (drag.current.moved) { v.pan(dx, dy); drag.current.x = e.clientX; drag.current.y = e.clientY; emitView(); }
      return;
    }
    const pin = v.pinAt(e.clientX - rect.left, e.clientY - rect.top);
    if (pin !== v.hover) { v.hover = pin; v.invalidate(); }
    if (pin != null) {
      const pp = board.pins[pin];
      const part = board.parts[pp.part];
      const up = (x: string) => (x || '').toUpperCase();
      const onNet = pp.net ? readings.filter((r) => up(r.net) === up(pp.net)) : [];
      // ICs on the same net: parts named U… or with many pins, other than this one.
      const ics: string[] = [];
      if (pp.net && board.nets.has(pp.net) && board.nets.get(pp.net).length < 2000) {
        for (const i of board.nets.get(pp.net)) {
          const q = board.parts[board.pins[i].part];
          if (q && !q.testpoint && (/^U/i.test(q.name) || q.pins.length >= 8) && !ics.includes(q.name)) ics.push(q.name);
        }
      }
      setHoverInfo(null);
      setHoverCard({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pin: `${part?.testpoint ? 'Test point' : part?.name ?? ''}${pp.snum ? '.' + pp.snum : ''}`,
        net: pp.net,
        part: part?.name,
        readings: onNet,
        ics: ics.sort((a, b) => (a === part?.name ? -1 : b === part?.name ? 1 : 0)),
      });
    } else {
      setHoverCard(null);
      const part = v.partAt(e.clientX - rect.left, e.clientY - rect.top);
      setHoverInfo(part != null ? { x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${board.parts[part].name}${board.parts[part].mfgcode ? ' · ' + board.parts[part].mfgcode : ''}` } : null);
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    drag.current = null;
    if (!v || !d || d.moved) return;
    const rect = v.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const pin = v.pinAt(sx, sy);
    if (pin != null) {
      const pp = board.pins[pin];
      const hasNet = pp.net && board.nets.has(pp.net);
      setSel({ part: board.parts[pp.part]?.testpoint ? null : pp.part, pin, net: hasNet ? pp.net : null });
      return;
    }
    const part = v.partAt(sx, sy);
    setSel(part != null ? { part, pin: null, net: null } : { part: null, pin: null, net: null });
  };
  const onWheel = (e: React.WheelEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const rect = v.canvas.getBoundingClientRect();
    const f = Math.pow(1.0015, -e.deltaY);
    v.zoomAt(e.clientX - rect.left, e.clientY - rect.top, f);
    emitView();
    emitZoom(f);
  };

  const part = board && sel.part != null ? board.parts[sel.part] : null;
  const netPins: any[] = board && sel.net ? (board.nets.get(sel.net) || []).map((i: number) => board.pins[i]) : [];
  const netPartNames = [...new Set(netPins.map((pin) => board.parts[pin.part]).filter((x) => x && !x.testpoint).map((x) => x.name))];

  if (error) {
    const needsKey = /key/i.test(error);
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="card max-w-lg p-5 text-center">
          <div className="mb-2 text-base font-semibold text-red-300">Could not open this boardview</div>
          <div className="mb-4 text-slate-300">{error}</div>
          <div className="flex justify-center gap-2">
            {needsKey && <button className="btn-primary" onClick={p.onOpenSettings}><Icon name="key" size={13} /> Open Settings</button>}
            <button className="btn" onClick={() => setLoadNonce((n) => n + 1)}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-bench-700 bg-bench-900 px-2 py-1.5">
        <div className="relative w-72">
          <input
            ref={searchRef}
            className="input pl-7"
            placeholder="Find part or net (Ctrl+F)"
            value={q}
            onChange={(e) => { setQ(e.target.value); setShowResults(true); setCursor(0); }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === 'Enter' && results[cursor]) choose(results[cursor]);
              if (e.key === 'Escape') { setShowResults(false); (e.target as HTMLInputElement).blur(); }
            }}
          />
          <span className="pointer-events-none absolute left-2 top-[7px] text-slate-500"><Icon name="search" size={13} /></span>
          {showResults && results.length > 0 && (
            <div className="absolute left-0 right-0 top-8 z-20 max-h-80 overflow-auto rounded-md border border-bench-600 bg-bench-850 p-1 shadow-2xl">
              {results.map((r: any, i: number) => (
                <button key={r.kind + r.name} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${i === cursor ? 'bg-bench-700' : 'hover:bg-bench-700'}`} onMouseDown={() => choose(r)}>
                  <span className={`chip ${r.kind === 'net' ? 'text-amber-300' : 'text-cyan-300'}`}>{r.kind === 'net' ? 'NET' : 'PART'}</span>
                  <span className="flex-1 truncate font-mono">{r.name}</span>
                  <span className="text-[11px] text-slate-500">{r.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex overflow-hidden rounded-md border border-bench-600">
          {(['top', 'bottom', 'both'] as Side[]).map((s) => (
            <button key={s} className={`px-2.5 py-1 capitalize ${side === s ? 'bg-amber-500/20 text-amber-200' : 'bg-bench-800 text-slate-300 hover:bg-bench-700'}`} onClick={() => setSideMode(s)}>{s}</button>
          ))}
        </div>
        <button className="btn" title="Flip side (Space)" onClick={flip}><Icon name="flip" size={14} /></button>
        <button className="btn" title="Rotate 90° (R)" onClick={rotate}><Icon name="rotate" size={14} /></button>
        <button className="btn" title="Fit board (F)" onClick={() => viewRef.current?.fit()}><Icon name="fit" size={14} /></button>
        <button className="btn" title="Zoom in (+)" onClick={() => { const v = viewRef.current; v && v.zoomAt(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2, 1.3); }}><Icon name="zoomIn" size={14} /></button>
        <button className="btn" title="Zoom out (-)" onClick={() => { const v = viewRef.current; v && v.zoomAt(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2, 1 / 1.3); }}><Icon name="zoomOut" size={14} /></button>
        <button className={`btn ${netlist ? 'btn-on' : ''}`} title="Every net and part, board health and path tracer" onClick={() => setNetlist((x) => !x)} data-testid="netlist-btn"><Icon name="net" size={14} /> Netlist</button>
        <div className="flex-1" />
        {board && <span className="text-[11px] text-slate-500">{board.format} · {board.stats.parts} parts · {board.stats.pins} pins · {board.stats.nets} nets</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHoverInfo(null); setHoverCard(null); if (viewRef.current) { viewRef.current.hover = null; viewRef.current.invalidate(); } }}
          onWheel={onWheel}
          data-testid="board-canvas"
        />
        {loading && <div className="absolute inset-0 grid place-items-center text-slate-400">Opening board…</div>}
        {hoverInfo && (
          <div className="pointer-events-none absolute z-10 rounded bg-black/80 px-2 py-0.5 font-mono text-[11px] text-slate-100" style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}>
            {hoverInfo.text}
          </div>
        )}
        {hoverCard && <HoverCard d={hoverCard} />}
        {netlist && idx && (
          <div className="absolute bottom-0 right-0 top-0 z-20">
            <NetlistPanel
              idx={idx}
              onClose={() => { setNetlist(false); setPathNets([]); }}
              onNet={(n) => selectNet(n)}
              onPart={(n) => { const i = idx.parts.get(n)?.index; if (i != null) selectPart(i); }}
              onPath={(nets) => { setPathNets(nets); if (nets.length && viewRef.current) { const v = viewRef.current; const pins = nets.flatMap((n) => (board.nets.get(n) || []).map((i: number) => board.pins[i])).filter((pin: any) => v.visible(pin.side)); if (pins.length) v.zoomTo(pins, 2); } }}
            />
          </div>
        )}
        {board && (
          <div className={`absolute top-2 z-10 ${netlist ? 'right-[332px]' : 'right-2'}`}>
            <LayerToggles counts={layerCounts} title="Trace layers (nets)" />
          </div>
        )}
        {(part || sel.net) && (
          <div className="absolute left-2 top-2 z-10 max-h-[calc(100%-16px)] w-72 overflow-auto rounded-lg border border-bench-600 bg-bench-900/95 p-3 shadow-2xl" data-testid="board-info">
            {part && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold text-cyan-300">{part.name}</span>
                  <span className="chip capitalize">{part.side}</span>
                  <div className="flex-1" />
                  <button className="btn-ghost" title="Find in schematic" onClick={() => p.onFindInSchematic(part.name)}><Icon name="doc" size={13} /> Schematic</button>
                </div>
                <div className="mt-1 text-[12px] text-slate-400">{TYPE_LABEL[idx?.parts.get(part.name)?.type || 'other']}{part.mfgcode ? ` · ${part.mfgcode}` : ''}</div>
                <SchLinks sch={sch} name={part.name} onOpen={() => p.onFindInSchematic(part.name)} />
                <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">{part.pins.length} pins</div>
                <table className="mt-1 w-full font-mono text-[12px]">
                  <tbody>
                    {part.pins.slice(0, 300).map((i: number) => {
                      const pin = board.pins[i];
                      return (
                        <tr key={i} className={`cursor-pointer hover:bg-bench-800 ${sel.pin === i ? 'bg-bench-700' : ''}`} onClick={() => setSel({ part: part.index, pin: i, net: pin.net && board.nets.has(pin.net) ? pin.net : null })}>
                          <td className="w-12 py-px pr-2 text-slate-500">{pin.snum || pin.name}</td>
                          <td className={pin.net === sel.net ? 'text-amber-300' : 'text-slate-200'}>{pin.net || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {sel.net && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Net</span>
                  <span className="font-mono font-semibold text-amber-300">{sel.net}</span>
                  <div className="flex-1" />
                  <button className="btn-ghost" title="Find net in schematic" onClick={() => p.onFindInSchematic(sel.net!)}><Icon name="doc" size={13} /></button>
                  <button className="btn-ghost" title="Zoom to net" onClick={() => selectNet(sel.net!)}><Icon name="fit" size={13} /></button>
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  {netPins.length} pins on {netPartNames.length} parts
                  {hiddenNetPins > 0 && <span className="text-amber-200/80"> · {hiddenNetPins} on the other side</span>}
                </div>
                {idx?.nets.get(sel.net) && (() => {
                  const ni = idx.nets.get(sel.net!)!;
                  const fam = railFamily(idx, sel.net!, 2).filter((f) => f.depth > 0);
                  return (
                    <div className="mt-1.5 space-y-1 text-[12px]" data-testid="net-facts">
                      <div className="flex flex-wrap gap-1">
                        {ni.ground ? <span className="chip text-slate-400">Ground</span> : ni.rail ? <span className="chip border-amber-500/50 text-amber-300">Supply rail</span> : <span className="chip">Signal</span>}
                        {ni.caps > 0 && <span className="chip">{ni.caps} decoupling caps</span>}
                        {ni.ics.length > 0 && <span className="chip text-cyan-300">ICs: {ni.ics.slice(0, 4).join(', ')}{ni.ics.length > 4 ? '…' : ''}</span>}
                      </div>
                      {ni.through.length > 0 && (
                        <div>
                          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Continues through</div>
                          {ni.through.slice(0, 12).map((t) => (
                            <button key={t.part + t.other} className="flex w-full items-center gap-1 rounded px-1 py-px text-left hover:bg-bench-800" onClick={() => selectNet(t.other)}>
                              <span className="font-mono text-cyan-300">{t.part}</span><span className="text-slate-500">→</span><span className="truncate font-mono text-slate-200">{t.other}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {fam.length > ni.through.length && <div className="text-[11px] text-slate-500">Rail family (2 hops): {fam.map((f) => f.net).slice(0, 10).join(', ')}</div>}
                      <SchLinks sch={sch} name={sel.net!} onOpen={() => p.onFindInSchematic(sel.net!)} />
                    </div>
                  );
                })()}
                <div className="mt-2 flex flex-wrap gap-1">
                  {netPartNames.slice(0, 200).map((n) => (
                    <button key={n} className="chip hover:border-cyan-400 hover:text-cyan-200" onClick={() => { const idx = board.parts.findIndex((x: any) => x.name === n); if (idx >= 0) { selectPart(idx); setSel({ part: idx, pin: null, net: sel.net }); } }}>{n}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-slate-600">Drag to pan · wheel to zoom · Space flips · R rotates · F fits</div>
      </div>
    </div>
  );
}

function SchLinks({ sch, name, onOpen }: { sch: SchIndex[]; name: string; onOpen: () => void }) {
  if (!sch.length) return null;
  const hits = schematicPages(sch, name);
  return (
    <div className="mt-1 text-[11.5px]" data-testid="sch-links">
      {hits.length ? (
        hits.map((h) => (
          <button key={h.fileId} className="flex flex-wrap items-center gap-1 text-left text-slate-400 hover:text-amber-200" onClick={onOpen} title={h.name}>
            <Icon name="doc" size={11} /> Schematic page{h.pages.length > 1 ? 's' : ''} {h.pages.slice(0, 8).join(', ')}{h.pages.length > 8 ? '…' : ''}
          </button>
        ))
      ) : (
        <span className="text-slate-500">Not named in the schematic text</span>
      )}
    </div>
  );
}
