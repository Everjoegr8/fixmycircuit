// Phone screen mirror (scrcpy) and file backup (adb pull) for phones with broken screens.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';

type Status = Awaited<ReturnType<typeof api.mirrorStatus>>;

const BACKUPS = [
  { remote: '/sdcard/DCIM', label: 'Photos and videos (DCIM)' },
  { remote: '/sdcard/Pictures', label: 'Pictures (screenshots, WhatsApp images…)' },
  { remote: '/sdcard/Download', label: 'Downloads' },
  { remote: '/sdcard/Documents', label: 'Documents' },
  { remote: '/sdcard/', label: 'Whole internal storage (slow)' },
];

export default function MirrorView() {
  const [st, setSt] = useState<Status | null>(null);
  const [serial, setSerial] = useState('');
  const [opts, setOpts] = useState({ turnScreenOff: false, stayAwake: true, record: false, maxSize: 1280 });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const s = await api.mirrorStatus();
    setSt(s);
    if (!serial && s.devices[0]) setSerial(s.devices[0].serial);
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setMsg('');
    try { await api.mirrorStart({ serial: serial || undefined, ...opts }); setMsg('Mirror window opening. Use your mouse and keyboard to control the phone.'); }
    catch (e: any) { setMsg(e?.message || String(e)); }
  };
  const backup = async (remote: string) => {
    setBusy(true);
    setMsg(`Copying ${remote}… this can take a while.`);
    try {
      const r = await api.mirrorBackup({ serial: serial || undefined, remote });
      setMsg(!r ? '' : r.ok ? `Backed up to ${r.dest}` : `Backup had problems: ${r.out.slice(-400)}`);
    } catch (e: any) { setMsg(e?.message || String(e)); }
    setBusy(false);
  };

  const ready = st?.devices.find((d) => d.serial === serial)?.state === 'device';

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100"><Icon name="phone" size={18} className="text-amber-300" /> Phone screen mirror &amp; backup</h1>
      <p className="mt-1 text-slate-400">Show and control an Android phone's screen on this PC (great for a cracked or dead display), then copy the customer's photos and files off before you work on the board. Uses scrcpy and adb, both free and open source.</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="label">Tools</div>
          <div className="space-y-1 font-mono text-[12px]">
            <div className={st?.scrcpy ? 'text-green-300' : 'text-red-300'}>{st?.scrcpy ? '✓ scrcpy found' : '✗ scrcpy not found'}</div>
            <div className={st?.adb ? 'text-green-300' : 'text-red-300'}>{st?.adb ? '✓ adb found' : '✗ adb not found'}</div>
          </div>
          {st && (!st.scrcpy || !st.adb) && <p className="mt-2 text-[12px] text-slate-400">The Windows installer includes both. On other systems install scrcpy (it brings adb), then press Refresh.</p>}
          <div className="label mt-4">Connected phones</div>
          {!st?.devices.length && <div className="text-slate-500">No phone found yet.</div>}
          {st?.devices.map((d) => (
            <label key={d.serial} className="flex cursor-pointer items-center gap-2 py-0.5">
              <input type="radio" checked={serial === d.serial} onChange={() => setSerial(d.serial)} />
              <span className="text-slate-200">{d.model || d.serial}</span>
              <span className={`chip ${d.state === 'device' ? 'text-green-300' : 'text-amber-300'}`}>{d.state === 'device' ? 'ready' : d.state}</span>
            </label>
          ))}
          <button className="btn mt-3" onClick={refresh}>Refresh</button>
        </div>
        <div className="card p-4">
          <div className="label">Before you start</div>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-slate-300">
            <li>On the phone: Settings → About phone → tap Build number 7 times, then turn on USB debugging in Developer options.</li>
            <li>Connect with a data USB cable and accept the "Allow USB debugging" prompt.</li>
            <li>If it shows <span className="chip">unauthorized</span>, the prompt is waiting on the phone screen.</li>
          </ol>
          <p className="mt-2 text-[11.5px] text-slate-500">With a fully black screen and debugging off you cannot accept the prompt; an OTG mouse or a temporary screen is needed first. iPhones are not supported by scrcpy.</p>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-primary px-4 py-2 text-[14px]" disabled={!st?.scrcpy} onClick={start}><Icon name="phone" size={15} /> Start screen mirror</button>
          <label className="flex items-center gap-1.5 text-slate-300"><input type="checkbox" checked={opts.stayAwake} onChange={(e) => setOpts({ ...opts, stayAwake: e.target.checked })} /> Keep awake</label>
          <label className="flex items-center gap-1.5 text-slate-300"><input type="checkbox" checked={opts.turnScreenOff} onChange={(e) => setOpts({ ...opts, turnScreenOff: e.target.checked })} /> Turn phone screen off</label>
          <label className="flex items-center gap-1.5 text-slate-300"><input type="checkbox" checked={opts.record} onChange={(e) => setOpts({ ...opts, record: e.target.checked })} /> Record to Videos</label>
          <label className="flex items-center gap-1.5 text-slate-300">Max size
            <select className="input w-24 py-0.5" value={opts.maxSize} onChange={(e) => setOpts({ ...opts, maxSize: Number(e.target.value) })}>{[0, 1920, 1280, 1024, 800].map((x) => <option key={x} value={x}>{x || 'Full'}</option>)}</select>
          </label>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <div className="label">Back up files from the phone</div>
        <div className="flex flex-wrap gap-2">
          {BACKUPS.map((b) => <button key={b.remote} className="btn" disabled={!st?.adb || !ready || busy} onClick={() => backup(b.remote)}><Icon name="download" size={13} /> {b.label}</button>)}
        </div>
        {!ready && st?.adb && <p className="mt-2 text-[12px] text-slate-500">Connect a phone with USB debugging allowed to enable backup.</p>}
      </div>
      {msg && <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">{msg}</div>}
    </div>
  );
}
