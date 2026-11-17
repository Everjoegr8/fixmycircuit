import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';
import { api } from '../api';
import Modal from './Modal';
import { Icon } from './Icon';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [info, setInfo] = useState<{ dataDir: string; dbFile: string; version: string } | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getSettings().then(setS);
    api.dataInfo().then(setInfo);
  }, []);

  if (!s) return null;
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
        <div>
          <label className="label flex items-center gap-1"><Icon name="key" size={12} /> XZZ .pcb key (16 hex digits)</label>
          <input className="input font-mono" value={s.xzzKey} onChange={(e) => setS({ ...s, xzzKey: e.target.value })} placeholder="Needed only for encrypted XZZ .pcb boardviews" />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Icon name="key" size={12} /> FZ key (44 hex words)</label>
          <textarea className="input h-20 font-mono text-[11px]" value={s.fzKey} onChange={(e) => setS({ ...s, fzKey: e.target.value })} placeholder="Needed only for encrypted .fz boardviews" />
          <p className="mt-1 text-[11px] text-slate-500">Like OpenBoardView, FixMyCircuit does not ship these decryption keys. Paste the key you already use in your existing boardview software.</p>
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
