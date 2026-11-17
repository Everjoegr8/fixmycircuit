// Optional AI troubleshooting assistant. Runs a tool loop over the open board,
// readings, fixes and knowledge base. Answers are labelled as AI suggestions.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { loadBoard, extOf } from '@parsers/index.js';
import { indexBoard } from '@shared/netindex';
import { api } from '../api';
import { AI_TOOLS, pickBoard, runTool, systemPrompt, type AiContext } from '../lib/aiTools';
import { registerBoard, type OpenBoard } from '../lib/boards';
import { Icon } from './Icon';

interface Props {
  ctx: AiContext;
  onFindOnBoard?: (q: string) => void;
  onOpenSettings?: () => void;
  compact?: boolean;
}

type Turn = { role: 'user' | 'assistant'; content: any };
type Shown = { kind: 'user'; text: string } | { kind: 'ai'; text: string; tools: string[]; model?: string } | { kind: 'error'; text: string };

const SUGGEST = [
  'Phone is dead, no current draw. Where do I start?',
  'Not charging. Trace the charging path from the USB connector.',
  'This net is shorted to ground. Which parts can short it?',
  'No backlight. What should I check?',
];

const TOOL_LABEL: Record<string, (i: any) => string> = {
  board_overview: () => 'Read board overview',
  get_net: (i) => `Looked up net ${i.net}`,
  get_part: (i) => `Looked up part ${i.part}`,
  find_path: (i) => `Traced ${i.from} → ${i.to}`,
  rail_family: (i) => `Followed rail ${i.net}`,
  search_board: (i) => `Searched “${i.query}”`,
  list_readings: () => 'Read shop readings',
  list_fixes: () => 'Read saved fixes',
  kb_search: (i) => `Searched guides for “${i.query}”`,
  ic_lookup: (i) => `Looked up IC ${i.ic}`,
};

async function ensureBoard(modelId: number | null): Promise<OpenBoard | null> {
  const open = pickBoard(modelId);
  if (open || modelId == null) return open;
  const files = await api.listFiles(modelId, 'boardview');
  if (!files.length) return null;
  try {
    const [{ file, bytes, extras }, s] = await Promise.all([api.readFile(files[0].id), api.getSettings()]);
    const board = loadBoard(new Uint8Array(bytes), file.name, { fzKey: s.fzKey, xzzKey: s.xzzKey, ascFiles: extOf(file.name) === 'asc' ? { ...extras, [file.name.toLowerCase()]: new Uint8Array(bytes) } : undefined });
    const ob = { fileId: file.id, name: file.name, modelId, board };
    registerBoard(ob);
    return { ...ob, at: Date.now() };
  } catch {
    return null;
  }
}

