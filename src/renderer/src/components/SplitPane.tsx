import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Left content plus an optional right pane with a draggable divider. */
export default function SplitPane({ children, right, storageKey }: { children: ReactNode; right: ReactNode | null; storageKey: string }) {
  const [width, setWidth] = useState(() => {
    try { return Number(localStorage.getItem(storageKey)) || 380; } catch { return 380; }
  });
  const dragging = useRef(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !host.current) return;
      const r = host.current.getBoundingClientRect();
      setWidth(Math.min(Math.max(r.right - e.clientX, 260), r.width - 300));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [width, storageKey]);

  return (
    <div ref={host} className="flex h-full w-full">
      <div className="relative min-w-0 flex-1">{children}</div>
      {right && (
        <>
          <div
            className="w-1 shrink-0 cursor-col-resize bg-bench-700 hover:bg-amber-500/60"
            onMouseDown={() => { dragging.current = true; document.body.style.cursor = 'col-resize'; }}
          />
          <div className="shrink-0 overflow-hidden border-l border-bench-700 bg-bench-900" style={{ width }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}
