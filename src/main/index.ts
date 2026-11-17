import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import { aiStepWith, type AiStepReq } from './ai';
import { activate, licenseStatus, SUPPORT_WHATSAPP } from './license';
import { whatsappLink } from '../shared/license';
import { spawn, execFile } from 'node:child_process';
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

// --- demo workshop -------------------------------------------------------------
function samplesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'samples') : path.join(app.getAppPath(), 'samples');
}

/** Create the synthetic demo models from samples/demo.json. Skips models that already exist. */
function seedDemo() {
  const dir = samplesDir();
  const specFile = path.join(dir, 'demo.json');
  if (!fs.existsSync(specFile)) return { added: 0, error: 'Demo files are missing from this install.' };
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const author = 'FixMyCircuit demo';
  let added = 0;
  const tx = db.raw.transaction(() => {
    for (const m of spec.models) {
      const brand = db.addBrand(m.brand) as { id: number };
      const exists = db.raw.prepare('SELECT id FROM models WHERE brand_id = ? AND name = ?').get(brand.id, m.model);
      if (exists) continue;
      const model = db.addModel(brand.id, m.model) as { id: number };
      db.markDemo(model.id);
      const files = importFiles({ paths: [spec.files.schematic, spec.files.boardview, spec.files.photo].map((f: string) => path.join(dir, f)), model_id: model.id });
      const photoFile = files.find((f) => f.kind === 'photo')!;
      const photo = db.listPhotos(model.id).find((p) => p.file_id === photoFile.id)!;
      db.updatePhoto(photo.id, { title: spec.photoTitle, align: JSON.stringify(spec.photoAlign) });
      for (const g of m.guides) db.saveGuide({ ...g, model_id: model.id, author, photo_ids: String(photo.id) });
      for (const r of m.readings) {
        const onPhoto = r.x != null && r.y != null;
        db.saveReading({ ...r, model_id: model.id, photo_id: onPhoto ? photo.id : null, color: r.type === 'voltage' ? '#22c55e' : r.type === 'resistance' ? '#38bdf8' : '#f5a524', author });
      }
      for (const j of m.jumpers) db.saveJumper({ ...j, photo_id: photo.id, author });
      added++;
    }
  });
  tx();
  return { added };
}

function removeDemo() {
  const models = db.demoModels();
  for (const m of models) {
    for (const f of db.filesOfModel(m.id)) {
      db.deleteFile(f.id);
      fs.rmSync(fileDir(f.id), { recursive: true, force: true });
    }
    db.deleteModel(m.id);
  }
  return { removed: models.length };
}

// --- phone mirror (scrcpy + adb) ---------------------------------------------------
function findTool(name: 'scrcpy' | 'adb') {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const dirs = [
    app.isPackaged ? path.join(process.resourcesPath, 'scrcpy') : path.join(app.getAppPath(), 'vendor', 'scrcpy'),
    ...(process.env.PATH || '').split(path.delimiter),
  ];
  for (const d of dirs) {
    const p = path.join(d, exe);
    if (d && fs.existsSync(p)) return p;
  }
  return null;
}

