// AI providers the assistant can use. Claude uses the Anthropic SDK; the others
// speak the OpenAI-compatible chat completions API.
export type AiProvider = 'claude' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'custom';

export const AI_PROVIDERS: { id: AiProvider; label: string; baseUrl: string; needsKey: boolean; modelHint: string; note: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', baseUrl: '', needsKey: true, modelHint: 'claude-opus-5-5', note: 'Key from console.anthropic.com.' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, modelHint: 'model name from your OpenAI account', note: 'Key from platform.openai.com.' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, modelHint: 'Gemini model name, e.g. from AI Studio', note: 'Key from aistudio.google.com (OpenAI-compatible endpoint).' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, modelHint: 'provider/model as listed on openrouter.ai', note: 'One key for many models.' },
  { id: 'ollama', label: 'Ollama (runs on this PC, offline)', baseUrl: 'http://localhost:11434/v1', needsKey: false, modelHint: 'a model you pulled, e.g. llama3.1', note: 'Install Ollama, run "ollama pull <model>". Pick a model that supports tool calling.' },
  { id: 'custom', label: 'Other OpenAI-compatible server', baseUrl: '', needsKey: false, modelHint: 'model name', note: 'LM Studio, vLLM, a company proxy…' },
];

export const providerInfo = (id?: string) => AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
