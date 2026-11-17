// Optional AI troubleshooting assistant. The key stays in the main process; the
// renderer runs the tool loop against the board it has open and sends one
// model step at a time through IPC.
import Anthropic from '@anthropic-ai/sdk';

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
