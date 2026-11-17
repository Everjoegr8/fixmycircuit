// Licence UI: activation screen, expiry banner and the Settings section.
import { useEffect, useState } from 'react';
import { requestMessage, type LicenseStatus } from '@shared/license';
import { api } from '../api';
import { AppMark, EraMark } from '../brand/Logo';
import { Icon } from './Icon';

export function useLicense() {
  const [st, setSt] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    const load = () => api.licenseStatus().then(setSt).catch(() => undefined);
    load();
    const t = setInterval(load, 3600_000);
    window.addEventListener('fmc-license', load);
    return () => { clearInterval(t); window.removeEventListener('fmc-license', load); };
  }, []);
  return st;
}

export function MachineIdBox({ st }: { st: LicenseStatus }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded-md border border-bench-600 bg-bench-900 px-3 py-2 text-center font-mono text-[17px] tracking-[0.15em] text-amber-200" data-testid="machine-id">{st.machineId}</code>
      <button className="btn" onClick={() => { navigator.clipboard.writeText(st.machineId); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export function KeyEntry({ st, onDone }: { st: LicenseStatus; onDone?: () => void }) {
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shop, setShop] = useState('');
  const renew = st.state !== 'trial' && st.state !== 'trial-expired';
  const submit = async () => {
    const r = await api.licenseActivate(key);
    if (r.ok) { setMsg({ ok: true, text: r.status.message }); setKey(''); window.dispatchEvent(new Event('fmc-license')); onDone?.(); }
    else setMsg({ ok: false, text: r.reason || 'Key not accepted.' });
  };
  return (
    <div className="space-y-2">
      <div className="label">1. Send this machine ID to ERA Technologiz</div>
      <MachineIdBox st={st} />
      <div className="flex gap-2">
        <input className="input" placeholder="Shop name (optional)" value={shop} onChange={(e) => setShop(e.target.value)} />
        <button className="btn shrink-0 border-green-500/60 bg-green-500/15 text-green-200 hover:bg-green-500/25" onClick={() => api.licenseWhatsApp(requestMessage(st.machineId, shop, renew))} data-testid="wa-request">
          <Icon name="send" size={13} /> Request key on WhatsApp
        </button>
      </div>
      <div className="label pt-2">2. Paste the key you receive</div>
      <textarea className="input h-20 font-mono text-[11.5px]" placeholder="FMC1-…" value={key} onChange={(e) => setKey(e.target.value)} data-testid="license-key" />
      <button className="btn-solid" disabled={!key.trim()} onClick={submit} data-testid="license-activate"><Icon name="key" size={13} /> Activate</button>
      {msg && <div className={`text-[12.5px] ${msg.ok ? 'text-green-300' : 'text-red-300'}`} data-testid="license-msg">{msg.text}</div>}
    </div>
  );
}

export function ActivationScreen({ st }: { st: LicenseStatus }) {
  return (
    <div className="grid h-full place-items-center overflow-auto bg-bench-950 p-6" data-testid="activation">
      <div className="card fmc-rise w-full max-w-lg p-6">
        <div className="flex items-center gap-3">
          <AppMark size={48} animated />
          <div>
            <div className="font-display text-xl font-semibold text-slate-100">Fix<span className="text-amber-300">My</span>Circuit</div>
            <div className="text-[12px] text-slate-500">Activation</div>
          </div>
        </div>
        <p className="mt-4 text-slate-300">{st.message}</p>
        {st.clockProblem && <p className="mt-2 text-[12px] text-amber-200">This computer's date looks wrong. Set the correct date and time in Windows.</p>}
        <div className="mt-4"><KeyEntry st={st} /></div>
        <div className="mt-6 flex items-center gap-2 border-t border-bench-700 pt-4 text-[11px] text-slate-500"><EraMark size={20} /> A product of ERA Technologiz and Engineering Services. Your files and data stay on this PC.</div>
      </div>
    </div>
  );
}

/** Thin banner for the trial, the last week of a key and the grace period. */
export function LicenseBanner({ st, onOpen }: { st: LicenseStatus; onOpen: () => void }) {
  if (st.state === 'licensed' || st.locked) return null;
  const tone = st.state === 'grace' ? 'border-red-500/50 bg-red-500/10 text-red-200' : st.state === 'warning' ? 'border-amber-500/50 bg-amber-500/10 text-amber-100' : 'border-sky-500/40 bg-sky-500/10 text-sky-100';
  return (
    <div className={`flex shrink-0 items-center gap-2 border-b px-3 py-1 text-[12px] ${tone}`} data-testid="license-banner">
      <Icon name="key" size={12} /> <span className="flex-1">{st.message}</span>
      <button className="btn-ghost" onClick={onOpen}>Enter key</button>
    </div>
  );
}

export function LicenseSettings({ st }: { st: LicenseStatus | null }) {
  if (!st) return null;
  return (
    <div className="card p-3" data-testid="license-settings">
      <div className="label flex items-center gap-1"><Icon name="key" size={12} /> Licence</div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.state === 'licensed' ? 'bg-green-500/15 text-green-300' : st.state === 'grace' || st.locked ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-200'}`}>{label(st)}</span>
        <span className="text-slate-300">{st.message}</span>
      </div>
      <KeyEntry st={st} />
    </div>
  );
}

function label(st: LicenseStatus) {
  if (st.state === 'trial') return `Trial · ${st.daysLeft + 1} days left`;
  if (st.state === 'licensed' || st.state === 'warning') return `Licensed · ${st.daysLeft} days left`;
  if (st.state === 'grace') return 'Expired · grace period';
  return 'Expired';
}
