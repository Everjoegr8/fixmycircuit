import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb, type DB } from './db';
import { kindForExt, guessBrand, type FileKind, type ImportRequest } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  { scheme: 'fmc', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let db: DB;
let win: BrowserWindow | null = null;
let dataDir = '';
let libDir = '';
const pendingOpen: string[] = [];

function extOf(name: string) {
  return path.extname(name).slice(1).toLowerCase();
}

function fileDir(id: string) {
  return path.join(libDir, id);
}

function storedPath(id: string) {
  const f = db.getFile(id);
  if (!f) throw new Error('File not found in library');
  return path.join(fileDir(id), f.name);
}

/** Copy files into the offline library and register them in SQLite. */
function importFiles(req: ImportRequest) {
  const added: ReturnType<typeof db.addFile>[] = [];
  for (const src of req.paths) {
    const name = path.basename(src);
    const ext = extOf(name);
    const kind: FileKind = req.kind || kindForExt(ext);
    let modelId = req.model_id;
    if (modelId == null) {
      // Leave unsorted, but create the brand if we recognise it so the user can file it quickly.
      const brand = guessBrand(name);
      if (brand) db.addBrand(brand);
    }
    const id = randomUUID();
    const dir = fileDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name));
    let extra = '';
    if (ext === 'asc') {
      // ASC boards are a set of sibling files; keep them together.
      const siblings = fs.readdirSync(path.dirname(src)).filter((n) => /^(format|pins|nails|parts|nets)\.asc$/i.test(n));
      for (const s of siblings) if (s !== name) fs.copyFileSync(path.join(path.dirname(src), s), path.join(dir, s));
      extra = siblings.join(',');
    }
    const size = fs.statSync(src).size;
    const file = db.addFile({ id, model_id: modelId, kind, name, ext, size, extra });
    if (kind === 'photo') db.addPhoto({ model_id: modelId, file_id: id, title: path.parse(name).name });
    added.push(file);
  }
  return added;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0e12',
    title: 'FixMyCircuit',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.on('did-finish-load', () => flushPendingOpen());
}

function flushPendingOpen() {
  if (!win || !pendingOpen.length) return;
  const paths = pendingOpen.splice(0).filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!paths.length) return;
  const files = importFiles({ paths, model_id: null });
  win.webContents.send('open-files', files);
}

function collectArgvFiles(argv: string[]) {
  for (const a of argv.slice(1)) {
    if (a.startsWith('-')) continue;
    const ext = extOf(a);
    if (kindForExt(ext) !== 'other') pendingOpen.push(path.resolve(a));
  }
}

function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args));
}

function registerIpc() {
  handle('tree', () => db.tree());
  handle('brand:add', (name: string) => db.addBrand(name));
  handle('model:add', (brandId: number, name: string) => db.addModel(brandId, name));
  handle('model:rename', (id: number, name: string) => db.renameModel(id, name));
  handle('model:delete', (id: number) => db.deleteModel(id));

  handle('files:list', (modelId?: number | null, kind?: string) => db.listFiles(modelId, kind));
  handle('files:pick', async (filters?: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: filters || [
        { name: 'Schematics, boardviews and photos', extensions: ['pdf', 'brd', 'bdv', 'bv', 'bvr', 'cst', 'fz', 'asc', 'pcb', 'jpg', 'jpeg', 'png', 'webp'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  handle('files:import', (req: ImportRequest) => importFiles(req));
  handle('files:read', (id: string) => {
    const f = db.getFile(id);
    if (!f) throw new Error('File not found in library');
    const bytes = fs.readFileSync(path.join(fileDir(id), f.name));
    const extras: Record<string, Uint8Array> = {};
    if (f.extra) for (const n of f.extra.split(',')) {
      const p = path.join(fileDir(id), n);
      if (fs.existsSync(p)) extras[n.toLowerCase()] = fs.readFileSync(p);
    }
    return { file: f, bytes, extras };
  });
  handle('files:update', (id: string, patch: any) => db.updateFile(id, patch));
  handle('files:delete', (id: string) => {
    db.deleteFile(id);
    fs.rmSync(fileDir(id), { recursive: true, force: true });
  });
  handle('files:reveal', (id: string) => shell.showItemInFolder(storedPath(id)));

  handle('guides:list', (modelId?: number | null, q?: string) => db.listGuides(modelId, q));
  handle('guides:save', (g: any) => db.saveGuide(g));
  handle('guides:delete', (id: number) => db.deleteGuide(id));

  handle('readings:list', (filter: any) => db.listReadings(filter || {}));
  handle('readings:save', (r: any) => db.saveReading(r));
  handle('readings:delete', (id: number) => db.deleteReading(id));

  handle('photos:list', (modelId?: number | null) => db.listPhotos(modelId));
  handle('photos:get', (id: number) => db.getPhoto(id));
  handle('photos:update', (id: number, patch: any) => db.updatePhoto(id, patch));
  handle('photos:delete', (id: number) => {
    const p = db.deletePhoto(id);
    if (p) {
      db.deleteFile(p.file_id);
      fs.rmSync(fileDir(p.file_id), { recursive: true, force: true });
    }
  });
  handle('jumpers:list', (photoId: number) => db.listJumpers(photoId));
  handle('jumpers:save', (j: any) => db.saveJumper(j));
  handle('jumpers:delete', (id: number) => db.deleteJumper(id));

  handle('search', (q: string) => db.search(q));
  handle('settings:get', () => db.getSettings());
  handle('settings:set', (patch: any) => db.setSettings(patch));

  handle('data:info', () => ({ dataDir, libDir, dbFile: path.join(dataDir, 'fixmycircuit.db'), version: app.getVersion() }));
  handle('data:open', () => shell.openPath(dataDir));
  handle('data:backup', async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `fixmycircuit-backup-${new Date().toISOString().slice(0, 10)}.db` });
    if (r.canceled || !r.filePath) return null;
    await db.raw.backup(r.filePath);
    return r.filePath;
  });
  handle('data:exportContent', async () => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: `fixmycircuit-guides-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(db.exportContent(), null, 2));
    return r.filePath;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  collectArgvFiles(process.argv);
  app.on('second-instance', (_e, argv) => {
    collectArgvFiles(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      flushPendingOpen();
    }
  });

  app.whenReady().then(() => {
    dataDir = process.env.FMC_DATA_DIR || path.join(app.getPath('userData'), 'data');
    libDir = path.join(dataDir, 'library');
    fs.mkdirSync(libDir, { recursive: true });
    db = openDb(path.join(dataDir, 'fixmycircuit.db'));

    protocol.handle('fmc', (req) => {
      const u = new URL(req.url);
      const id = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (u.host !== 'file' || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(storedPath(id)).toString());
    });

    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
