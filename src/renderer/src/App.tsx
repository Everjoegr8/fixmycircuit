import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, type TreeModel } from './api';
import Sidebar from './components/Sidebar';
import SplitPane from './components/SplitPane';
import TabBar from './components/TabBar';
import ModelView from './views/ModelView';
import Home from './views/Home';
import RepairPanel from './views/RepairPanel';
import { Icon } from './components/Icon';
import { ActivationScreen, LicenseBanner, useLicense } from './components/License';
import { Splash , EraMark } from './brand/Logo';
import { forgetSession, saveSession } from './lib/session';
import { TOOLS, categoryLabel, type Doc, type Focus, type Nav } from './types';

// Heavy views load on first use so the app starts fast.
const ImportDialog = lazy(() => import('./components/ImportDialog'));
const SettingsDialog = lazy(() => import('./components/SettingsDialog'));
const PdfViewer = lazy(() => import('./views/PdfViewer'));
const BoardViewer = lazy(() => import('./views/BoardViewer'));
const PhotoEditor = lazy(() => import('./views/PhotoEditor'));
const KnowledgeView = lazy(() => import('./views/tools/KnowledgeView'));
const CalculatorsView = lazy(() => import('./views/tools/CalculatorsView'));
const IcXrefView = lazy(() => import('./views/tools/IcXrefView'));
const MicroscopeView = lazy(() => import('./views/tools/MicroscopeView'));
const MirrorView = lazy(() => import('./views/tools/MirrorView'));
const AboutDialog = lazy(() => import('./components/AboutDialog'));
const AiToolView = lazy(() => import('./views/tools/AiToolView'));
const Loading = () => <div className="grid h-full place-items-center text-slate-500" data-testid="view-loading"><span className="fmc-spin inline-block h-5 w-5 rounded-full border-2 border-amber-400 border-t-transparent" /></div>;