function run(cmd: string, args: string[], timeout = 0): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}${err && !stderr ? err.message : ''}`.trim() });
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0f14',
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

// While the licence is locked only these channels answer.
const OPEN_CHANNELS = new Set(['license:status', 'license:activate', 'license:whatsapp', 'data:info', 'settings:get']);
let licenseLocked = false;
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    if (licenseLocked && !OPEN_CHANNELS.has(channel)) throw new Error('FixMyCircuit needs a licence key. Enter it on the activation screen.');
    return fn(...args);
  });
}

const PRIVATE_SETTINGS = ['licenseKey', 'trialStart', 'licLastSeen'];
const licStore = () => ({
  get: (k: string) => (db.getSettings() as any)[k] as string | undefined,
  set: (k: string, v: string) => { db.setSettings({ [k]: v } as any); },
});
function currentLicense() {
  const st = licenseStatus(licStore());
  licenseLocked = st.locked;
  return st;
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

  handle('photos:addFromData', (req: { model_id: number | null; dataUrl: string; title: string; guide_id?: number | null }) => {
    const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(req.dataUrl);
    if (!m) throw new Error('Not an image');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const id = randomUUID();
    const safe = (req.title || 'capture').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'capture';
    const name = `${safe}.${ext}`;
    fs.mkdirSync(fileDir(id), { recursive: true });
    const buf = Buffer.from(m[2], 'base64');
    fs.writeFileSync(path.join(fileDir(id), name), buf);
    db.addFile({ id, model_id: req.model_id, kind: 'photo', name, ext, size: buf.length, extra: '' });
    const photo = db.addPhoto({ model_id: req.model_id, file_id: id, title: req.title || 'Microscope capture' });
    if (req.guide_id) {
      const g = db.listGuides(req.model_id).find((x) => x.id === req.guide_id);
      if (g) db.saveGuide({ ...g, photo_ids: [g.photo_ids, String(photo.id)].filter(Boolean).join(',') });
    }
    return photo;
  });

  handle('ics:list', (q?: string) => db.listIcs(q));
  handle('ics:save', (r: any) => db.saveIc(r));
  handle('ics:delete', (id: number) => db.deleteIc(id));

  handle('demo:load', () => seedDemo());
  handle('demo:remove', () => removeDemo());
  handle('samples:save', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Choose a folder for the sample files', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dest = path.join(r.filePaths[0], 'FixMyCircuit samples');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(samplesDir())) fs.copyFileSync(path.join(samplesDir(), f), path.join(dest, f));
    shell.openPath(dest);
    return dest;
  });

  handle('mirror:status', async () => {
    const scrcpy = findTool('scrcpy');
    const adb = findTool('adb');
    let devices: { serial: string; state: string; model: string }[] = [];
    if (adb) {
      const r = await run(adb, ['devices', '-l'], 8000);
      devices = r.out.split(/\r?\n/).slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('*')).map((l) => {
        const [serial, state] = l.split(/\s+/);
        return { serial, state, model: /model:(\S+)/.exec(l)?.[1]?.replace(/_/g, ' ') || '' };
      });
    }
    return { scrcpy, adb, devices };
  });
  handle('mirror:start', (opts: { serial?: string; turnScreenOff?: boolean; stayAwake?: boolean; record?: boolean; maxSize?: number }) => {
    const scrcpy = findTool('scrcpy');
    if (!scrcpy) throw new Error('scrcpy is not installed. The Windows build includes it; on other systems install scrcpy and adb.');
    const args = ['--window-title', 'FixMyCircuit phone mirror'];
    if (opts.serial) args.push('--serial', opts.serial);
    if (opts.turnScreenOff) args.push('--turn-screen-off');
    if (opts.stayAwake) args.push('--stay-awake');
    if (opts.maxSize) args.push('--max-size', String(opts.maxSize));
    if (opts.record) args.push('--record', path.join(app.getPath('videos'), `fixmycircuit-mirror-${Date.now()}.mp4`));
    const child = spawn(scrcpy, args, { cwd: path.dirname(scrcpy), detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return { started: true };
  });
  handle('mirror:backup', async (req: { serial?: string; remote: string }) => {
    const adb = findTool('adb');
    if (!adb) throw new Error('adb is not available.');
    const r = await dialog.showOpenDialog(win!, { title: 'Back up phone files to…', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dest = path.join(r.filePaths[0], `phone-backup-${new Date().toISOString().slice(0, 10)}`);
    fs.mkdirSync(dest, { recursive: true });
    const args = [...(req.serial ? ['-s', req.serial] : []), 'pull', '-a', req.remote, dest];
    const out = await run(adb, args);
    if (out.ok) shell.openPath(dest);
    return { ...out, dest };
  });

  handle('search', (q: string) => db.search(q));
  handle('ai:step', (req: AiStepReq) => {
    const st = db.getSettings() as any;
    return aiStepWith(req, { provider: st.aiProvider, anthropicKey: st.anthropicKey, aiModel: st.aiModel, aiBaseUrl: st.aiBaseUrl, aiApiKey: st.aiApiKey, aiCustomModel: st.aiCustomModel });
  });
  handle('ai:status', () => {
    const st = db.getSettings() as any;
    const provider = st.aiProvider || 'claude';
    const configured = provider === 'claude' ? !!st.anthropicKey : !!st.aiCustomModel && (provider === 'ollama' || provider === 'custom' || !!st.aiApiKey);
    return { configured: configured || process.env.FMC_AI_MOCK === '1', model: provider === 'claude' ? st.aiModel || 'claude-opus-5-5' : `${provider}: ${st.aiCustomModel || '?'}`, mock: process.env.FMC_AI_MOCK === '1' };
  });
  handle('stats:activity', (days?: number) => db.activity(days || 14));
  handle('stats:recent', (limit?: number) => db.recentActivity(limit || 10));
  handle('settings:get', () => { const s: any = db.getSettings(); for (const k of PRIVATE_SETTINGS) delete s[k]; return s; });
  handle('settings:set', (patch: any) => { const p = { ...patch }; for (const k of PRIVATE_SETTINGS) delete p[k]; db.setSettings(p); const s: any = db.getSettings(); for (const k of PRIVATE_SETTINGS) delete s[k]; return s; });
  handle('license:status', () => currentLicense());
  handle('license:activate', (key: string) => { const r = activate(licStore(), String(key || '')); return { ...r, status: currentLicense() }; });
  handle('license:whatsapp', (text: string) => { shell.openExternal(whatsappLink(SUPPORT_WHATSAPP, String(text || ''))); });

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

// Tests and portable setups: keep browser storage (theme, layout) with the data.
if (process.env.FMC_DATA_DIR) app.setPath('userData', path.join(process.env.FMC_DATA_DIR, 'profile'));
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

    // The USB microscope tab needs the camera; nothing else asks for permissions.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

    // Fill the workbench with the synthetic demo models on first launch.
    const settings = db.getSettings() as any;
    if (settings.demoSeeded !== '1' && process.env.FMC_NO_DEMO !== '1') {
      try { seedDemo(); } catch (e) { console.error('demo seed failed', e); }
      db.setSettings({ demoSeeded: '1' } as any);
    }

    registerIpc();
    currentLicense();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
