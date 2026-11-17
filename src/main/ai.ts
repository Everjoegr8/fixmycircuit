// Optional AI troubleshooting assistant. The key stays in the main process; the
// renderer runs the tool loop against the board it has open and sends one
// model step at a time through IPC.
import Anthropic from '@anthropic-ai/sdk';
import { providerInfo } from '../shared/aiProviders';

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;

export interface AiStepReq {
  system: string;
  messages: any[];
  tools: any[];
}

export interface AiStepRes {
  content: any[];
  stop_reason: string | null;
  refusal?: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

let client: Anthropic | null = null;
let clientKey = '';

export interface AiConfig {
  provider?: string;
  /** Claude key (provider "claude"). */
  anthropicKey?: string;
  aiModel?: string;
  /** OpenAI-compatible providers. */
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiCustomModel?: string;
}

/** One model step with whichever provider the shop chose in Settings. */
export async function aiStepWith(req: AiStepReq, cfg: AiConfig): Promise<AiStepRes> {
  if (process.env.FMC_AI_MOCK === '1') return mockStep(req);
  const provider = cfg.provider || 'claude';
  if (provider === 'claude') return aiStep(req, cfg.anthropicKey || '', cfg.aiModel || AI_MODELS[0]);
  const info = providerInfo(provider);
  const base = (cfg.aiBaseUrl || info.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Set the server address for your AI provider in Settings.');
  if (!cfg.aiCustomModel) throw new Error('Type the model name for your AI provider in Settings.');
  if (info.needsKey && !cfg.aiApiKey) throw new Error(`Add your ${info.label} API key in Settings.`);
  return openAiStep(req, base, cfg.aiApiKey || '', cfg.aiCustomModel, info.label);
}

export async function aiStep(req: AiStepReq, key: string, model: string): Promise<AiStepRes> {
  if (process.env.FMC_AI_MOCK === '1') return mockStep(req);
  if (!key) throw new Error('Add your Claude API key in Settings to use the AI assistant.');
  if (!client || clientKey !== key) { client = new Anthropic({ apiKey: key }); clientKey = key; }
  const m = (AI_MODELS as readonly string[]).includes(model) ? model : AI_MODELS[0];
  try {
    const r: any = await client.beta.messages.create({
      model: m,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      // If a safety classifier declines, the API retries on the recommended fallback model.
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: req.system,
      tools: req.tools,
      messages: req.messages,
    } as any);
    if (r.stop_reason === 'refusal') {
      return { content: r.content, stop_reason: 'refusal', refusal: r.stop_details?.explanation || 'The model declined this request.', model: r.model };
    }
    return { content: r.content, stop_reason: r.stop_reason, model: r.model, usage: r.usage && { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } };
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The Claude API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('The Claude API is rate limiting this key. Wait a minute and try again.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API. The AI assistant needs an internet connection; everything else works offline.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status ?? ''}: ${e.message}`);
    throw e;
  }
}

/** Convert the assistant's Anthropic-shaped conversation to OpenAI chat format. */
export function toOpenAi(req: AiStepReq) {
  const messages: any[] = [{ role: 'system', content: req.system }];
  for (const m of req.messages) {
    if (typeof m.content === 'string') { messages.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'user') {
      const results = m.content.filter((b: any) => b.type === 'tool_result');
      for (const r of results) messages.push({ role: 'tool', tool_call_id: r.tool_use_id, content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content) });
      const text = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      if (text) messages.push({ role: 'user', content: text });
    } else {
      const text = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      const calls = m.content.filter((b: any) => b.type === 'tool_use').map((b: any) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      messages.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    }
  }
  const tools = req.tools.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  return { messages, tools };
}

/** Convert an OpenAI chat completion back to the assistant's content blocks. */
export function fromOpenAi(data: any): AiStepRes {
  const choice = data?.choices?.[0];
  if (!choice) throw new Error('The AI server returned no answer.');
  const msg = choice.message || {};
  const content: any[] = [];
  if (msg.content) content.push({ type: 'text', text: String(msg.content) });
  for (const [i, c] of (msg.tool_calls || []).entries()) {
    let input: any = {};
    try { input = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { input = {}; }
    content.push({ type: 'tool_use', id: c.id || `call_${i}`, name: c.function?.name, input });
  }
  const hasCalls = content.some((b) => b.type === 'tool_use');
  const stop = hasCalls ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return { content, stop_reason: stop, model: data.model || '', usage: data.usage && { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } };
}

async function openAiStep(req: AiStepReq, base: string, key: string, model: string, label: string): Promise<AiStepRes> {
  const { messages, tools } = toOpenAi(req);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
    });
  } catch (e: any) {
    throw new Error(`Could not reach ${label} at ${base}. ${/localhost|127\.0\.0\.1/.test(base) ? 'Is it running on this PC?' : 'Check the internet connection.'}`);
  }
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error(`${label} rejected the API key. Check it in Settings.`);
  if (res.status === 429) throw new Error(`${label} is rate limiting this key. Wait a minute and try again.`);
  if (!res.ok) throw new Error(`${label} error ${res.status}: ${text.slice(0, 300)}`);
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`${label} sent a reply that is not JSON.`); }
  return fromOpenAi(data);
}

/** Deterministic stand-in used by the automated tests (FMC_AI_MOCK=1). */
function mockStep(req: AiStepReq): AiStepRes {
  const last = req.messages[req.messages.length - 1];
  const results = Array.isArray(last?.content) ? last.content.filter((b: any) => b.type === 'tool_result') : [];
  if (!results.length) {
    return {
      model: 'mock',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Checking the board connectivity first.' },
        { type: 'tool_use', id: 'mock_1', name: 'board_overview', input: {} },
        { type: 'tool_use', id: 'mock_2', name: 'list_readings', input: {} },
      ],
    };
  }
  const ov = (() => { try { return JSON.parse(results[0].content); } catch { return {}; } })();
  return {
    model: 'mock',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: `MOCK ANSWER. Board has ${ov.nets ?? '?'} nets and ${ov.parts ?? '?'} parts. Measure the rails listed above in diode mode and compare with a good board.` }],
  };
}
