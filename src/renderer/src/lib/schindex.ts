// Schematic text index: which PDF pages mention each part or net name.
// Built once per file with pdf.js text extraction and kept in memory.
import { api } from '../api';
import { loadPdfJs } from '../views/pdf/loadPdfJs';

export interface SchIndex { fileId: string; name: string; pages: number; tokens: Map<string, number[]> }

const cache = new Map<string, Promise<SchIndex | null>>();

export function indexSchematic(fileId: string): Promise<SchIndex | null> {
  let p = cache.get(fileId);
  if (!p) {
    p = (async () => {
      try {
        const { file, bytes } = await api.readFile(fileId);
        const { pdfjsLib } = await loadPdfJs();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
        const tokens = new Map<string, number[]>();
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const tc = await page.getTextContent();
          const seen = new Set<string>();
          for (const it of tc.items as { str?: string }[]) {
            for (const raw of (it.str || '').split(/[\s,;:()[\]{}<>"']+/)) {
              const t = raw.replace(/^[.\-]+|[.\-]+$/g, '').toUpperCase();
              if (t.length < 2 || seen.has(t)) continue;
              seen.add(t);
              const list = tokens.get(t);
              if (list) list.push(n); else tokens.set(t, [n]);
            }
          }
          page.cleanup?.();
        }
        const pages = doc.numPages;
        doc.destroy?.();
        return { fileId, name: file.name, pages, tokens };
      } catch {
        return null;
      }
    })();
    cache.set(fileId, p);
  }
  return p;
}

/** Index every schematic PDF of a model. */
export async function indexModelSchematics(modelId: number | null | undefined): Promise<SchIndex[]> {
  if (modelId == null) return [];
  const files = await api.listFiles(modelId, 'schematic');
  const out = await Promise.all(files.map((f) => indexSchematic(f.id)));
  return out.filter(Boolean) as SchIndex[];
}

export function schematicPages(indexes: SchIndex[], name: string) {
  const u = name.toUpperCase();
  return indexes.map((ix) => ({ fileId: ix.fileId, name: ix.name, pages: ix.tokens.get(u) || [] })).filter((x) => x.pages.length);
}
