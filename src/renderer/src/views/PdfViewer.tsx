import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { loadPdfJs } from './pdf/loadPdfJs';
import { syncBus } from '../lib/sync';
import { layout, useLayout } from '../lib/layout';

interface Props {
  fileId: string;
  active: boolean;
  searchRequest?: { q: string; n: number };
  onFindOnBoard: (q: string) => void;
  syncKey?: string;
  sync?: boolean;
}

export default function PdfViewer(p: Props) {
  useLayout();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ctx = useRef<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    let destroyed = false;
    let doc: any = null;
    (async () => {
      try {
        const { pdfjsLib, viewer: V } = await loadPdfJs();
        const { bytes } = await api.readFile(p.fileId);
        if (destroyed) return;
        const eventBus = new V.EventBus();
        const linkService = new V.PDFLinkService({ eventBus });
        const findController = new V.PDFFindController({ eventBus, linkService });
        const viewer = new V.PDFViewer({
          container: hostRef.current!,
          viewer: viewerRef.current!,
          eventBus,
          linkService,
          findController,
          removePageBorders: true,
          textLayerMode: 1,
        });
        linkService.setViewer(viewer);
        eventBus.on('pagesinit', () => { viewer.currentScaleValue = 'page-width'; });
        eventBus.on('pagechanging', (e: any) => setPage(e.pageNumber));
        eventBus.on('scalechanging', (e: any) => setScale(e.scale));
        eventBus.on('updatefindmatchescount', (e: any) => setMatches(e.matchesCount));
        eventBus.on('updatefindcontrolstate', (e: any) => e.matchesCount && setMatches(e.matchesCount));
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
        if (destroyed) { doc.destroy(); return; }
        viewer.setDocument(doc);
        linkService.setDocument(doc);
        setPages(doc.numPages);
        ctx.current = { viewer, eventBus };
        setLoading(false);
      } catch (e: any) {
        if (!destroyed) { setError(e?.message || String(e)); setLoading(false); }
      }
    })();
    return () => {
      destroyed = true;
      ctx.current = null;
      doc?.destroy();
    };
  }, [p.fileId]);

  const find = (query: string, again = false, previous = false) => {
    const c = ctx.current;
    if (!c || !query.trim()) return;
    c.eventBus.dispatch('find', { source: null, type: again ? 'again' : '', query: query.trim(), caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
  };

  useEffect(() => {
    if (!p.searchRequest) return;
    setQ(p.searchRequest.q);
    const t = setInterval(() => {
      if (ctx.current) { clearInterval(t); find(p.searchRequest!.q); }
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.searchRequest?.n]);

  useEffect(() => {
    if (!p.active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1.2); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoom(1 / 1.2); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const syncRef = useRef(p);
  syncRef.current = p;
  const zoom = (f: number, emit = true) => {
    const v = ctx.current?.viewer;
    if (v) v.currentScale = Math.min(Math.max(v.currentScale * f, 0.1), 16);
    const sp = syncRef.current;
    if (emit && sp.sync && sp.syncKey) syncBus.emit({ type: 'zoom', source: sp.syncKey, factor: f, pdf: true });
  };
  useEffect(() => {
    if (!p.sync) return;
    // Pending small wheel steps are batched so pdf.js re-renders at most once a frame.
    let acc = 1, raf = 0;
    const off = syncBus.on((e) => {
      if (e.type !== 'zoom' || e.source === p.syncKey) return;
      acc *= e.factor;
      if (!raf) raf = requestAnimationFrame(() => { zoom(acc, false); acc = 1; raf = 0; });
    });
    return () => { off(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sync, p.syncKey]);

  // Ctrl+wheel zoom and drag-to-pan on empty page areas (text stays selectable).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    let drag: { x: number; y: number; sl: number; st: number } | null = null;
    const down = (e: MouseEvent) => {
      const onText = (e.target as HTMLElement).closest('.textLayer span');
      if (e.button === 1 || (e.button === 0 && !onText)) {
        drag = { x: e.clientX, y: e.clientY, sl: host.scrollLeft, st: host.scrollTop };
        host.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };
    const move = (e: MouseEvent) => {
      if (!drag) return;
      host.scrollLeft = drag.sl - (e.clientX - drag.x);
      host.scrollTop = drag.st - (e.clientY - drag.y);
    };
    const up = () => { drag = null; host.style.cursor = ''; };
    host.addEventListener('wheel', wheel, { passive: false });
    host.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      host.removeEventListener('wheel', wheel);
      host.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const selectionOrQuery = () => (window.getSelection()?.toString().trim() || q).trim();

  return (
    <div className="flex h-full flex-col">
      <div className={`${layout.on('toolbar') ? 'flex' : 'hidden'} shrink-0 flex-wrap items-center gap-2 border-b border-bench-700 bg-bench-900 px-2 py-1.5`}>
        <div className="relative w-64">
          <input
            ref={searchRef}
            className="input pl-7"
            placeholder="Find part or net (Ctrl+F)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') find(q, matches != null && matches.total > 0 && !!ctx.current, e.shiftKey);
            }}
            data-testid="pdf-search"
          />
          <span className="pointer-events-none absolute left-2 top-[7px] text-slate-500"><Icon name="search" size={13} /></span>
        </div>
        <button className="btn" onClick={() => find(q, true, true)} title="Previous match (Shift+Enter)">↑</button>
        <button className="btn" onClick={() => find(q, true)} title="Next match (Enter)">↓</button>
        <span className="w-24 text-[11px] text-slate-400" data-testid="pdf-matches">{matches ? (matches.total ? `${matches.current} of ${matches.total}` : 'No matches') : ''}</span>
        <button className="btn" title="Search the selected text (or this search) on the boardview" onClick={() => { const s = selectionOrQuery(); if (s) p.onFindOnBoard(s); }}>
          <Icon name="board" size={13} /> Find on board
        </button>
        <div className="flex-1" />
        <button className="btn" onClick={() => zoom(1 / 1.2)} title="Zoom out (Ctrl -)"><Icon name="zoomOut" size={14} /></button>
        <span className="w-12 text-center text-[11px] text-slate-400">{Math.round(scale * 100)}%</span>
        <button className="btn" onClick={() => zoom(1.2)} title="Zoom in (Ctrl +)"><Icon name="zoomIn" size={14} /></button>
        <button className="btn" onClick={() => { if (ctx.current) ctx.current.viewer.currentScaleValue = 'page-width'; }} title="Fit width"><Icon name="fit" size={14} /></button>
        <input
          className="input w-14 text-center"
          value={page}
          onChange={(e) => setPage(Number(e.target.value) || 1)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ctx.current) ctx.current.viewer.currentPageNumber = Math.min(Math.max(page, 1), pages); }}
        />
        <span className="text-[11px] text-slate-400">/ {pages}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="pdfViewerHost">
          <div ref={viewerRef} className="pdfViewer" />
        </div>
        {loading && <div className="absolute inset-0 grid place-items-center text-slate-400">Opening schematic…</div>}
        {error && <div className="absolute inset-0 grid place-items-center p-6 text-red-300">Could not open this PDF: {error}</div>}
      </div>
    </div>
  );
}
