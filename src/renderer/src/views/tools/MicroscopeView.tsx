// Live USB microscope / webcam view with freeze and capture into a model's photos.
import { useEffect, useRef, useState } from 'react';
import type { Brand, Guide } from '@shared/types';
import { api, type TreeModel } from '../../api';
import { Icon } from '../../components/Icon';

interface Props {
  models: TreeModel[];
  brands: Brand[];
  onChanged: () => void;
  onOpenPhoto: (id: number, title: string, modelId: number | null) => void;
}

/** Plain-language reasons for camera failures (getUserMedia error names). */
export function cameraError(e: any): string {
  const n = e?.name || '';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'The camera is busy. Close any other program using it (Camera app, Zoom, WhatsApp, another microscope viewer), unplug and replug the microscope, then press Start camera again.';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'Windows is blocking the camera. Open Windows Settings, Privacy & security, Camera, and turn on "Let desktop apps access your camera". Then press Start camera again.';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'No camera found. Plug in the USB microscope (it shows up as a webcam), wait a few seconds and press Refresh.';
  if (n === 'OverconstrainedError') return 'This camera does not support that setting. Pick a lower resolution and try again.';
  return e?.message || String(e);
}

export default function MicroscopeView(p: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(() => { try { return localStorage.getItem('fmc.cam') || ''; } catch { return ''; } });
  const [res, setRes] = useState('1920x1080');
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [rot, setRot] = useState(0);
  const [cross, setCross] = useState(true);
  const [shots, setShots] = useState<string[]>([]);
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const listDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch { /* no devices */ }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  };

  const start = async (id = deviceId) => {
    stop();
    setError('');
    setFrozen(null);
    const [w, h] = res.split('x').map(Number);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: w }, height: { ideal: h } }, audio: false });
      } catch (e: any) {
        // The saved camera was unplugged, or it refuses the size: fall back to any camera at its own size.
        if (e?.name !== 'OverconstrainedError' && e?.name !== 'NotFoundError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      setLive(true);
      const st = stream.getVideoTracks()[0]?.getSettings?.() || {};
      setActual(st.width ? `${st.width}×${st.height}${st.frameRate ? ` · ${Math.round(st.frameRate)} fps` : ''}` : '');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { setLive(false); setError('The camera was disconnected. Plug it back in and press Start camera.'); });
      listDevices();
    } catch (e: any) {
      setError(cameraError(e));
    }
  };

  /** Self-check: is the camera delivering real, changing frames, and does capture work? */
  const selfCheck = async () => {
    const lines: string[] = [];
    let ok = true;
    const v = videoRef.current;
    if (!live || !v) { setCheck({ ok: false, lines: ['Start the camera first.'] }); return; }
    lines.push(`Camera: ${devices.find((d) => d.deviceId === deviceId)?.label || 'default camera'}${actual ? `, ${actual}` : ''}`);
    const sample = () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, 64, 48);
      return ctx.getImageData(0, 0, 64, 48).data;
    };
    const t0 = v.currentTime;
    const a = sample();
    await new Promise((r) => setTimeout(r, 700));
    const b = sample();
    const moving = v.currentTime > t0;
    let mean = 0, diff = 0;
    for (let i = 0; i < a.length; i += 4) { mean += (b[i] + b[i + 1] + b[i + 2]) / 3; diff += Math.abs(a[i] - b[i]); }
    mean /= a.length / 4;
    if (moving) lines.push('Frames: arriving'); else { ok = false; lines.push('Frames: not arriving. Replug the microscope or try a different USB port.'); }
    if (mean < 6) { ok = false; lines.push('Picture: black. Check the microscope light and lens cap, or another program may hold the camera.'); }
    else if (mean > 250) { ok = false; lines.push('Picture: completely white. Turn the microscope light down or the exposure is wrong.'); }
    else lines.push(`Picture: OK (brightness ${Math.round(mean)})`);
    if (diff === 0 && moving) lines.push('Note: two frames were identical; fine for a still board.');
    const g = grab();
    if (g && g.length > 1000) lines.push('Capture: OK'); else { ok = false; lines.push('Capture: failed'); }
    setCheck({ ok, lines });
  };

  useEffect(() => {
    listDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', listDevices);
    return () => { stop(); navigator.mediaDevices?.removeEventListener?.('devicechange', listDevices); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grab = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const turned = rot % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = turned ? v.videoHeight : v.videoWidth;
    c.height = turned ? v.videoWidth : v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(v, -v.videoWidth / 2, -v.videoHeight / 2);
    return c.toDataURL('image/jpeg', 0.92);
  };

  const freeze = () => {
    if (frozen) { setFrozen(null); return; }
    const d = grab();
    if (d) setFrozen(d);
  };
  const capture = () => {
    const d = frozen || grab();
    if (!d) return;
    setShots((s) => [d, ...s].slice(0, 12));
    setSaveFor(d);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-bench-700 px-3 py-2">
        <Icon name="scope" size={16} className="text-amber-300" />
        <h1 className="mr-2 font-semibold text-slate-100">USB microscope</h1>
        <select className="input w-64 py-0.5" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); try { localStorage.setItem('fmc.cam', e.target.value); } catch { /* ignore */ } if (live) start(e.target.value); }}>
          <option value="">Default camera</option>
          {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
        </select>
        <select className="input w-28 py-0.5" value={res} onChange={(e) => setRes(e.target.value)} title="Resolution">
          {['640x480', '1280x720', '1920x1080', '2592x1944', '3840x2160'].map((r) => <option key={r}>{r}</option>)}
        </select>
        {!live ? (
          <button className="btn-primary" onClick={() => start()} data-testid="cam-start"><Icon name="camera" size={13} /> Start camera</button>
        ) : (
          <button className="btn" onClick={stop}>Stop</button>
        )}
        <button className="btn" onClick={listDevices} title="Look for cameras again">Refresh</button>
        <button className="btn" disabled={!live} onClick={selfCheck} title="Check the camera delivers a real picture and capture works" data-testid="cam-check">Self-check</button>
        {live && actual && <span className="text-[11px] text-slate-500" data-testid="cam-actual">{actual}</span>}
        <div className="mx-1 h-5 w-px bg-bench-600" />
        <button className={`btn ${frozen ? 'btn-on' : ''}`} disabled={!live} onClick={freeze} title="Freeze the frame (Space)">{frozen ? 'Unfreeze' : 'Freeze'}</button>
        <button className="btn-primary" disabled={!live} onClick={capture}><Icon name="download" size={13} /> Capture</button>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-slate-400">Zoom <input type="range" min={1} max={6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <button className={`btn ${mirror ? 'btn-on' : ''}`} onClick={() => setMirror(!mirror)} title="Mirror"><Icon name="flip" size={13} /></button>
        <button className="btn" onClick={() => setRot((r) => (r + 90) % 360)} title="Rotate"><Icon name="rotate" size={13} /></button>
        <button className={`btn ${cross ? 'btn-on' : ''}`} onClick={() => setCross(!cross)} title="Crosshair">+</button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-black">
          <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-contain" style={{ transform: `rotate(${rot}deg) scale(${zoom}) scaleX(${mirror ? -1 : 1})`, visibility: frozen ? 'hidden' : 'visible' }} />
          {frozen && <img src={frozen} className="absolute inset-0 h-full w-full object-contain" style={{ transform: `scale(${zoom})` }} alt="Frozen frame" />}
          {cross && live && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px bg-red-500/60" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-red-500/60" />
              <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500/60" />
            </div>
          )}
          {!live && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-300"><Icon name="scope" size={26} /></div>
                <div className="text-base font-semibold text-slate-100">Connect your USB microscope</div>
                <p className="mt-1 text-slate-400">Any USB digital microscope or webcam works: it appears as a camera. Press Start camera, then Freeze to hold a frame and Capture to save it into a model's board photos or a fault solution.</p>
                {error && <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">{error}</div>}
              </div>
            </div>
          )}
          {check && (
            <div className={`absolute bottom-3 left-3 z-10 max-w-md rounded border p-2 text-[12px] ${check.ok ? 'border-green-500/50 bg-green-950/80 text-green-100' : 'border-amber-500/50 bg-amber-950/80 text-amber-100'}`} data-testid="cam-check-result">
              <div className="mb-0.5 font-semibold">{check.ok ? 'Self-check passed' : 'Self-check found a problem'}</div>
              {check.lines.map((l) => <div key={l}>{l}</div>)}
              <button className="mt-1 text-[11px] underline opacity-80" onClick={() => setCheck(null)}>Close</button>
            </div>
          )}
          {live && error && <div className="absolute right-3 top-3 max-w-sm rounded border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-200">{error}</div>}
          {frozen && <div className="absolute left-3 top-3 rounded bg-sky-500/80 px-2 py-0.5 text-[11px] font-semibold text-white">FROZEN</div>}
        </div>
        {shots.length > 0 && (
          <div className="w-40 shrink-0 space-y-2 overflow-auto border-l border-bench-700 p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Captures</div>
            {shots.map((s, i) => <button key={i} onClick={() => setSaveFor(s)}><img src={s} className="w-full rounded border border-bench-600 hover:border-amber-400" alt={`Capture ${i + 1}`} /></button>)}
          </div>
        )}
      </div>
      {saveFor && <SaveCapture data={saveFor} {...p} onClose={() => setSaveFor(null)} />}
    </div>
  );
}

