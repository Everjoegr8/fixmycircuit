import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

export default function Modal({ title, children, onClose, width = 520 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card max-h-[90vh] w-full overflow-auto p-4 shadow-2xl" style={{ maxWidth: width }} role="dialog" aria-label={title}>
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-base font-semibold text-slate-100">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
