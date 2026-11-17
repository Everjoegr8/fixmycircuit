import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';
import { api } from '../api';
import Modal from './Modal';
import { Icon } from './Icon';
import { useTheme, type ThemePref } from '../lib/theme';
import { LicenseSettings, useLicense } from './License';
import { AI_PROVIDERS, providerInfo } from '@shared/aiProviders';
import ToolsPanel from './ToolsPanel';

export default function SettingsDialog({ onClose, onReload }: { onClose: () => void; onReload?: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [info, setInfo] = useState<{ dataDir: string; dbFile: string; version: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [showKey, setShowKey] = useState(false);
  const theme = useTheme();
  const lic = useLicense();

  useEffect(() => {
    api.getSettings().then(setS);
    api.dataInfo().then(setInfo);
  }, []);

  if (!s) return null;
  const prov = providerInfo(s.aiProvider);
  const save = async () => {
    await api.setSettings(s);
    setMsg('Saved.');
    setTimeout(onClose, 400);
  };

  return (
    <Modal title="Settings" onClose={onClose} width={640}>
      <div className="space-y-4">
        <div>
          <label className="label">Technician name (saved with readings, jumpers and guides you add)</label>
          <input className="input" value={s.author} onChange={(e) => setS({ ...s, author: e.target.value })} placeholder="e.g. Tunde – Bench 2" />
        </div>
        <LicenseSettings st={lic} />
        <div>
          <label className="label">Appearance</label>
          <div className="flex overflow-hidden rounded-md border border-bench-600" data-testid="theme-select">
            {(['dark', 'light', 'system'] as ThemePref[]).map((t) => (
              <button key={t} className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 capitalize ${theme.pref === t ? 'bg-amber-500/20 text-amber-200' : 'text-slate-300 hover:bg-bench-800'}`} onClick={() => theme.setPref(t)} data-theme-option={t}>
                <Icon name={t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'gear'} size={13} /> {t === 'system' ? 'Follow Windows' : t}
              </button>
            ))}
          </div>
        </div>
        <div className="card p-3" data-testid="ai-settings">
          <div className="label flex items-center gap-1"><Icon name="sparkle" size={12} /> AI assistant (optional)</div>
          <div className="mb-2 flex items-center gap-2">
            <span className="w-16 text-[12px] text-slate-400">Provider</span>
            <select className="input" value={prov.id} onChange={(e) => setS({ ...s, aiProvider: e.target.value })} data-testid="ai-provider">
              {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {prov.id === 'claude' ? (
            <>
              <div className="flex gap-2">
                <input className="input font-mono" type={showKey ? 'text' : 'password'} value={s.anthropicKey || ''} onChange={(e) => setS({ ...s, anthropicKey: e.target.value.trim() })} placeholder="Claude API key (sk-ant-…)" data-testid="ai-key" />
                <button className="btn" onClick={() => setShowKey((x) => !x)}>{showKey ? 'Hide' : 'Show'}</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="w-16 text-[12px] text-slate-400">Model</span>
                <select className="input" value={s.aiModel || 'claude-opus-5-5'} onChange={(e) => setS({ ...s, aiModel: e.target.value })}>
                  <option value="claude-opus-5-5">Claude Opus 5.5 (most capable)</option>
                  <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (faster, lower cost)</option>
                </select>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Get a key at console.anthropic.com. It is stored only on this PC. When you ask a question, the question and the board data the assistant looks up are sent to the Claude API; usage is billed to your key. If a request is declined by a safety check, it is retried once on Anthropic's recommended fallback model.</p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[12px] text-slate-400">Server</span>
                <input className="input font-mono" value={s.aiBaseUrl || ''} onChange={(e) => setS({ ...s, aiBaseUrl: e.target.value.trim() })} placeholder={prov.baseUrl || 'https://your-server/v1'} data-testid="ai-base-url" />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[12px] text-slate-400">API key</span>
                <input className="input font-mono" type={showKey ? 'text' : 'password'} value={s.aiApiKey || ''} onChange={(e) => setS({ ...s, aiApiKey: e.target.value.trim() })} placeholder={prov.needsKey ? 'Required' : 'Not needed for most local servers'} data-testid="ai-api-key" />
                <button className="btn" onClick={() => setShowKey((x) => !x)}>{showKey ? 'Hide' : 'Show'}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[12px] text-slate-400">Model</span>
                <input className="input font-mono" value={s.aiCustomModel || ''} onChange={(e) => setS({ ...s, aiCustomModel: e.target.value.trim() })} placeholder={prov.modelHint} data-testid="ai-custom-model" />
              </div>
              <p className="text-[11px] text-slate-500">{prov.note} Leave Server empty to use the default address. The model must support tool (function) calling so it can look up the real board. Questions and looked-up board data go to this server; with Ollama they never leave this PC.</p>
            </div>
          )}
        </div>
        <div>
          <label className="label flex items-center gap-1"><Icon name="key" size={12} /> XZZ .pcb key (16 hex digits)</label>
          <input className="input font-mono" value={s.xzzKey} onChange={(e) => setS({ ...s, xzzKey: e.target.value })} placeholder="Needed only for encrypted XZZ .pcb boardviews" />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Icon name="key" size={12} /> FZ key (44 hex words)</label>
          <textarea className="input h-20 font-mono text-[11px]" value={s.fzKey} onChange={(e) => setS({ ...s, fzKey: e.target.value })} placeholder="Needed only for encrypted .fz boardviews" />
          <p className="mt-1 text-[11px] text-slate-500">Like OpenBoardView, FixMyCircuit does not ship these decryption keys. Paste the key you already use in your existing boardview software.</p>
        </div>
        <div className="card p-3" data-testid="tools-settings">
          <div className="label flex items-center gap-1"><Icon name="download" size={12} /> Tools and components</div>
          <ToolsPanel />
        </div>
        <div className="card p-3">
          <div className="label">Offline storage</div>
          <div className="mb-2 break-all font-mono text-[11px] text-slate-400">{info?.dataDir}</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => api.openDataFolder()}><Icon name="folder" size={13} /> Open data folder</button>
            <button className="btn" onClick={async () => { const p = await api.backupDatabase(); if (p) setMsg('Database backed up to ' + p); }}><Icon name="download" size={13} /> Back up database</button>
            <button className="btn" onClick={async () => { const p = await api.exportContent(); if (p) setMsg('Guides, readings and jumpers exported to ' + p); }}><Icon name="download" size={13} /> Export shop guides (JSON)</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Everything (library files, fault solutions, readings, photos and jumpers) is stored in this folder. Copy it, or the backup, to another shop PC to share.</p>
        </div>
        <div className="card p-3">
          <div className="label">Demo workshop</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={async () => { const r = await api.loadDemo(); setMsg(r.error || (r.added ? `Added ${r.added} demo models.` : 'Demo models are already loaded.')); onReload?.(); }}>Load demo models</button>
            <button className="btn" onClick={async () => { const r = await api.removeDemo(); setMsg(`Removed ${r.removed} demo models.`); onReload?.(); }}>Remove demo models</button>
            <button className="btn" onClick={async () => { const d = await api.saveSamples(); if (d) setMsg('Sample files saved to ' + d); }}><Icon name="download" size={13} /> Save sample files…</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">The demo models share one synthetic board, schematic and photo made for testing. They are not real phone layouts.</p>
        </div>
        {msg && <div className="text-amber-200">{msg}</div>}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">FixMyCircuit {info?.version} · free and offline</span>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