function SaveCapture({ data, models, brands, onChanged, onOpenPhoto, onClose }: Props & { data: string; onClose: () => void }) {
  const [modelId, setModelId] = useState<number | ''>(() => { try { return Number(localStorage.getItem('fmc.capModel')) || ''; } catch { return ''; } });
  const [title, setTitle] = useState(`Microscope ${new Date().toLocaleString()}`);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [guideId, setGuideId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (modelId !== '') api.listGuides(modelId).then(setGuides); else setGuides([]); setGuideId(''); }, [modelId]);
  const save = async (open: boolean) => {
    setBusy(true);
    try { localStorage.setItem('fmc.capModel', String(modelId)); } catch { /* ignore */ }
    const ph = await api.addPhotoFromData({ model_id: modelId === '' ? null : modelId, dataUrl: data, title, guide_id: guideId === '' ? null : guideId });
    onChanged();
    setBusy(false);
    onClose();
    if (open) onOpenPhoto(ph.id, ph.title, ph.model_id);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onMouseDown={onClose}>
      <div className="card w-[560px] p-4" onMouseDown={(e) => e.stopPropagation()} data-testid="capture-dialog">
        <h2 className="mb-3 font-semibold text-slate-100">Save capture</h2>
        <img src={data} className="mb-3 max-h-60 w-full rounded object-contain" alt="Capture" />
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <label className="label">Model</label>
            <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Unsorted</option>
              {brands.map((b) => <optgroup key={b.id} label={b.name}>{models.filter((m) => m.brand_id === b.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}
            </select>
          </div>
          <div>
            <label className="label">Attach to fault solution</label>
            <select className="input" value={guideId} onChange={(e) => setGuideId(e.target.value ? Number(e.target.value) : '')} disabled={!guides.length}>
              <option value="">None</option>
              {guides.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={() => save(false)}>Save</button>
          <button className="btn-primary" disabled={busy} onClick={() => save(true)}>Save and add readings</button>
        </div>
      </div>
    </div>
  );
}