export default function App() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<TreeModel[]>([]);
  const [nav, setNav] = useState<Nav>({ kind: 'home' });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus & { src?: string }>({});
  const [split, setSplit] = useState<string | null>(null);
  const [syncOn, setSyncOn] = useState(true);
  const [jump, setJump] = useState('');
  const [showPanel, setShowPanel] = useState(true);
  const [importOpen, setImportOpen] = useState<{ paths?: string[]; modelId?: number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [splash, setSplash] = useState(() => !(window as any).__fmcNoSplash);
  const [version, setVersion] = useState('');
  const lic = useLicense();
  useEffect(() => {
    api.dataInfo().then((i) => setVersion(i.version));
    const t = setTimeout(() => setSplash(false), 1300);
    return () => clearTimeout(t);
  }, []);
  const [rev, setRev] = useState(0); // bump to make views reload data
  const [pdfQuery, setPdfQuery] = useState<Record<string, { q: string; n: number }>>({});
  const [boardQuery, setBoardQuery] = useState<Record<string, { q: string; n: number }>>({});

  const reload = useCallback(async () => {
    const t = await api.tree();
    setBrands(t.brands);
    setModels(t.models);
    setRev((r) => r + 1);
  }, []);

  const unlocked = !!lic && !lic.locked;
  useEffect(() => {
    if (unlocked) reload();
  }, [reload, unlocked]);

  const modelLabel = useCallback(
    (id: number | null | undefined) => {
      if (id == null) return 'Unsorted';
      const m = models.find((x) => x.id === id);
      const b = m && brands.find((x) => x.id === m.brand_id);
      return m ? `${b?.name ?? ''} ${m.name}`.trim() : 'Unknown model';
    },
    [models, brands],
  );

  const openFile = useCallback(
    (f: LibraryFile) => {
      if (f.kind === 'photo') return; // photos open through their photo record
      const type = f.kind === 'schematic' ? 'pdf' : 'board';
      const key = `${type}:${f.id}`;
      setDocs((d) => (d.some((x) => x.key === key) ? d : [...d, { key, type, id: f.id, title: f.name, modelId: f.model_id }]));
      setActiveKey(key);
    },
    [],
  );

  const openPhoto = useCallback((photoId: number, title: string, modelId: number | null) => {
    const key = `photo:${photoId}`;
    setDocs((d) => (d.some((x) => x.key === key) ? d : [...d, { key, type: 'photo', id: photoId, title, modelId }]));
    setActiveKey(key);
  }, []);

  useEffect(() => {
    const f = (e: Event) => { const ph = (e as CustomEvent).detail; openPhoto(ph.id, ph.title, ph.model_id); };
    window.addEventListener('fmc-open-photo', f);
    return () => window.removeEventListener('fmc-open-photo', f);
  }, [openPhoto]);

  useEffect(() => api.onOpenFiles((files) => { reload(); files.forEach(openFile); }), [openFile, reload]);

  const closeDoc = (key: string) => {
    setDocs((d) => {
      const i = d.findIndex((x) => x.key === key);
      const next = d.filter((x) => x.key !== key);
      if (activeKey === key) setActiveKey(next.length ? next[Math.max(0, i - 1)].key : null);
      if (split === key) setSplit(null);
      return next;
    });
  };

  const active = docs.find((d) => d.key === activeKey) || null;
  // Remember the last document worked on for "Continue your work" on Home.
  useEffect(() => { if (active) saveSession({ key: active.key, type: active.type, id: active.id, title: active.title, modelId: active.modelId, label: modelLabel(active.modelId) }); }, [active, modelLabel]);

  const goto = (n: Nav) => {
    setNav(n);
    setActiveKey(null);
  };

  /** Search the schematic for a part or net name; opens the model's first PDF if none is open. */
  const findInSchematic = async (q: string, modelId: number | null) => {
    let doc = docs.find((d) => d.type === 'pdf' && d.modelId === modelId) || docs.find((d) => d.type === 'pdf');
    if (!doc) {
      const pdfs = await api.listFiles(modelId, 'schematic');
      if (!pdfs.length) return alertMsg('No schematic PDF for this model yet. Import one under Schematics/PDF.');
      openFile(pdfs[0]);
      doc = { key: `pdf:${pdfs[0].id}`, type: 'pdf', id: pdfs[0].id, title: pdfs[0].name, modelId };
    }
    setActiveKey(doc.key);
    setPdfQuery((p) => ({ ...p, [doc!.key]: { q, n: (p[doc!.key]?.n || 0) + 1 } }));
  };

  const findOnBoard = async (q: string, modelId: number | null) => {
    let doc = docs.find((d) => d.type === 'board' && d.modelId === modelId) || docs.find((d) => d.type === 'board');
    if (!doc) {
      const boards = await api.listFiles(modelId, 'boardview');
      if (!boards.length) return alertMsg('No boardview file for this model yet. Import one under BoardView.');
      openFile(boards[0]);
      doc = { key: `board:${boards[0].id}`, type: 'board', id: boards[0].id, title: boards[0].name, modelId };
    }
    setActiveKey(doc.key);
    setBoardQuery((p) => ({ ...p, [doc!.key]: { q, n: (p[doc!.key]?.n || 0) + 1 } }));
  };

  // --- split-screen sync ---------------------------------------------------------
  const splitDoc = split && split !== activeKey ? docs.find((d) => d.key === split) || null : null;
  const splitMode = !!(active && splitDoc);

  /** Open the best partner for the active document (schematic next to a board or photo). */
  const startSplit = async () => {
    if (!active) return;
    if (splitMode) { setSplit(null); return; }
    const other = docs.find((d) => d.key !== active.key && d.modelId === active.modelId && d.type !== active.type) || docs.find((d) => d.key !== active.key);
    if (other) { setSplit(other.key); return; }
    const want = active.type === 'pdf' ? 'photo' : 'schematic';
    if (want === 'schematic') {
      const pdfs = await api.listFiles(active.modelId, 'schematic');
      if (!pdfs.length) return alertMsg('Import a schematic PDF for this model to use split view.');
      const key = `pdf:${pdfs[0].id}`;
      setDocs((d) => (d.some((x) => x.key === key) ? d : [...d, { key, type: 'pdf', id: pdfs[0].id, title: pdfs[0].name, modelId: active.modelId }]));
      setSplit(key);
    } else {
      const photos = await api.listPhotos(active.modelId);
      if (photos.length) {
        const key = `photo:${photos[0].id}`;
        setDocs((d) => (d.some((x) => x.key === key) ? d : [...d, { key, type: 'photo', id: photos[0].id, title: photos[0].title, modelId: active.modelId }]));
        setSplit(key);
        return;
      }
      const boards = await api.listFiles(active.modelId, 'boardview');
      if (!boards.length) return alertMsg('Add a board photo or boardview for this model to use split view.');
      const key = `board:${boards[0].id}`;
      setDocs((d) => (d.some((x) => x.key === key) ? d : [...d, { key, type: 'board', id: boards[0].id, title: boards[0].name, modelId: active.modelId }]));
      setSplit(key);
    }
  };

  // Selection sync: a part or net picked in one pane is found in the other.
  const lastSent = useRef<Record<string, string>>({});
  const sendTo = (d: Doc, q: string) => {
    if (!q || lastSent.current[d.key] === q) return;
    lastSent.current[d.key] = q;
    if (d.type === 'pdf') setPdfQuery((p) => ({ ...p, [d.key]: { q, n: (p[d.key]?.n || 0) + 1 } }));
    if (d.type === 'board') setBoardQuery((p) => ({ ...p, [d.key]: { q, n: (p[d.key]?.n || 0) + 1 } }));
  };
  useEffect(() => {
    if (!splitMode || !syncOn || !focus.src) return;
    const q = focus.part || focus.net || '';
    for (const d of [active!, splitDoc!]) {
      if (d.key === focus.src) { lastSent.current[d.key] = q; continue; }
      if (d.type === 'pdf') sendTo(d, q);
      if (d.type === 'board' && focus.src.startsWith('photo:')) sendTo(d, focus.net || focus.part || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, splitMode, syncOn]);

  const doJump = () => {
    const q = jump.trim();
    if (!q) return;
    const panes = splitMode ? [active!, splitDoc!] : active ? [active] : [];
    for (const d of panes) { lastSent.current[d.key] = ''; sendTo(d, q); }
    setFocus({ part: q, net: q, src: 'jump' });
  };

  const [toast, setToast] = useState<string | null>(null);
  function alertMsg(m: string) {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 4000);
  }

  const navModelId = nav.kind === 'model' ? nav.modelId : nav.kind === 'unsorted' ? null : undefined;

  const viewer = useMemo(() => {
    if (!active) return null;
    return active;
  }, [active]);

  if (!lic) return <div className="h-full bg-bench-950">{splash && <Splash version={version} />}</div>;
  if (lic.locked) return <div className="h-full">{splash && <Splash version={version} />}<ActivationScreen st={lic} /></div>;

  return (
    <div className="flex h-full flex-col">
    {splash && <Splash version={version} />}
    {lic && <LicenseBanner st={lic} onOpen={() => setSettingsOpen(true)} />}
    <div className="flex min-h-0 flex-1">
      <Sidebar
        brands={brands}
        models={models}
        nav={active ? null : nav}
        onNav={goto}
        onReload={reload}
        onImport={() => setImportOpen({ modelId: navModelId ?? null })}
        onSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
        onOpenFile={openFile}
        onOpenPhoto={openPhoto}
        modelLabel={modelLabel}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar
          docs={docs}
          activeKey={activeKey}
          onSelect={setActiveKey}
          onClose={closeDoc}
          onLibrary={() => setActiveKey(null)}
          libraryLabel={nav.kind === 'model' ? `${modelLabel(nav.modelId)} · ${categoryLabel(nav.category)}` : nav.kind === 'unsorted' ? 'Unsorted files' : nav.kind === 'tool' ? TOOLS.find((t) => t.id === nav.tool)!.label : 'Home'}
          showPanel={showPanel}
          onTogglePanel={() => setShowPanel((s) => !s)}
          split={splitMode}
          onSplit={startSplit}
        />
        {splitMode && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-bench-700 bg-bench-850 px-2 py-1.5" data-testid="split-bar">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-300"><Icon name="split" size={13} /> Split view</span>
            <select className="input w-56 py-0.5" value={splitDoc!.key} onChange={(e) => setSplit(e.target.value)} title="Right pane">
              {docs.filter((d) => d.key !== activeKey).map((d) => <option key={d.key} value={d.key}>{d.type === 'pdf' ? 'Schematic' : d.type === 'board' ? 'Boardview' : 'Photo'}: {d.title}</option>)}
            </select>
            <button className="btn" title="Swap panes" onClick={() => { const a = activeKey; setActiveKey(split); setSplit(a); }}>⇄</button>
            <div className="relative ml-2 w-72">
              <input className="input pl-7" placeholder="Jump to component or net on both sides" value={jump} onChange={(e) => setJump(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doJump()} data-testid="jump-input" />
              <span className="pointer-events-none absolute left-2 top-[7px] text-slate-500"><Icon name="search" size={13} /></span>
            </div>
            <button className="btn" onClick={doJump}>Jump</button>
            <label className="ml-2 flex items-center gap-1.5 text-slate-300" title="Zoom, pan and selection follow between the two panes">
              <input type="checkbox" checked={syncOn} onChange={(e) => setSyncOn(e.target.checked)} data-testid="sync-toggle" /> <Icon name="sync" size={13} /> Sync zoom, pan and selection
            </label>
            <div className="flex-1" />
            <button className="btn-ghost" onClick={() => setSplit(null)} title="Close split view"><Icon name="x" size={13} /></button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          {/* Keep every open document mounted so switching tabs is instant. */}
          {docs.map((d) => {
            const isActive = d.key === viewer?.key;
            const isSecond = splitMode && d.key === splitDoc!.key;
            const shown = isActive || isSecond;
            const sync = splitMode && syncOn && shown;
            const onFocusFrom = (f: Focus) => { if (isActive || isSecond) setFocus({ ...f, src: d.key }); };
            const body = <Suspense fallback={<Loading />}>{
              d.type === 'pdf' ? (
                <PdfViewer
                  fileId={String(d.id)}
                  active={isActive}
                  searchRequest={pdfQuery[d.key]}
                  onFindOnBoard={(q) => findOnBoard(q, d.modelId)}
                  syncKey={d.key}
                  sync={sync}
                />
              ) : d.type === 'board' ? (
                <BoardViewer
                  fileId={String(d.id)}
                  active={isActive || isSecond}
                  searchRequest={boardQuery[d.key]}
                  onFocus={onFocusFrom}
                  onFindInSchematic={(q) => findInSchematic(q, d.modelId)}
                  onOpenSettings={() => setSettingsOpen(true)}
                  modelId={d.modelId}
                  rev={rev}
                  syncKey={d.key}
                  sync={sync}
                />
              ) : (
                <PhotoEditor photoId={Number(d.id)} active={isActive} onChanged={reload} onFocus={onFocusFrom} focus={focus} syncKey={d.key} sync={sync} />
              )}</Suspense>;
            const pos = !splitMode || !shown ? 'inset-0' : isActive ? 'inset-y-0 left-0 right-1/2 border-r-2 border-sky-500/40' : 'inset-y-0 left-1/2 right-0';
            return (
              <div key={d.key} className={`absolute ${pos}`} style={{ visibility: shown ? 'visible' : 'hidden' }}>
                <SplitPane
                  storageKey="fmc.split"
                  right={
                    showPanel && isActive && !splitMode ? (
                      <RepairPanel
                        modelId={d.modelId}
                        modelLabel={modelLabel(d.modelId)}
                        focus={focus}
                        rev={rev}
                        onChanged={reload}
                        onFindInSchematic={(q) => findInSchematic(q, d.modelId)}
                        onFindOnBoard={(q) => findOnBoard(q, d.modelId)}
                        demo={!!models.find((m) => m.id === d.modelId)?.demo}
                        onOpenSettings={() => setSettingsOpen(true)}
                      />
                    ) : null
                  }
                >
                  {body}
                </SplitPane>
              </div>
            );
          })}
          {!viewer && (
            <div className="fmc-page absolute inset-0 overflow-auto" key={JSON.stringify(nav)}>
              {nav.kind === 'home' ? (
                <Home
                  models={models}
                  brands={brands}
                  onNav={goto}
                  onImport={() => setImportOpen({ modelId: null })}
                  onOpenFile={openFile}
                  onOpenPhoto={openPhoto}
                  onReload={reload}
                  onOpenDoc={async (d) => {
                    if (d.type === 'photo') {
                      if (await api.getPhoto(Number(d.id))) return openPhoto(Number(d.id), d.title, d.modelId);
                    } else {
                      const f = (await api.listFiles(d.modelId)).find((x) => String(x.id) === String(d.id));
                      if (f) return openFile(f);
                    }
                    forgetSession(d.key);
                    alertMsg('That file is no longer in the library.');
                    reload();
                  }}
                  rev={rev}
                />
              ) : nav.kind === 'tool' ? (<Suspense fallback={<Loading />}>{
                nav.tool === 'ai' ? <AiToolView models={models} brands={brands} onOpenSettings={() => setSettingsOpen(true)} onFindOnBoard={(q, id) => findOnBoard(q, id)} />
                : nav.tool === 'knowledge' ? <KnowledgeView models={models} brands={brands} onChanged={reload} />
                : nav.tool === 'calculators' ? <CalculatorsView />
                : nav.tool === 'ics' ? <IcXrefView />
                : nav.tool === 'microscope' ? <MicroscopeView models={models} brands={brands} onChanged={reload} onOpenPhoto={openPhoto} />
                : <MirrorView />
              }</Suspense>) : (
                <ModelView
                  key={`${nav.kind}-${navModelId}`}
                  modelId={navModelId ?? null}
                  category={nav.kind === 'model' ? nav.category : 'schematics'}
                  unsorted={nav.kind === 'unsorted'}
                  title={nav.kind === 'model' ? modelLabel(nav.modelId) : 'Unsorted files'}
                  models={models}
                  brands={brands}
                  rev={rev}
                  onReload={reload}
                  onCategory={(c) => nav.kind === 'model' && setNav({ ...nav, category: c })}
                  onOpenFile={openFile}
                  onOpenPhoto={openPhoto}
                  onImport={(kind) => setImportOpen({ modelId: navModelId ?? null, ...(kind ? {} : {}) })}
                  onFindInSchematic={(q) => findInSchematic(q, navModelId ?? null)}
                  onFindOnBoard={(q) => findOnBoard(q, navModelId ?? null)}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <Suspense fallback={null}>
      {importOpen && (
        <ImportDialog
          brands={brands}
          models={models}
          initialModelId={importOpen.modelId ?? null}
          onClose={() => setImportOpen(null)}
          onDone={(files) => {
            setImportOpen(null);
            reload();
            if (files.length === 1) {
              const f = files[0];
              if (f.kind === 'photo') api.listPhotos(f.model_id).then((ps) => { const p = ps.find((x) => x.file_id === f.id); if (p) openPhoto(p.id, p.title, p.model_id); });
              else openFile(f);
            }
          }}
          onReloadTree={reload}
        />
      )}
      </Suspense>
      <Suspense fallback={null}>
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onReload={reload} />}
        {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      </Suspense>
      {toast && (
        <div className="fmc-rise fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-md border border-amber-500/50 bg-bench-800 px-4 py-2 text-amber-100 shadow-xl">{toast}</div>
      )}
    </div>
    <StatusBar version={version} docs={docs.length} models={models.length} onAbout={() => setAboutOpen(true)} lic={lic ? (lic.state === 'trial' ? `Trial · ${lic.daysLeft + 1}d left` : lic.state === 'grace' ? 'Key expired · grace period' : `Licensed · ${lic.daysLeft}d left`) : ''} />
    </div>
  );
}

function StatusBar({ version, docs, models, onAbout, lic }: { version: string; docs: number; models: number; onAbout: () => void; lic: string }) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-bench-700 bg-bench-900 px-3 text-[11px] text-slate-500" data-testid="statusbar">
      <span className="flex items-center gap-1.5 text-green-300"><span className="fmc-node-glow inline-block h-1.5 w-1.5 rounded-full bg-green-400" /> Ready</span>
      <span>FixMyCircuit v{version}</span>
      <span className="hidden md:inline">·</span>
      <span className="hidden md:inline">{models} models · {docs} open</span>
      <span className="hidden md:inline">· Offline</span>
      {lic && <span className="hidden md:inline" data-testid="status-license">· {lic}</span>}
      <span className="flex-1 text-center italic text-slate-500">Find the fault. Fix with confidence.</span>
      <button className="flex items-center gap-1 hover:text-amber-300" onClick={onAbout}><EraMark size={13} /> by ERA Technologiz</button>
    </footer>
  );
}
