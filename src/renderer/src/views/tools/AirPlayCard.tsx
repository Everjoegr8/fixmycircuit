// iPhone / iPad screen mirroring through AirPlay, using UxPlay when it is installed.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import ToolsPanel from '../../components/ToolsPanel';

export default function AirPlayCard() {
  const [st, setSt] = useState<{ uxplay: string | null; running: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  const [pin, setPin] = useState(false);
  const refresh = () => api.airplayStatus().then(setSt);
  useEffect(() => { refresh(); }, []);
  const start = async () => {
    setMsg('');
    try { await api.airplayStart({ name: 'FixMyCircuit', pin }); setMsg('Waiting for the iPhone. On the phone: Control Centre, Screen Mirroring, then pick "FixMyCircuit".'); }
    catch (e: any) { setMsg(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    refresh();
  };
  return (
    <div className="card mt-4 p-4" data-testid="airplay-card">
      <div className="label flex items-center gap-1"><Icon name="phone" size={12} /> iPhone and iPad (AirPlay)</div>
      <p className="text-[12.5px] text-slate-300">Show an iPhone's screen on this PC over Wi-Fi with AirPlay screen mirroring. What iOS allows:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-slate-400" data-testid="ios-limits">
        <li>View only. iOS does not let a PC control the phone or copy files through mirroring.</li>
        <li>The phone must be unlocked and its screen and touch must work well enough to open Control Centre and start Screen Mirroring.</li>
        <li>The phone and this PC must be on the same Wi-Fi network (and Windows needs Bonjour, which UxPlay uses).</li>
        <li>For a dead screen, use a known good screen temporarily, or back up with iTunes / Apple Devices instead.</li>
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={!st?.uxplay} onClick={start} data-testid="airplay-start"><Icon name="phone" size={14} /> {st?.running ? 'Receiver running' : 'Start AirPlay receiver'}</button>
        {st?.running && <button className="btn" onClick={async () => { await api.airplayStop(); refresh(); }}>Stop</button>}
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-300"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Ask for a PIN on the phone</label>
      </div>
      {!st?.uxplay && <div className="mt-3"><ToolsPanel only={['uxplay']} compact /></div>}
      {msg && <div className="mt-2 text-[12px] text-amber-100">{msg}</div>}
      <p className="mt-2 text-[11px] text-slate-500">Uses UxPlay (GPL-3.0), a separate open-source program that FixMyCircuit starts but does not include.</p>
    </div>
  );
}
