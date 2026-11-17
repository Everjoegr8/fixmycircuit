// pdf.js's viewer module reads the core library from globalThis.pdfjsLib, so
// load the core first, publish it, then import the viewer components.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let cached: Promise<{ pdfjsLib: any; viewer: any }> | null = null;

export function loadPdfJs() {
  if (!cached) {
    cached = (async () => {
      const pdfjsLib: any = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      (globalThis as any).pdfjsLib = pdfjsLib;
      const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs');
      return { pdfjsLib, viewer };
    })();
  }
  return cached;
}
