// Tiny event bus for split-screen sync between two open documents.
export type SyncEvent =
  | { type: 'view'; source: string; cx: number; cy: number; upp: number } // board coords at pane centre, board units per pixel
  | { type: 'zoom'; source: string; factor: number; pdf?: boolean };

type Fn = (e: SyncEvent) => void;
const subs = new Set<Fn>();

export const syncBus = {
  emit(e: SyncEvent) {
    for (const f of subs) f(e);
  },
  on(f: Fn) {
    subs.add(f);
    return () => { subs.delete(f); };
  },
};

/** Board coordinates covered by an aligned photo, or null. */
export function parseAlign(s: string | undefined | null): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!s) return null;
  try {
    const a = JSON.parse(s);
    return [a.x0, a.y0, a.x1, a.y1].every((v) => typeof v === 'number') && a.x1 !== a.x0 && a.y1 !== a.y0 ? a : null;
  } catch {
    return null;
  }
}
