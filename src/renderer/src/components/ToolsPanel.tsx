// Tools and components: which helper programs are present, and one-click
// install (verified against the official checksum) for the ones that allow it.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';

type Tool = Awaited<ReturnType<typeof api.listTools>>[number];

const SOURCE: Record<Tool['source'], string> = { bundled: 'Included with the app', downloaded: 'Installed by FixMyCircuit', system: 'Found on this PC', running: 'Running on this PC', missing: 'Missing' };

export function useTools() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const reload = useCallback(() => api.listTools().then(setTools).catch(() => setTools([])), []);
  useEffect(() => { reload(); }, [reload]);
  return { tools, reload };
}

/** Banner + list. `only` limits it to some tools (e.g. the mirror tab). */
export default function ToolsPanel({ only, compact }: { only?: string[]; compact?: boolean }) {
  const { tools, reload } = useTools();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => api.onToolProgress((e) => setMsg((m) => ({ ...m, [e.id]: e.msg }))), []);
  if (!tools) return null;
  const list = tools.filter((t) => !only || only.includes(t.id));
  const install = async (t: Tool) => {
    setBusy(t.id);
    try {
      const r = await api.installTool(t.id);
      setMsg((m) => ({ ...m, [t.id]: `Installed ${r.version}. Checksum verified (SHA-256 ${r.sha256.slice(0, 12)}…).` }));
    } catch (e: any) {
      setMsg((m) => ({ ...m, [t.id]: String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }));
    }
    setBusy('');
    reload();
  };
  const missing = list.filter((t) => !t.found);
  return (
    <div className="space-y-2" data-testid="tools-panel">
      {compact && missing.some((t) => t.canInstall) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-100" data-testid="tools-missing">
          <Icon name="download" size={14} />
          <span className="flex-1">Missing component: {missing.filter((t) => t.canInstall).map((t) => t.label).join(', ')}. Click to download the official release and install it.</span>
          <button className="btn-solid" disabled={!!busy} onClick={() => install(missing.find((t) => t.canInstall)!)} data-testid="tools-install-missing">{busy ? 'Installing…' : 'Install'}</button>
        </div>
      )}
      {list.map((t) => (
        <div key={t.id} className="rounded-md border border-bench-700 p-2" data-testid={`tool-${t.id}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${t.found ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="font-semibold text-slate-100">{t.label}</span>
            <span className={`text-[11px] ${t.found ? 'text-green-300' : 'text-red-300'}`} data-testid="tool-state">{SOURCE[t.source]}</span>
            <div className="flex-1" />
            {t.canInstall && <button className="btn" disabled={!!busy} onClick={() => install(t)} data-testid="tool-install">{busy === t.id ? 'Installing…' : t.found ? 'Update' : 'Install'}</button>}
            {!t.canInstall && !t.found && <button className="btn" onClick={() => api.openUrl(t.url)}>How to get it</button>}
          </div>
          {!compact && <div className="mt-0.5 pl-4 text-[11.5px] text-slate-400">{t.purpose} · {t.license}</div>}
          {!t.found && <div className="mt-0.5 pl-4 text-[11.5px] text-slate-500">{t.howTo}</div>}
          {t.found && !compact && <div className="mt-0.5 truncate pl-4 font-mono text-[10.5px] text-slate-500" title={t.found}>{t.found}</div>}
          {msg[t.id] && <div className="mt-1 pl-4 text-[11.5px] text-amber-200" data-testid="tool-msg">{msg[t.id]}</div>}
        </div>
      ))}
      {!compact && (
        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
          <button className="btn-ghost" onClick={() => api.openToolsFolder()}><Icon name="folder" size={12} /> Tools folder</button>
          Gerber, ODB++ and KiCad import are built in and need nothing extra.
        </div>
      )}
    </div>
  );
}
