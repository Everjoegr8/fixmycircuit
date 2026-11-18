import type { Doc } from '../types';
import { Icon } from './Icon';
import ViewMenu from './ViewMenu';

interface Props {
  docs: Doc[];
  activeKey: string | null;
  onSelect: (k: string) => void;
  onClose: (k: string) => void;
  onLibrary: () => void;
  libraryLabel: string;
  showPanel: boolean;
  onTogglePanel: () => void;
  split: boolean;
  onSplit: () => void;
}

const typeIcon = { pdf: 'doc', board: 'board', photo: 'camera' } as const;

export default function TabBar(p: Props) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-bench-700 bg-bench-900">
      <button
        className={`flex items-center gap-1.5 border-r border-bench-700 px-3 ${p.activeKey === null ? 'bg-bench-950 text-amber-200' : 'text-slate-400 hover:text-slate-200'}`}
        onClick={p.onLibrary}
      >
        <Icon name="folder" size={13} /> <span className="max-w-[220px] truncate">{p.libraryLabel}</span>
      </button>
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {p.docs.map((d) => (
          <div
            key={d.key}
            className={`group flex max-w-[240px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-bench-700 pl-3 pr-1 ${d.key === p.activeKey ? 'bg-bench-950 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => p.onSelect(d.key)}
            onMouseDown={(e) => e.button === 1 && p.onClose(d.key)}
            title={d.title}
          >
            <Icon name={typeIcon[d.type]} size={13} />
            <span className="truncate">{d.title}</span>
            <button className="btn-ghost opacity-50 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); p.onClose(d.key); }} aria-label="Close tab">
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>
      {p.activeKey && (
        <button className={`flex items-center gap-1.5 border-l border-bench-700 px-3 ${p.split ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'}`} onClick={p.onSplit} title="Show two documents side by side (for example board photo and schematic)" data-testid="split-btn">
          <Icon name="split" size={14} /> Split
        </button>
      )}
      {p.activeKey && !p.split && (
        <button className={`flex items-center gap-1.5 px-3 ${p.showPanel ? 'text-amber-300' : 'text-slate-400'}`} onClick={p.onTogglePanel} title="Show or hide the repair panel (Ctrl+E)" data-testid="repair-btn">
          <Icon name="panel" size={14} /> Repair panel
        </button>
      )}
      <ViewMenu className="flex items-center gap-1.5 border-l border-bench-700 px-3 text-slate-400 hover:text-slate-200" />
    </div>
  );
}
