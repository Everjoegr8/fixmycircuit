import type { Brand, Guide, Jumper, LibraryFile, Model, Photo, Reading, Settings, ImportRequest } from '@shared/types';

export type TreeModel = Model & { files: number; guides: number; readings: number; photos: number };

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
  search(q: string): Promise<{ models: { id: number; name: string; brand: string }[]; files: LibraryFile[]; guides: Guide[]; readings: Reading[] }>;
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
