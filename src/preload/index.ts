import { contextBridge, ipcRenderer, webUtils } from 'electron';

const call = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api = {
  tree: call('tree'),
  addBrand: call('brand:add'),
  addModel: call('model:add'),
  renameModel: call('model:rename'),
  deleteModel: call('model:delete'),

  listFiles: call('files:list'),
  pickFiles: call('files:pick'),
  importFiles: call('files:import'),
  readFile: call('files:read'),
  updateFile: call('files:update'),
  deleteFile: call('files:delete'),
  revealFile: call('files:reveal'),

  listGuides: call('guides:list'),
  saveGuide: call('guides:save'),
  deleteGuide: call('guides:delete'),

  listReadings: call('readings:list'),
  saveReading: call('readings:save'),
  deleteReading: call('readings:delete'),

  listPhotos: call('photos:list'),
  getPhoto: call('photos:get'),
  updatePhoto: call('photos:update'),
  deletePhoto: call('photos:delete'),
  listJumpers: call('jumpers:list'),
  saveJumper: call('jumpers:save'),
  deleteJumper: call('jumpers:delete'),
  listCopper: call('copper:list'),
  addCopper: call('copper:add'),
  deleteCopper: call('copper:delete'),
  readGerbers: call('copper:read'),
  listTools: call('tools:list'),
  installTool: call('tools:install'),
  openToolsFolder: call('tools:folder'),
  openUrl: call('tools:open-url'),
  onToolProgress: (f: (e: { id: string; msg: string }) => void) => { const h = (_: unknown, e: any) => f(e); ipcRenderer.on('tools:progress', h); return () => { ipcRenderer.removeListener('tools:progress', h); }; },
  airplayStatus: call('airplay:status'),
  airplayStart: call('airplay:start'),
  airplayStop: call('airplay:stop'),

  addPhotoFromData: call('photos:addFromData'),
  listIcs: call('ics:list'),
  saveIc: call('ics:save'),
  deleteIc: call('ics:delete'),
  loadDemo: call('demo:load'),
  removeDemo: call('demo:remove'),
  saveSamples: call('samples:save'),
  mirrorStatus: call('mirror:status'),
  mirrorStart: call('mirror:start'),
  mirrorBackup: call('mirror:backup'),

  search: call('search'),
  activity: call('stats:activity'),
  aiStep: call('ai:step'),
  licenseStatus: call('license:status'),
  licenseActivate: call('license:activate'),
  licenseWhatsApp: call('license:whatsapp'),
  aiStatus: call('ai:status'),
  recentActivity: call('stats:recent'),
  getSettings: call('settings:get'),
  setSettings: call('settings:set'),

  dataInfo: call('data:info'),
  openDataFolder: call('data:open'),
  backupDatabase: call('data:backup'),
  exportContent: call('data:exportContent'),

  pathForFile: (f: File) => webUtils.getPathForFile(f),

  onOpenFiles(cb: (files: unknown[]) => void) {
    const fn = (_e: unknown, files: unknown[]) => cb(files);
    ipcRenderer.on('open-files', fn);
    return () => ipcRenderer.removeListener('open-files', fn);
  },
};

contextBridge.exposeInMainWorld('fmc', api);
