import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from './Modal';
import { AppMark, EraMark } from '../brand/Logo';
import { PHOTO_CREDITS } from '../assets/photos';

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState('');
  useEffect(() => { api.dataInfo().then((i) => setVersion(i.version)); }, []);
  return (
    <Modal title="About FixMyCircuit" onClose={onClose} width={620}>
      <div className="flex items-center gap-4" data-testid="about">
        <AppMark size={72} animated />
        <div>
          <div className="font-display text-2xl font-semibold text-slate-100">Fix<span className="text-amber-300">My</span>Circuit</div>
          <div className="text-slate-400">Find the fault. Fix with confidence.</div>
          <div className="mt-1 text-[12px] text-slate-500">Version {version} · free and offline</div>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-bench-700 bg-bench-900 p-3">
        <EraMark size={44} animated />
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">A product of</div>
          <div className="text-[16px] font-semibold text-slate-100">ERA Technologiz and Engineering Services</div>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-[12.5px] text-slate-300">
        <p>FixMyCircuit is a repair workbench for phone technicians: schematics, boardviews, board photos, readings and fault guides in one place, all stored on this PC.</p>
        <p className="text-slate-400">Boardview readers are ported from OpenBoardView (MIT). Screen mirroring uses scrcpy (Apache 2.0). The optional AI assistant uses the Claude API with your own key; nothing else leaves this PC.</p>
      </div>
      <div className="mt-4">
        <div className="label">Photo credits</div>
        <ul className="space-y-1 text-[11.5px] text-slate-400">
          {PHOTO_CREDITS.map((c) => (
            <li key={c.file}><span className="text-slate-200">{c.title}</span> by {c.author}, {c.license}. <span className="text-slate-500">{c.source}</span>{c.changes ? <span className="text-slate-500"> ({c.changes})</span> : null}</li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