export default function AiAssistant(p: Props) {
  const [status, setStatus] = useState<{ configured: boolean; model: string; mock: boolean } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [shown, setShown] = useState<Shown[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [board, setBoard] = useState<OpenBoard | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.aiStatus().then(setStatus); }, []);
  useEffect(() => { setTurns([]); setShown([]); ensureBoard(p.ctx.modelId).then(setBoard); }, [p.ctx.modelId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [shown, busy]);

  const names = useMemo(() => {
    if (!board) return null;
    const idx = indexBoard(board.board);
    const set = new Set<string>();
    for (const n of idx.nets.keys()) if (n.length >= 2) set.add(n.toUpperCase());
    for (const n of idx.parts.keys()) set.add(n.toUpperCase());
    return set;
  }, [board]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ('');
    const b = board || (await ensureBoard(p.ctx.modelId));
    if (b && !board) setBoard(b);
    let msgs: Turn[] = [...turns, { role: 'user', content: question }];
    setShown((s) => [...s, { kind: 'user', text: question }]);
    const tools: string[] = [];
    try {
      for (let step = 0; step < 10; step++) {
        setBusy(step === 0 ? 'Thinking…' : `Checking the board (${tools.length} lookups)…`);
        const r = await api.aiStep({ system: systemPrompt(p.ctx, b), messages: msgs, tools: AI_TOOLS });
        msgs = [...msgs, { role: 'assistant', content: r.content }];
        if (r.stop_reason === 'refusal') { setShown((s) => [...s, { kind: 'error', text: `The model declined: ${r.refusal}` }]); msgs = turns; break; }
        const uses = r.content.filter((c: any) => c.type === 'tool_use');
        if (r.stop_reason === 'tool_use' && uses.length) {
          const results: { type: string; tool_use_id: string; content: string }[] = [];
          for (const u of uses) {
            tools.push((TOOL_LABEL[u.name] || (() => u.name))(u.input || {}));
            let out: unknown;
            try { out = await runTool(u.name, u.input || {}, p.ctx, b); } catch (e: any) { out = { error: String(e?.message || e) }; }
            results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 60000) });
          }
          msgs = [...msgs, { role: 'user', content: results }];
          continue;
        }
        const answer = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n\n').trim();
        setShown((s) => [...s, { kind: 'ai', text: answer || '(no answer)', tools: [...tools], model: r.model }]);
        if (r.stop_reason === 'max_tokens') setShown((s) => [...s, { kind: 'error', text: 'The answer was cut off. Ask it to continue.' }]);
        break;
      }
      setTurns(msgs);
    } catch (e: any) {
      const m = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setShown((s) => [...s, { kind: 'error', text: m }]);
    }
    setBusy('');
  };

  if (status && !status.configured) {
    return (
      <div className="p-3" data-testid="ai-setup">
        <div className="card p-3">
          <div className="flex items-center gap-2 font-semibold text-slate-100"><Icon name="sparkle" size={15} className="text-amber-300" /> AI assistant (optional)</div>
          <p className="mt-1 text-[12.5px] text-slate-400">Ask in plain words, like “not charging, where do I start?”. It reads this board's netlist, your readings and fixes, then suggests what to measure. It uses the Claude API with your own key and needs internet; everything else in FixMyCircuit stays offline.</p>
          <button className="btn-primary mt-2" onClick={p.onOpenSettings}><Icon name="key" size={13} /> Add API key in Settings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ai-assistant">
      <div className="flex items-center gap-2 border-b border-bench-700 px-3 py-1.5 text-[11px]">
        <Icon name="sparkle" size={13} className="text-amber-300" />
        <span className="text-slate-300">{board ? <>Reading <span className="font-mono text-slate-200">{board.name}</span></> : 'No boardview for this device'}</span>
        <div className="flex-1" />
        {status && <span className="text-slate-500">{status.mock ? 'test mode' : status.model}</span>}
        {shown.length > 0 && <button className="btn-ghost" onClick={() => { setTurns([]); setShown([]); }} title="New conversation">New</button>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {!shown.length && (
          <div className="space-y-1.5">
            <div className="text-[12px] text-slate-400">Describe the fault. The assistant looks up real nets and parts in the file before answering.</div>
            {SUGGEST.map((s) => <button key={s} className="block w-full rounded border border-bench-700 px-2 py-1.5 text-left text-[12px] text-slate-300 hover:border-amber-500/60 hover:text-amber-100" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {shown.map((m, i) =>
          m.kind === 'user' ? (
            <div key={i} className="fmc-rise ml-6 rounded-lg bg-amber-500/15 px-3 py-2 text-slate-100">{m.text}</div>
          ) : m.kind === 'error' ? (
            <div key={i} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">{m.text}</div>
          ) : (
            <div key={i} className="fmc-rise rounded-lg border border-bench-600 bg-bench-850 p-3" data-testid="ai-answer">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-300"><Icon name="sparkle" size={11} /> AI suggestion · verify with measurements</div>
              {m.tools.length > 0 && (
                <details className="mb-2 text-[11px] text-slate-500">
                  <summary className="cursor-pointer">{m.tools.length} lookups in your data</summary>
                  <ul className="mt-1 list-disc pl-4">{m.tools.map((t, j) => <li key={j}>{t}</li>)}</ul>
                </details>
              )}
              <Answer text={m.text} names={names} onName={p.onFindOnBoard} />
            </div>
          ),
        )}
        {busy && <div className="flex items-center gap-2 text-[12px] text-slate-400"><span className="fmc-shimmer inline-block h-1.5 w-16 rounded" /> {busy}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-bench-700 p-2">
        <div className="flex gap-1.5">
          <textarea
            className="input h-14 resize-none"
            placeholder="e.g. Takes 0.5 A then drops, no display"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }}
            data-testid="ai-input"
          />
          <button className="btn-primary self-stretch" disabled={!!busy || !q.trim()} onClick={() => ask(q)} title="Ask" data-testid="ai-send"><Icon name="send" size={14} /></button>
        </div>
        <div className="mt-1 text-[10.5px] text-slate-500">Sends your question and the looked-up board data to the Claude API. AI can be wrong; measure before replacing parts.</div>
      </div>
    </div>
  );
}

/** Light formatting: paragraphs, numbered and bullet lines, **bold**, and clickable part/net names. */
function Answer({ text, names, onName }: { text: string; names: Set<string> | null; onName?: (q: string) => void }) {
  const linkify = (s: string, key: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|[A-Za-z][A-Za-z0-9_.+\-/]*[A-Za-z0-9_+])/g);
    return parts.map((t, i) => {
      if (!t) return null;
      if (t.startsWith('**') && t.endsWith('**')) return <b key={key + i} className="text-slate-100">{linkify(t.slice(2, -2), key + i + 'b')}</b>;
      const bare = t.startsWith('`') ? t.slice(1, -1) : t;
      if (names && onName && names.has(bare.toUpperCase()) && /\d|_/.test(bare)) {
        return <button key={key + i} className="rounded bg-cyan-400/10 px-0.5 font-mono text-cyan-300 hover:bg-cyan-400/25" onClick={() => onName(bare)} title="Show on board">{bare}</button>;
      }
      return <Fragment key={key + i}>{t.startsWith('`') ? <code className="font-mono text-slate-100">{bare}</code> : t}</Fragment>;
    });
  };
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-[12.5px] leading-relaxed text-slate-300">
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const h = /^#{1,4}\s+(.*)/.exec(t);
        if (h) return <div key={i} className="pt-1 font-semibold text-slate-100">{linkify(h[1], 'h' + i)}</div>;
        const num = /^(\d+)[.)]\s+(.*)/.exec(t);
        if (num) return <div key={i} className="flex gap-2"><span className="w-4 shrink-0 text-right text-amber-300">{num[1]}.</span><span>{linkify(num[2], 'n' + i)}</span></div>;
        const bul = /^[-*•]\s+(.*)/.exec(t);
        if (bul) return <div key={i} className="flex gap-2 pl-1"><span className="text-amber-300">•</span><span>{linkify(bul[1], 'u' + i)}</span></div>;
        return <p key={i}>{linkify(t, 'p' + i)}</p>;
      })}
    </div>
  );
}
