import { useState } from 'react';
import type { Brand } from '@shared/types';
import type { TreeModel } from '../../api';
import AiAssistant from '../../components/AiAssistant';
import { Icon } from '../../components/Icon';
import { lastSession } from '../../lib/session';

interface Props {
  models: TreeModel[];
  brands: Brand[];
  onOpenSettings: () => void;
  onFindOnBoard: (q: string, modelId: number | null) => void;
}

export default function AiToolView(p: Props) {
  const last = lastSession();
  const [modelId, setModelId] = useState<number | null>(() => (last?.modelId != null && p.models.some((m) => m.id === last.modelId) ? last.modelId : p.models[0]?.id ?? null));
  const m = p.models.find((x) => x.id === modelId);
  const label = m ? `${p.brands.find((b) => b.id === m.brand_id)?.name ?? ''} ${m.name}`.trim() : '';
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-6" data-testid="ai-tool">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100"><Icon name="sparkle" size={18} className="text-amber-300" /> AI troubleshooting assistant</h1>
        <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-300">Optional</span>
        <div className="flex-1" />
        <select className="input w-64" value={modelId ?? ''} onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : null)} data-testid="ai-model-select">
          {p.brands.map((b) => (
            <optgroup key={b.id} label={b.name}>
              {p.models.filter((x) => x.brand_id === b.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="mt-1 text-slate-400">Describe the fault in your own words. The assistant looks up the real nets and parts in this device's boardview, your shop readings and saved fixes, then suggests what to measure next. Click any part or net in an answer to see it on the board.</p>
      <div className="card mt-4 min-h-0 flex-1 overflow-hidden">
        <AiAssistant ctx={{ modelId, modelLabel: label, demo: !!m?.demo, focus: {} }} onOpenSettings={p.onOpenSettings} onFindOnBoard={(q) => p.onFindOnBoard(q, modelId)} />
      </div>
    </div>
  );
}
