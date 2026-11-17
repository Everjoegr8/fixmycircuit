// Tools the AI assistant can call. Each one reads the real data the app has:
// the open boardview's netlist, the model's readings and fixes, the schematic
// text index, the built-in knowledge base and the IC list. Nothing is invented.
import { searchBoard } from '@parsers/index.js';
import { KB_GUIDES } from '@shared/knowledge';
import { describeNet, describePart, findPath, indexBoard, railFamily, resolveRef, TYPE_LABEL } from '@shared/netindex';
import { api } from '../api';
import { openBoards, type OpenBoard } from './boards';
import { indexModelSchematics, schematicPages } from './schindex';

export interface AiContext {
  modelId: number | null;
  modelLabel: string;
  demo: boolean;
  focus: { part?: string; pin?: string; net?: string };
}

export const AI_TOOLS = [
  { name: 'board_overview', description: 'Summary of the boardview open for this model: counts, likely supply rails (nets with decoupling caps), ICs and connectors. Call this first.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_net', description: 'Everything known about one net: pins, parts, ICs, decoupling caps, series parts it continues through, readings the shop recorded on it, and schematic pages that name it.', input_schema: { type: 'object', properties: { net: { type: 'string' } }, required: ['net'], additionalProperties: false } },
  { name: 'get_part', description: 'One part: its type (guessed from the reference designator), side, and every pin with its net, plus readings and schematic pages.', input_schema: { type: 'object', properties: { part: { type: 'string' } }, required: ['part'], additionalProperties: false } },
  { name: 'find_path', description: 'Shortest DC path between two parts or nets through resistors, coils, fuses, ferrites, jumpers and diodes (never through ground). Returns the chain of nets and parts, or null.', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'], additionalProperties: false } },
  { name: 'rail_family', description: 'Nets reachable from a net through series parts within a number of hops, e.g. VBUS -> fuse -> VBUS_F -> coil -> VSYS.', input_schema: { type: 'object', properties: { net: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['net'], additionalProperties: false } },
  { name: 'search_board', description: 'Search part and net names in the open boardview (substring match). Use to find the real names before calling get_net or get_part.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'list_readings', description: "The shop's recorded diode, voltage and resistance readings for this model, optionally filtered by net or part.", input_schema: { type: 'object', properties: { net: { type: 'string' }, part: { type: 'string' } }, additionalProperties: false } },
  { name: 'list_fixes', description: "The shop's saved fault solutions for this model, optionally filtered by words.", input_schema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false } },
  { name: 'kb_search', description: 'Search the built-in repair knowledge base (general step-by-step fault guides for phones).', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'ic_lookup', description: 'Look up an IC in the shop IC cross-reference list (function, platforms, alternatives).', input_schema: { type: 'object', properties: { ic: { type: 'string' } }, required: ['ic'], additionalProperties: false } },
];

export function systemPrompt(ctx: AiContext, board: OpenBoard | null) {
  return [
    'You are the troubleshooting assistant inside FixMyCircuit, a repair workbench used by phone repair technicians at the bench.',
    `Device: ${ctx.modelLabel || 'not chosen'}.${ctx.demo ? ' This is a DEMO model on a synthetic practice board; say so if it matters and do not present its values as real phone values.' : ''}`,
    board ? `Open boardview: ${board.name}.` : 'No boardview is open for this device, so connectivity tools will report that; rely on readings, fixes and the knowledge base, and suggest opening the boardview.',
    ctx.focus.part || ctx.focus.net ? `The technician has selected ${[ctx.focus.part && `part ${ctx.focus.part}${ctx.focus.pin ? ' pin ' + ctx.focus.pin : ''}`, ctx.focus.net && `net ${ctx.focus.net}`].filter(Boolean).join(' and ')}.` : '',
    '',
    'How to work:',
    '- Use the tools to look up real part and net names and real connections before you name them. Never invent a part, pin, net or connection. If a tool does not show it, say it is not in the file.',
    '- Part types are guessed from reference designators (R, C, L, U...). Say "likely" when it matters.',
    '- Do not state specific diode-mode or voltage values as facts for this board unless they come from the shop readings. Otherwise tell the technician to compare against a known good board or the schematic.',
    '- Keep it practical for the bench: the likely fault area, then numbered measurements (where to probe, meter mode, what a short or open would look like), then the parts to suspect in order.',
    '- Write part and net names exactly as they appear in the file so the app can link them.',
    '- Be concise. Plain text with short numbered lists. No tables.',
  ].filter((x) => x !== '').join('\n');
}

/** Pick the boardview to reason over: the most recently used one for this model, else any. */
export function pickBoard(modelId: number | null) {
  const all = openBoards();
  return all.find((b) => b.modelId === modelId) || null;
}

const up = (s?: string) => (s || '').toUpperCase();

export async function runTool(name: string, input: any, ctx: AiContext, board: OpenBoard | null): Promise<unknown> {
  const idx = board ? indexBoard(board.board) : null;
  const needBoard = () => ({ error: 'No boardview is open for this device. Ask the technician to open it (BoardView tab) for connectivity answers.' });
  const sch = async () => indexModelSchematics(ctx.modelId);
  switch (name) {
    case 'board_overview': {
      if (!idx) return needBoard();
      const nets = [...idx.nets.values()];
      const rails = nets.filter((n) => n.rail).sort((a, b) => b.caps - a.caps || b.pins - a.pins).slice(0, 40).map((n) => ({ net: n.name, pins: n.pins, decouplingCaps: n.caps }));
      const parts = [...idx.parts.values()];
      const ics = parts.filter((p) => p.type === 'ic').sort((a, b) => b.pins.length - a.pins.length).slice(0, 40).map((p) => ({ part: p.name, pins: p.pins.length, code: p.mfgcode }));
      const connectors = parts.filter((p) => p.type === 'connector').slice(0, 30).map((p) => ({ part: p.name, pins: p.pins.length }));
      return { file: board!.name, format: board!.board.format, ...idx.stats, groundNets: idx.stats.groundNets.slice(0, 10), likelyRails: rails, ics, connectors };
    }
    case 'get_net': {
      if (!idx) return needBoard();
      const r = resolveRef(idx, input.net);
      if (!r || r.kind !== 'net') return { error: `No net named ${input.net} in this file.`, suggestions: searchBoard(board!.board, input.net, 8).map((x: any) => x.name) };
      const readings = (await api.listReadings({ model_id: ctx.modelId ?? undefined })).filter((x) => up(x.net) === up(r.name)).map(fmtReading);
      return { ...describeNet(idx, r.name), readings, schematic: schematicPages(await sch(), r.name) };
    }
    case 'get_part': {
      if (!idx) return needBoard();
      const r = resolveRef(idx, input.part);
      if (!r || r.kind !== 'part') return { error: `No part named ${input.part} in this file.`, suggestions: searchBoard(board!.board, input.part, 8).map((x: any) => x.name) };
      const d = describePart(idx, r.name)!;
      const readings = (await api.listReadings({ model_id: ctx.modelId ?? undefined })).filter((x) => up(x.part) === up(r.name)).map(fmtReading);
      return { ...d, typeLabel: TYPE_LABEL[d.type], readings, schematic: schematicPages(await sch(), r.name) };
    }
    case 'find_path': {
      if (!idx) return needBoard();
      const a = resolveRef(idx, input.from), b = resolveRef(idx, input.to);
      if (!a || !b) return { error: `Unknown ${!a ? input.from : input.to}.` };
      const p = findPath(idx, a.name, b.name);
      return p ? { path: p.map((s) => (s.via ? { through: s.via.part, type: s.via.type, net: s.net } : { net: s.net })) } : { path: null, note: 'No DC path through series parts. They may connect through an IC, transistor or capacitor.' };
    }
    case 'rail_family': {
      if (!idx) return needBoard();
      const r = resolveRef(idx, input.net);
      if (!r || r.kind !== 'net') return { error: `No net named ${input.net}.` };
      return { family: railFamily(idx, r.name, Math.min(5, Math.max(1, input.depth || 3))) };
    }
    case 'search_board': {
      if (!board) return needBoard();
      return { results: searchBoard(board.board, String(input.query || ''), 30).map((x: any) => ({ kind: x.kind, name: x.name, detail: x.detail })) };
    }
    case 'list_readings': {
      let rs = await api.listReadings({ model_id: ctx.modelId ?? undefined });
      if (input.net) rs = rs.filter((x) => up(x.net) === up(input.net));
      if (input.part) rs = rs.filter((x) => up(x.part) === up(input.part));
      return { readings: rs.slice(0, 120).map(fmtReading), total: rs.length };
    }
    case 'list_fixes': {
      if (ctx.modelId == null) return { fixes: [] };
      const gs = await api.listGuides(ctx.modelId, input.query || undefined);
      return { fixes: gs.slice(0, 20).map((g) => ({ title: g.title, symptom: g.symptom, steps: g.steps.slice(0, 1500), parts: g.parts, nets: g.nets })) };
    }
    case 'kb_search': {
      const words = up(input.query).split(/\s+/).filter((w) => w.length > 2);
      const scored = KB_GUIDES.map((g) => ({ g, s: words.filter((w) => up(JSON.stringify(g)).includes(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
      return { guides: scored.map(({ g }) => ({ title: g.title, symptoms: g.symptoms, steps: g.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`), culprits: g.culprits })) };
    }
    case 'ic_lookup': {
      const rows = await api.listIcs(input.ic);
      return { matches: rows.slice(0, 10) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

function fmtReading(r: any) {
  return { type: r.type, part: r.part, pin: r.pin, net: r.net, value: r.value, note: r.note };
}
