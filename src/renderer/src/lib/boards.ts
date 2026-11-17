// Boards currently open in tabs, so other parts of the app (the AI assistant)
// can query the same parsed data the viewer shows.
export interface OpenBoard { fileId: string; name: string; modelId: number | null; board: any; at: number }
const open = new Map<string, OpenBoard>();
const listeners = new Set<() => void>();

export function registerBoard(b: Omit<OpenBoard, 'at'>) { open.set(b.fileId, { ...b, at: Date.now() }); listeners.forEach((f) => f()); }
export function unregisterBoard(fileId: string) { open.delete(fileId); listeners.forEach((f) => f()); }
export function touchBoard(fileId: string) { const b = open.get(fileId); if (b) b.at = Date.now(); }
export function openBoards() { return [...open.values()].sort((a, b) => b.at - a.at); }
export function onBoardsChanged(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
