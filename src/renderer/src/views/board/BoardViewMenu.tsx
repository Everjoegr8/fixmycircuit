import type { ViewOptions, MaskColor } from './BoardCanvas';

const MASK_SWATCH: Record<MaskColor, string> = { green: '#0f3b2a', black: '#141618', blue: '#0e2a4a', red: '#4a1414', purple: '#2b1745' };

/** Drop-down with the board drawing options. */
export default function BoardViewMenu({ view, onChange, onClose, geometry }: { view: ViewOptions; onChange: (o: Partial<ViewOptions>) => void; onClose: () => void; geometry?: string }) {
  return (
    <div className="absolute left-0 top-8 z-30 w-72 rounded-lg border border-bench-600 bg-bench-850 p-3 shadow-2xl" data-testid="view-menu" onMouseLeave={onClose}>
      <div className="label">Look</div>
      <div className="mb-3 flex overflow-hidden rounded-md border border-bench-600">
        {([['real', 'Real board'], ['classic', 'Classic lines']] as const).map(([k, l]) => (
          <button key={k} className={`flex-1 px-2 py-1 ${view.look === k ? 'bg-amber-500/20 text-amber-200' : 'bg-bench-800 text-slate-300 hover:bg-bench-700'}`} onClick={() => onChange({ look: k })} data-testid={`look-${k}`}>{l}</button>
        ))}
      </div>
      {view.look === 'real' && (
        <>
          <div className="label">Board colour</div>
          <div className="mb-3 flex gap-1.5">
            {(Object.keys(MASK_SWATCH) as MaskColor[]).map((m) => (
              <button key={m} title={m} className={`h-6 w-6 rounded-full border-2 ${view.mask === m ? 'border-amber-300' : 'border-bench-600'}`} style={{ background: MASK_SWATCH[m] }} onClick={() => onChange({ mask: m })} />
            ))}
          </div>
        </>
      )}
      <label className="mb-1.5 flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={view.xray} onChange={(e) => onChange({ xray: e.target.checked })} data-testid="xray-toggle" /> X-ray: show the other side faintly (X)
      </label>
      <label className="mb-2 flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={view.netNames} onChange={(e) => onChange({ netNames: e.target.checked })} /> Write pin numbers and net names on pads
      </label>
      <p className="text-[11px] leading-snug text-slate-500">
        {geometry === 'file'
          ? 'This file stores real pad sizes and part outlines, so they are drawn exactly.'
          : 'This file stores pin positions only (normal for phone boardviews). Part bodies and pad shapes are worked out from the pins, the way OpenBoardView does, with each part turned to its real angle.'}
      </p>
    </div>
  );
}
