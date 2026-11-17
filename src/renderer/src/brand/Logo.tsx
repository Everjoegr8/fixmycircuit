// Original logo artwork for FixMyCircuit and ERA Technologiz and Engineering Services.
// Pure SVG so it is crisp at any size and works offline.

/** FixMyCircuit app mark: a chip with pins whose core holds a "found it" pulse trace. */
export function AppMark({ size = 32, animated = false, className = '' }: { size?: number; animated?: boolean; className?: string }) {
  const pins = [14, 24, 34, 44, 54];
  return (
    <svg width={size} height={size} viewBox="0 0 68 68" className={className} aria-label="FixMyCircuit logo" role="img">
      <defs>
        <linearGradient id="fmc-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d2a38" />
          <stop offset="1" stopColor="#0b1118" />
        </linearGradient>
        <linearGradient id="fmc-pulse" gradientUnits="userSpaceOnUse" x1="17" y1="0" x2="51" y2="0">
          <stop offset="0" stopColor="#37C9E8" />
          <stop offset="1" stopColor="#F2B544" />
        </linearGradient>
      </defs>
      {pins.map((p) => (
        <g key={p} stroke="#F2B544" strokeWidth="3" strokeLinecap="round">
          <line x1={p} y1="3" x2={p} y2="10" />
          <line x1={p} y1="58" x2={p} y2="65" />
          <line x1="3" y1={p} x2="10" y2={p} />
          <line x1="58" y1={p} x2="65" y2={p} />
        </g>
      ))}
      <rect x="9" y="9" width="50" height="50" rx="12" fill="url(#fmc-body)" stroke="#F2B544" strokeWidth="2.5" />
      <rect x="16" y="16" width="36" height="36" rx="7" fill="none" stroke="#37C9E8" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M17 36 H26 L29.5 27 L34.5 44 L38.5 31 L41 36 H51"
        fill="none"
        stroke="url(#fmc-pulse)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? 'fmc-pulse-draw' : ''}
      />
      <circle cx="51" cy="36" r="3.2" fill="#F2B544" className={animated ? 'fmc-node-glow' : ''} />
      <circle cx="17" cy="36" r="2.2" fill="#37C9E8" />
    </svg>
  );
}

/** ERA Technologiz mark: an "E" drawn as three circuit traces joined by a bus with solder nodes. */
export function EraMark({ size = 28, className = '', animated = false }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-label="ERA Technologiz logo" role="img">
      <defs>
        <linearGradient id="era-g" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="44" y2="44">
          <stop offset="0" stopColor="#37C9E8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="none" stroke="url(#era-g)" strokeWidth="2.5" strokeDasharray="110 20" transform="rotate(-60 24 24)" className={animated ? 'fmc-spin' : ''} />
      <g stroke="url(#era-g)" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M15 13 V35" />
        <path d="M15 13 H33" />
        <path d="M15 24 H28" />
        <path d="M15 35 H33" />
      </g>
      <circle cx="33" cy="13" r="3" fill="#F2B544" />
      <circle cx="28" cy="24" r="3" fill="#F2B544" />
      <circle cx="33" cy="35" r="3" fill="#F2B544" />
    </svg>
  );
}

export function EraBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" title="A product of ERA Technologiz and Engineering Services">
      <EraMark size={compact ? 20 : 26} />
      <div className="leading-tight">
        <div className={`font-semibold tracking-wide text-slate-100 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>ERA Technologiz</div>
        {!compact && <div className="text-[9.5px] uppercase tracking-wider text-slate-500">and Engineering Services</div>}
      </div>
    </div>
  );
}

/** Full-window animated splash shown while the app starts. */
export function Splash({ version }: { version?: string }) {
  return (
    <div className="fmc-splash fixed inset-0 z-[100] grid place-items-center bg-bench-950" data-testid="splash">
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-amber-500/10 blur-2xl" />
          <AppMark size={104} animated />
        </div>
        <div className="mt-5 font-display text-3xl font-semibold tracking-tight text-slate-100">Fix<span className="text-amber-300">My</span>Circuit</div>
        <div className="mt-1 text-[13px] text-slate-400">Find the fault. Fix with confidence.</div>
        <div className="mt-8 flex items-center gap-2 text-slate-400">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">a product of</span>
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <EraMark size={34} animated />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-100">ERA Technologiz</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">and Engineering Services</div>
          </div>
        </div>
        {version && <div className="mt-6 text-[11px] text-slate-600">v{version}</div>}
        <div className="mt-3 h-0.5 w-40 overflow-hidden rounded bg-bench-800"><div className="fmc-shimmer h-full w-full" /></div>
      </div>
    </div>
  );
}
