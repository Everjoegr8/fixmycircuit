// SQLite storage (better-sqlite3). Everything lives in the user's data folder so
// the app works fully offline.
import Database from 'better-sqlite3';
import { BRAND_SEED } from '../shared/types';
import { IC_XREF_STARTER } from '../shared/icxref';
import type { Guide, Jumper, Reading, Photo, LibraryFile, Settings } from '../shared/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (brand_id, name)
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  model_id INTEGER REFERENCES models(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY,
  model_id INTEGER REFERENCES models(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  symptom TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '',
  parts TEXT NOT NULL DEFAULT '',
  nets TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  model_id INTEGER REFERENCES models(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL DEFAULT 'top',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY,
  model_id INTEGER REFERENCES models(id) ON DELETE CASCADE,
  photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE,
  x REAL, y REAL,
  type TEXT NOT NULL DEFAULT 'diode',
  part TEXT NOT NULL DEFAULT '',
  pin TEXT NOT NULL DEFAULT '',
  net TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#f5a524',
  note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jumpers (
  id INTEGER PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  points TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ef4444',
  label TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS copper_layers (
  id INTEGER PRIMARY KEY,
  file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'top',
  method TEXT NOT NULL DEFAULT '',
  traces TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ic_xref (
  id INTEGER PRIMARY KEY,
  ic TEXT NOT NULL,
  function TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  used_in TEXT NOT NULL DEFAULT '',
  alternatives TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'shop'
);
CREATE INDEX IF NOT EXISTS idx_files_model ON files(model_id);
CREATE INDEX IF NOT EXISTS idx_guides_model ON guides(model_id);
CREATE INDEX IF NOT EXISTS idx_readings_model ON readings(model_id);
CREATE INDEX IF NOT EXISTS idx_readings_net ON readings(net);
CREATE INDEX IF NOT EXISTS idx_readings_part ON readings(part);
`;

export type DB = ReturnType<typeof openDb>;

export function openDb(file: string) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Columns added after v0.1.0.
  const addCol = (table: string, col: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('jumpers', 'layer', "TEXT NOT NULL DEFAULT ''");
  addCol('jumpers', 'kind', "TEXT NOT NULL DEFAULT 'jumper'");
  addCol('jumpers', 'net', "TEXT NOT NULL DEFAULT ''");
  addCol('guides', 'photo_ids', "TEXT NOT NULL DEFAULT ''");
  addCol('photos', 'align', "TEXT NOT NULL DEFAULT ''");
  addCol('models', 'demo', 'INTEGER NOT NULL DEFAULT 0');
  addCol('ic_xref', 'verified_by', "TEXT NOT NULL DEFAULT ''");
  addCol('ic_xref', 'verified_at', "TEXT NOT NULL DEFAULT ''");
  if (!(db.prepare('SELECT COUNT(*) AS n FROM ic_xref').get() as { n: number }).n) {
    const ins = db.prepare("INSERT INTO ic_xref(ic, function, platform, used_in, alternatives, notes, source) VALUES (@ic, @function, @platform, @used_in, @alternatives, @notes, 'starter')");
    for (const r of IC_XREF_STARTER) ins.run({ platform: '', used_in: '', alternatives: '', notes: '', ...r });
  }
  const insBrand = db.prepare('INSERT OR IGNORE INTO brands(name) VALUES (?)');
  for (const b of BRAND_SEED) insBrand.run(b);

  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  const api = {
    raw: db,

    // --- tree --------------------------------------------------------------
    tree() {
      const brands = db.prepare('SELECT id, name FROM brands ORDER BY name').all();
      const models = db
        .prepare(
          `SELECT m.id, m.brand_id, m.name, m.demo,
            (SELECT COUNT(*) FROM files f WHERE f.model_id = m.id AND f.kind != 'photo') AS files,
            (SELECT COUNT(*) FROM guides g WHERE g.model_id = m.id) AS guides,
            (SELECT COUNT(*) FROM readings r WHERE r.model_id = m.id) AS readings,
            (SELECT COUNT(*) FROM photos p WHERE p.model_id = m.id) AS photos,
            (SELECT COUNT(*) FROM files f WHERE f.model_id = m.id AND f.kind = 'schematic') AS schematics,
            (SELECT COUNT(*) FROM files f WHERE f.model_id = m.id AND f.kind = 'boardview') AS boardviews,
            (SELECT COUNT(*) FROM jumpers j JOIN photos p ON p.id = j.photo_id WHERE p.model_id = m.id) AS jumpers,
            (SELECT p.file_id FROM photos p WHERE p.model_id = m.id ORDER BY p.id LIMIT 1) AS photo_file,
            (SELECT MAX(t) FROM (SELECT MAX(added_at) t FROM files WHERE model_id = m.id UNION ALL SELECT MAX(updated_at) FROM guides WHERE model_id = m.id UNION ALL SELECT MAX(created_at) FROM readings WHERE model_id = m.id)) AS last_activity
           FROM models m ORDER BY m.name`,
        )
        .all();
      return { brands, models };
    },
    /** Items added per day over the last `days` days, for the Home sparklines. */
    activity(days = 14) {
      const q = (sql: string) => db.prepare(sql).all(`-${days} days`) as { d: string; n: number }[];
      return {
        files: q("SELECT date(added_at) d, COUNT(*) n FROM files WHERE kind != 'photo' AND added_at >= datetime('now', ?) GROUP BY d"),
        guides: q("SELECT date(updated_at) d, COUNT(*) n FROM guides WHERE updated_at >= datetime('now', ?) GROUP BY d"),
        readings: q("SELECT date(created_at) d, COUNT(*) n FROM readings WHERE created_at >= datetime('now', ?) GROUP BY d"),
        photos: q("SELECT date(created_at) d, COUNT(*) n FROM photos WHERE created_at >= datetime('now', ?) GROUP BY d"),
      };
    },
    recentActivity(limit = 10) {
      return db.prepare(
        `SELECT * FROM (
           SELECT 'file' AS type, f.kind AS sub, f.id AS ref, f.name AS title, f.model_id, f.added_at AS at FROM files f WHERE f.kind != 'photo'
           UNION ALL SELECT 'guide', '', CAST(g.id AS TEXT), g.title, g.model_id, g.updated_at FROM guides g
           UNION ALL SELECT 'photo', '', CAST(p.id AS TEXT), p.title, p.model_id, p.created_at FROM photos p
           UNION ALL SELECT 'reading', r.type, CAST(r.id AS TEXT), trim(r.part || CASE WHEN r.pin != '' THEN '.' || r.pin ELSE '' END || ' ' || r.net || ' ' || r.value), r.model_id, r.created_at FROM readings r
         ) ORDER BY at DESC LIMIT ?`,
      ).all(limit);
    },
    addBrand(name: string) {
      insBrand.run(name.trim());
      return db.prepare('SELECT id, name FROM brands WHERE name = ?').get(name.trim());
    },
    addModel(brandId: number, name: string) {
      db.prepare('INSERT OR IGNORE INTO models(brand_id, name) VALUES (?, ?)').run(brandId, name.trim());
      return db.prepare('SELECT id, brand_id, name FROM models WHERE brand_id = ? AND name = ?').get(brandId, name.trim());
    },
    renameModel(id: number, name: string) {
      db.prepare('UPDATE models SET name = ? WHERE id = ?').run(name.trim(), id);
    },
    deleteModel(id: number) {
      db.prepare('DELETE FROM models WHERE id = ?').run(id);
    },

    // --- files -------------------------------------------------------------
    listFiles(modelId: number | null | undefined, kind?: string): LibraryFile[] {
      const where: string[] = [];
      const args: unknown[] = [];
      if (modelId !== undefined) {
        if (modelId === null) where.push('model_id IS NULL');
        else { where.push('model_id = ?'); args.push(modelId); }
      }
      if (kind) { where.push('kind = ?'); args.push(kind); }
      return db.prepare(`SELECT * FROM files ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`).all(...args) as LibraryFile[];
    },
    getFile(id: string) {
      return db.prepare('SELECT * FROM files WHERE id = ?').get(id) as LibraryFile | undefined;
    },
    addFile(f: Omit<LibraryFile, 'added_at' | 'notes'> & { notes?: string }) {
      db.prepare('INSERT INTO files(id, model_id, kind, name, ext, size, notes, extra) VALUES (@id, @model_id, @kind, @name, @ext, @size, @notes, @extra)').run({ notes: '', ...f });
      return api.getFile(f.id)!;
    },
    updateFile(id: string, patch: Partial<Pick<LibraryFile, 'model_id' | 'kind' | 'name' | 'notes'>>) {
      const cols = Object.keys(patch).filter((k) => ['model_id', 'kind', 'name', 'notes'].includes(k));
      if (!cols.length) return api.getFile(id);
      db.prepare(`UPDATE files SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
      return api.getFile(id);
    },
    deleteFile(id: string) {
      db.prepare('DELETE FROM files WHERE id = ?').run(id);
    },

    // --- guides ------------------------------------------------------------
    listGuides(modelId?: number | null, q?: string): Guide[] {
      const where: string[] = [];
      const args: unknown[] = [];
      if (modelId !== undefined && modelId !== null) { where.push('model_id = ?'); args.push(modelId); }
      if (q) {
        where.push('(title LIKE ? OR symptom LIKE ? OR steps LIKE ? OR parts LIKE ? OR nets LIKE ?)');
        const like = `%${q}%`;
        args.push(like, like, like, like, like);
      }
      return db.prepare(`SELECT * FROM guides ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`).all(...args) as Guide[];
    },
    saveGuide(g: Partial<Guide> & { title: string }) {
      const row = { model_id: null, symptom: '', steps: '', parts: '', nets: '', author: '', photo_ids: '', ...g, updated_at: now() };
      if (g.id) {
        db.prepare('UPDATE guides SET model_id=@model_id, title=@title, symptom=@symptom, steps=@steps, parts=@parts, nets=@nets, author=@author, photo_ids=@photo_ids, updated_at=@updated_at WHERE id=@id').run(row);
        return db.prepare('SELECT * FROM guides WHERE id = ?').get(g.id) as Guide;
      }
      const r = db.prepare('INSERT INTO guides(model_id, title, symptom, steps, parts, nets, author, photo_ids, updated_at) VALUES (@model_id, @title, @symptom, @steps, @parts, @nets, @author, @photo_ids, @updated_at)').run(row);
      return db.prepare('SELECT * FROM guides WHERE id = ?').get(r.lastInsertRowid) as Guide;
    },
    deleteGuide(id: number) {
      db.prepare('DELETE FROM guides WHERE id = ?').run(id);
    },

    // --- readings ----------------------------------------------------------
    listReadings(filter: { model_id?: number | null; photo_id?: number; net?: string; part?: string }): Reading[] {
      const where: string[] = [];
      const args: unknown[] = [];
      if (filter.model_id != null) { where.push('model_id = ?'); args.push(filter.model_id); }
      if (filter.photo_id != null) { where.push('photo_id = ?'); args.push(filter.photo_id); }
      if (filter.net) { where.push('net = ? COLLATE NOCASE'); args.push(filter.net); }
      if (filter.part) { where.push('part = ? COLLATE NOCASE'); args.push(filter.part); }
      return db.prepare(`SELECT * FROM readings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY part, pin, id`).all(...args) as Reading[];
    },
    saveReading(r: Partial<Reading>) {
      const row = { model_id: null, photo_id: null, x: null, y: null, type: 'diode', part: '', pin: '', net: '', value: '', color: '#f5a524', note: '', author: '', ...r };
      if (r.id) {
        db.prepare('UPDATE readings SET model_id=@model_id, photo_id=@photo_id, x=@x, y=@y, type=@type, part=@part, pin=@pin, net=@net, value=@value, color=@color, note=@note, author=@author WHERE id=@id').run(row);
        return db.prepare('SELECT * FROM readings WHERE id = ?').get(r.id) as Reading;
      }
      const res = db.prepare('INSERT INTO readings(model_id, photo_id, x, y, type, part, pin, net, value, color, note, author) VALUES (@model_id, @photo_id, @x, @y, @type, @part, @pin, @net, @value, @color, @note, @author)').run(row);
      return db.prepare('SELECT * FROM readings WHERE id = ?').get(res.lastInsertRowid) as Reading;
    },
    deleteReading(id: number) {
      db.prepare('DELETE FROM readings WHERE id = ?').run(id);
    },

    // --- photos & jumpers --------------------------------------------------
    listPhotos(modelId?: number | null): Photo[] {
      if (modelId == null) return db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all() as Photo[];
      return db.prepare('SELECT * FROM photos WHERE model_id = ? ORDER BY created_at DESC').all(modelId) as Photo[];
    },
    getPhoto(id: number) {
      return db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as Photo | undefined;
    },
    addPhoto(p: { model_id: number | null; file_id: string; title: string; side?: string }) {
      const r = db.prepare('INSERT INTO photos(model_id, file_id, title, side) VALUES (@model_id, @file_id, @title, @side)').run({ side: 'top', ...p });
      return api.getPhoto(Number(r.lastInsertRowid))!;
    },
    updatePhoto(id: number, patch: Partial<Pick<Photo, 'title' | 'side' | 'model_id' | 'align'>>) {
      const cols = Object.keys(patch).filter((k) => ['title', 'side', 'model_id', 'align'].includes(k));
      if (cols.length) db.prepare(`UPDATE photos SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
      return api.getPhoto(id);
    },
    deletePhoto(id: number) {
      const p = api.getPhoto(id);
      db.prepare('DELETE FROM photos WHERE id = ?').run(id);
      return p;
    },
    listJumpers(photoId: number): Jumper[] {
      return (db.prepare('SELECT * FROM jumpers WHERE photo_id = ? ORDER BY id').all(photoId) as any[]).map((j) => ({ ...j, points: JSON.parse(j.points) }));
    },
    saveJumper(j: Partial<Jumper> & { photo_id: number; points: { x: number; y: number }[] }) {
      const row = { color: '#ef4444', label: '', note: '', author: '', layer: '', kind: 'jumper', net: '', ...j, points: JSON.stringify(j.points) };
      let id = j.id;
      if (id) db.prepare('UPDATE jumpers SET points=@points, color=@color, label=@label, note=@note, author=@author, layer=@layer, kind=@kind, net=@net WHERE id=@id').run(row);
      else id = Number(db.prepare('INSERT INTO jumpers(photo_id, points, color, label, note, author, layer, kind, net) VALUES (@photo_id, @points, @color, @label, @note, @author, @layer, @kind, @net)').run(row).lastInsertRowid);
      const out = db.prepare('SELECT * FROM jumpers WHERE id = ?').get(id) as any;
      return { ...out, points: JSON.parse(out.points) } as Jumper;
    },
    deleteJumper(id: number) {
      db.prepare('DELETE FROM jumpers WHERE id = ?').run(id);
    },
    // --- copper layers (Gerber) placed on a boardview -----------------------
    listCopper(fileId: string) {
      return (db.prepare('SELECT * FROM copper_layers WHERE file_id = ? ORDER BY id').all(fileId) as any[]).map((r) => ({ ...r, traces: JSON.parse(r.traces) }));
    },
    addCopper(c: { file_id: string; name: string; side: string; method: string; traces: unknown[] }) {
      const id = Number(db.prepare('INSERT INTO copper_layers(file_id, name, side, method, traces) VALUES (@file_id, @name, @side, @method, @traces)').run({ ...c, traces: JSON.stringify(c.traces) }).lastInsertRowid);
      return { id };
    },
    deleteCopper(id: number) {
      db.prepare('DELETE FROM copper_layers WHERE id = ?').run(id);
    },

    // --- IC cross-reference ------------------------------------------------
    listIcs(q?: string) {
      if (!q) return db.prepare('SELECT * FROM ic_xref ORDER BY function, ic').all();
      const like = `%${q}%`;
      return db.prepare('SELECT * FROM ic_xref WHERE ic LIKE ? OR function LIKE ? OR platform LIKE ? OR used_in LIKE ? OR alternatives LIKE ? OR notes LIKE ? ORDER BY function, ic').all(like, like, like, like, like, like);
    },
    saveIc(r: any) {
      const row = { function: '', platform: '', used_in: '', alternatives: '', notes: '', source: 'shop', ...r };
      if (r.id) db.prepare('UPDATE ic_xref SET ic=@ic, function=@function, platform=@platform, used_in=@used_in, alternatives=@alternatives, notes=@notes, source=@source WHERE id=@id').run(row);
      else row.id = Number(db.prepare('INSERT INTO ic_xref(ic, function, platform, used_in, alternatives, notes, source) VALUES (@ic, @function, @platform, @used_in, @alternatives, @notes, @source)').run(row).lastInsertRowid);
      return db.prepare('SELECT * FROM ic_xref WHERE id = ?').get(row.id);
    },
    /** A technician confirms (or un-confirms) an IC entry from a real board. */
    verifyIc(id: number, by: string, on: boolean) {
      if (on) db.prepare("UPDATE ic_xref SET verified_by = ?, verified_at = datetime('now') WHERE id = ?").run(by || 'technician', id);
      else db.prepare("UPDATE ic_xref SET verified_by = '', verified_at = '' WHERE id = ?").run(id);
      return db.prepare('SELECT * FROM ic_xref WHERE id = ?').get(id);
    },
    deleteIc(id: number) {
      db.prepare('DELETE FROM ic_xref WHERE id = ?').run(id);
    },

    // --- demo models ---------------------------------------------------------
    markDemo(modelId: number) {
      db.prepare('UPDATE models SET demo = 1 WHERE id = ?').run(modelId);
    },
    demoModels() {
      return db.prepare('SELECT id FROM models WHERE demo = 1').all() as { id: number }[];
    },
    filesOfModel(modelId: number) {
      return db.prepare('SELECT id FROM files WHERE model_id = ?').all(modelId) as { id: string }[];
    },

    // --- search across everything -------------------------------------------
    search(q: string) {
      const like = `%${q}%`;
      return {
        models: db.prepare(`SELECT m.id, m.name, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.name LIKE ? OR b.name LIKE ? LIMIT 30`).all(like, like),
        files: db.prepare('SELECT * FROM files WHERE name LIKE ? LIMIT 30').all(like),
        guides: db.prepare('SELECT * FROM guides WHERE title LIKE ? OR symptom LIKE ? OR steps LIKE ? OR parts LIKE ? OR nets LIKE ? LIMIT 30').all(like, like, like, like, like),
        readings: db.prepare('SELECT * FROM readings WHERE part LIKE ? OR net LIKE ? OR note LIKE ? LIMIT 50').all(like, like, like),
      };
    },

    // --- settings ----------------------------------------------------------
    getSettings(): Settings {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      const s: Settings = { fzKey: '', xzzKey: '', author: '' };
      for (const r of rows) (s as any)[r.key] = r.value;
      return s;
    },
    setSettings(patch: Partial<Settings>) {
      const st = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(patch)) st.run(k, String(v ?? ''));
      return api.getSettings();
    },

    // --- export / import of shop-made content (guides, readings, jumpers) ----
    exportContent() {
      const models = db.prepare('SELECT m.id, m.name, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id').all();
      return {
        app: 'FixMyCircuit',
        version: 1,
        exported_at: now(),
        models,
        guides: db.prepare('SELECT * FROM guides').all(),
        readings: db.prepare('SELECT * FROM readings').all(),
        photos: db.prepare('SELECT * FROM photos').all(),
        jumpers: db.prepare('SELECT * FROM jumpers').all(),
      };
    },
  };
  return api;
}
