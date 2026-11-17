import type { ToolInfo } from '../../main/tools';
import type { LicenseStatus } from '@shared/license';
import type { Brand, CopperLayer, Guide, IcXref, Jumper, LibraryFile, Model, Photo, Reading, Settings, ImportRequest } from '@shared/types';

export type TreeModel = Model & {
  demo?: number; files: number; guides: number; readings: number; photos: number;
  schematics: number; boardviews: number; jumpers: number; photo_file: string | null; last_activity: string | null;
};
export type DayCount = { d: string; n: number };
export type ActivityItem = { type: 'file' | 'guide' | 'photo' | 'reading'; sub: string; ref: string; title: string; model_id: number | null; at: string };

export interface FmcApi {
  tree(): Promise<{ brands: Brand[]; models: TreeModel[] }>;
  addBrand(name: string): Promise<Brand>;
  addModel(brandId: number, name: string): Promise<Model>;
  renameModel(id: number, name: string): Promise<void>;
  deleteModel(id: number): Promise<void>;
  listFiles(modelId?: number | null, kind?: string): Promise<LibraryFile[]>;
  pickFiles(filters?: { name: string; extensions: string[] }[]): Promise<string[]>;
  importFiles(req: ImportRequest): Promise<LibraryFile[]>;
  readFile(id: string): Promise<{ file: LibraryFile; bytes: Uint8Array; extras: Record<string, Uint8Array> }>;
  updateFile(id: string, patch: Partial<LibraryFile>): Promise<LibraryFile>;
  deleteFile(id: string): Promise<void>;
  revealFile(id: string): Promise<void>;
  listGuides(modelId?: number | null, q?: string): Promise<Guide[]>;
  saveGuide(g: Partial<Guide> & { title: string }): Promise<Guide>;
  deleteGuide(id: number): Promise<void>;
  listReadings(filter?: { model_id?: number | null; photo_id?: number; net?: string; part?: string }): Promise<Reading[]>;
  saveReading(r: Partial<Reading>): Promise<Reading>;
  deleteReading(id: number): Promise<void>;
  listPhotos(modelId?: number | null): Promise<Photo[]>;
  getPhoto(id: number): Promise<Photo | undefined>;
  updatePhoto(id: number, patch: Partial<Photo>): Promise<Photo>;
  deletePhoto(id: number): Promise<void>;
  listJumpers(photoId: number): Promise<Jumper[]>;
  saveJumper(j: Partial<Jumper> & { photo_id: number; points: { x: number; y: number }[] }): Promise<Jumper>;
  deleteJumper(id: number): Promise<void>;
  listCopper(fileId: string): Promise<CopperLayer[]>;
  addCopper(c: Omit<CopperLayer, 'id' | 'created_at'>): Promise<{ id: number }>;
  deleteCopper(id: number): Promise<void>;
  readGerbers(paths?: string[]): Promise<{ name: string; text: string }[]>;
  verifyIc(id: number, on: boolean): Promise<IcXref>;
  listTools(): Promise<ToolInfo[]>;
  installTool(id: string): Promise<{ path: string; version: string; sha256: string }>;
  openToolsFolder(): Promise<string>;
  openUrl(url: string): Promise<void>;
  onToolProgress(f: (e: { id: string; msg: string }) => void): () => void;
  airplayStatus(): Promise<{ uxplay: string | null; running: boolean }>;
  airplayStart(opts?: { name?: string; pin?: boolean }): Promise<{ running: boolean }>;
  airplayStop(): Promise<{ running: boolean }>;
  addPhotoFromData(req: { model_id: number | null; dataUrl: string; title: string; guide_id?: number | null }): Promise<Photo>;
  listIcs(q?: string): Promise<IcXref[]>;
  saveIc(r: Partial<IcXref> & { ic: string }): Promise<IcXref>;
  deleteIc(id: number): Promise<void>;
  loadDemo(): Promise<{ added: number; error?: string }>;
  removeDemo(): Promise<{ removed: number }>;
  saveSamples(): Promise<string | null>;
  mirrorStatus(): Promise<{ scrcpy: string | null; adb: string | null; devices: { serial: string; state: string; model: string }[] }>;
  mirrorStart(opts: { serial?: string; turnScreenOff?: boolean; stayAwake?: boolean; record?: boolean; maxSize?: number }): Promise<{ started: boolean }>;
  mirrorBackup(req: { serial?: string; remote: string }): Promise<{ ok: boolean; out: string; dest: string } | null>;
  search(q: string): Promise<{ models: { id: number; name: string; brand: string }[]; files: LibraryFile[]; guides: Guide[]; readings: Reading[] }>;
  activity(days?: number): Promise<{ files: DayCount[]; guides: DayCount[]; readings: DayCount[]; photos: DayCount[] }>;
  recentActivity(limit?: number): Promise<ActivityItem[]>;
  aiStep(req: { system: string; messages: any[]; tools: any[] }): Promise<{ content: any[]; stop_reason: string | null; refusal?: string; model: string; usage?: { input_tokens: number; output_tokens: number } }>;
  licenseStatus(): Promise<LicenseStatus>;
  licenseActivate(key: string): Promise<{ ok: boolean; reason?: string; status: LicenseStatus }>;
  licenseWhatsApp(text: string): Promise<void>;
  aiStatus(): Promise<{ configured: boolean; model: string; mock: boolean }>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  dataInfo(): Promise<{ dataDir: string; libDir: string; dbFile: string; version: string }>;
  openDataFolder(): Promise<void>;
  backupDatabase(): Promise<string | null>;
  exportContent(): Promise<string | null>;
  pathForFile(f: File): string;
  onOpenFiles(cb: (files: LibraryFile[]) => void): () => void;
}

declare global {
  interface Window {
    fmc: FmcApi;
  }
}

export const api: FmcApi = window.fmc;
export const fileUrl = (id: string) => `fmc://file/${id}`;
