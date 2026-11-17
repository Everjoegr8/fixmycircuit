import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Brand, LibraryFile } from '@shared/types';
import { api, type TreeModel } from './api';
import Sidebar from './components/Sidebar';
import SplitPane from './components/SplitPane';
import ImportDialog from './components/ImportDialog';
import SettingsDialog from './components/SettingsDialog';
import TabBar from './components/TabBar';
import ModelView from './views/ModelView';
import Home from './views/Home';
import PdfViewer from './views/PdfViewer';
import BoardViewer from './views/BoardViewer';
import PhotoEditor from './views/PhotoEditor';
import RepairPanel from './views/RepairPanel';
import { categoryLabel, type Doc, type Focus, type Nav } from './types';

export default function App() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<TreeModel[]>([]);
  const [nav, setNav] = useState<Nav>({ kind: 'home' });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>({});
  const [showPanel, setShowPanel] = useState(true);
  const [importOpen, setImportOpen] = useState<{ paths?: string[]; modelId?: number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rev, setRev] = useState(0); // bump to make views reload data
  const [pdfQuery, setPdfQuery] = useState<Record<string, { q: string; n: number }>>({});
  const [boardQuery, setBoardQuery] = useState<Record<string, { q: string; n: number }>>({});

  const reload = useCallback(async () => {
    const t = await api.tree();
    setBrands(t.brands);
    setModels(t.models);
    setRev((r) => r + 1);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  useEffect(() => api.onOpenFiles((files) => { reload(); files.forEach(openFile); }), [openFile, reload]);

  const closeDoc = (key: string) => {
    setDocs((d) => {
      const i = d.findIndex((x) => x.key === key);
      const next = d.filter((x) => x.key !== key);
      if (activeKey === key) setActiveKey(next.length ? next[Math.max(0, i - 1)].key : null);
      return next;
    });
  };

  const active = docs.find((d) => d.key === activeKey) || null;

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

  return (
    <div className="flex h-full">
      <Sidebar
        brands={brands}
        models={models}
        nav={active ? null : nav}
        onNav={goto}
        onReload={reload}
        onImport={() => setImportOpen({ modelId: navModelId ?? null })}
        onSettings={() => setSettingsOpen(true)}
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
          libraryLabel={nav.kind === 'model' ? `${modelLabel(nav.modelId)} · ${categoryLabel(nav.category)}` : nav.kind === 'unsorted' ? 'Unsorted files' : 'Home'}
          showPanel={showPanel}
          onTogglePanel={() => setShowPanel((s) => !s)}
        />
        <div className="relative min-h-0 flex-1">
          {/* Keep every open document mounted so switching tabs is instant. */}
          {docs.map((d) => {
            const isActive = d.key === viewer?.key;
            const body =
              d.type === 'pdf' ? (
                <PdfViewer
                  fileId={String(d.id)}
                  active={isActive}
                  searchRequest={pdfQuery[d.key]}
                  onFindOnBoard={(q) => findOnBoard(q, d.modelId)}
                />
              ) : d.type === 'board' ? (
                <BoardViewer
                  fileId={String(d.id)}
                  active={isActive}
                  searchRequest={boardQuery[d.key]}
                  onFocus={setFocus}
                  onFindInSchematic={(q) => findInSchematic(q, d.modelId)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              ) : (
                <PhotoEditor photoId={Number(d.id)} active={isActive} onChanged={reload} onFocus={setFocus} />
              );
            return (
              <div key={d.key} className="absolute inset-0" style={{ visibility: isActive ? 'visible' : 'hidden' }}>
                <SplitPane
                  storageKey="fmc.split"
                  right={
                    showPanel && isActive ? (
                      <RepairPanel
                        modelId={d.modelId}
                        modelLabel={modelLabel(d.modelId)}
                        focus={focus}
                        rev={rev}
                        onChanged={reload}
                        onFindInSchematic={(q) => findInSchematic(q, d.modelId)}
                        onFindOnBoard={(q) => findOnBoard(q, d.modelId)}
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
            <div className="absolute inset-0 overflow-auto">
              {nav.kind === 'home' ? (
                <Home
                  models={models}
                  brands={brands}
                  onNav={goto}
                  onImport={() => setImportOpen({ modelId: null })}
                  onOpenFile={openFile}
                  rev={rev}
                />
              ) : (
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
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-amber-500/50 bg-bench-800 px-4 py-2 text-amber-100 shadow-xl">{toast}</div>
      )}
    </div>
  );
}
