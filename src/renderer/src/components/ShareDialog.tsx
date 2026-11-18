// "Share to library": a technician packs their own work on one model (photos,
// readings, fault solutions, jumpers, and only files they made themselves) and
// sends it to ERA, who checks it before it joins the online library.
import { useEffect, useState } from 'react';
import { api, type SharePackResult, type ShareSummary } from '../api';
import Modal from './Modal';
import { Icon } from './Icon';
import { DECLARATION, SHARE_EMAIL } from '@shared/sharepack.mjs';

export default function ShareDialog({ modelId, title, onClose }: { modelId: number; title: string; onClose: () => void }) {
  const [sum, setSum] = useState<ShareSummary | null>(null);
  const [contributor, setContributor] = useState('');
  const [contact, setContact] = useState('');
  const [own, setOwn] = useState<Set<string>>(new Set());
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<SharePackResult | null>(null);

  useEffect(() => {
    api.shareSummary(modelId).then(setSum).catch((e) => setErr(String(e?.message || e)));
    api.getSettings().then((s) => setContributor((c) => c || s.author || '')).catch(() => {});
  }, [modelId]);

  const nothing = sum && !sum.photos && !sum.readings && !sum.guides && !own.size;
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.sharePack(modelId, { contributor, contact, declaration: agreed, ownFileIds: [...own] });
      if (r) setDone(r);
    } catch (e: any) {
      setErr(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Share ${title} to the library`} onClose={onClose} width={600}>
      {done ? (
        <div data-testid="share-done">
          <p className="mb-2 text-[13px] text-slate-200">Your pack is saved: <span className="font-mono text-[12px]">{done.path}</span></p>
          <p className="mb-3 text-[12px] text-slate-400">{done.files} photos/files, {done.readings} readings, {done.guides} fault solutions and {done.jumpers} jumpers. Send it to ERA; we check every pack before it goes into the online library, with your name on it.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" data-testid="share-email" onClick={() => api.shareSend({ path: done.path, via: 'email', model: title, contributor })}><Icon name="send" size={13} /> Email to {SHARE_EMAIL}</button>
            <button className="btn" data-testid="share-whatsapp" onClick={() => api.shareSend({ path: done.path, via: 'whatsapp', model: title, contributor })}><Icon name="phone" size={13} /> Send on WhatsApp</button>
            <button className="btn-ghost ml-auto" onClick={onClose}>Close</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">The folder with the pack opens too, so you can attach the zip.</p>
        </div>
      ) : (
        <div className="space-y-3 text-[12.5px]">
          <p className="text-slate-400">Share the work you did on this phone so other techs can use it. You get the credit. Only share what you made yourself.</p>
          {sum && (
            <div className="rounded border border-bench-700 p-2 text-slate-300" data-testid="share-summary">
              Included: <b>{sum.photos}</b> board photos, <b>{sum.readings}</b> readings, <b>{sum.guides}</b> fault solutions, <b>{sum.jumpers}</b> jumpers.
            </div>
          )}
          {sum && sum.files.length > 0 && (
            <div>
              <div className="mb-1 text-slate-300">Board and schematic files are left out unless you made them yourself:</div>
              {sum.files.map((f) => (
                <label key={f.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={own.has(f.id)} onChange={(e) => { const n = new Set(own); if (e.target.checked) n.add(f.id); else n.delete(f.id); setOwn(n); }} />
                  <span className="truncate">{f.name}</span><span className="text-slate-500">I made this file myself</span>
                </label>
              ))}
              <div className="mt-1 text-[11px] text-amber-300/90">Never tick files from ZXW, Borneo, JC, WUXINJI, download sites or manufacturers. They will be refused.</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-slate-400">Your name or shop name (for the credit)</span>
              <input className="input mt-0.5 w-full" data-testid="share-name" value={contributor} onChange={(e) => setContributor(e.target.value)} /></label>
            <label className="block"><span className="text-slate-400">Phone or email (so ERA can reach you)</span>
              <input className="input mt-0.5 w-full" data-testid="share-contact" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          </div>
          <label className="flex items-start gap-2 rounded border border-bench-700 p-2">
            <input type="checkbox" className="mt-0.5" data-testid="share-agree" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="text-slate-300">{DECLARATION}</span>
          </label>
          {err && <div className="text-red-300" data-testid="share-error">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-primary" data-testid="share-save" disabled={busy || !agreed || !contributor.trim() || !!nothing} onClick={save}><Icon name="download" size={13} /> {busy ? 'Packing…' : 'Save share pack'}</button>
            <button className="btn-ghost ml-auto" onClick={onClose}>Cancel</button>
          </div>
          {nothing && <div className="text-[11px] text-slate-500">Add a board photo, a reading or a fault solution first.</div>}
        </div>
      )}
    </Modal>
  );
}
