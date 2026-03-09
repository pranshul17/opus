import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AICompleteOptions {
  /** Optional system prompt (sent before the user message) */
  system?: string;
  /** The user prompt */
  prompt: string;
  /** Max tokens in the response (default: 2048) */
  maxTokens?: number;
  /**
   * Enable extended thinking — Anthropic only.
   * Silently ignored for OpenAI-compatible providers.
   */
  thinking?: boolean;
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function completeWithAnthropic(opts: AICompleteOptions): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';

  const params: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [{ role: 'user', content: opts.prompt }],
  };

  if (opts.system) params.system = opts.system;
  if (opts.thinking) params.thinking = { type: 'adaptive' };

  // Use stream so extended thinking works end-to-end
  const stream = (client.messages as any).stream(params);
  const response = await stream.finalMessage();

  const textBlock = response.content.find((b: any) => b.type === 'text') as any;
  return textBlock ? String(textBlock.text) : '';
}

// ─── OpenAI-compatible (Ollama, LM Studio, vLLM, Groq, OpenAI, …) ────────────
// Uses native fetch — no extra npm dependency required.

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function completeWithOpenAICompatible(opts: AICompleteOptions): Promise<string> {
  const baseURL = (process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey  = process.env.OPENAI_COMPATIBLE_API_KEY  || 'ollama';
  const model   = process.env.OPENAI_COMPATIBLE_MODEL    || 'llama3.2';

  const messages: OpenAIMessage[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.prompt });

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI-compatible API error ${response.status}: ${body}`);
  }

  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content ?? '';
}

// ─── Unified entry point ──────────────────────────────────────────────────────

/**
 * Send a prompt to whichever AI backend is configured via AI_PROVIDER.
 *
 *   AI_PROVIDER=anthropic           → Anthropic Claude (default, cloud, best quality)
 *   AI_PROVIDER=openai-compatible   → Any OpenAI-compatible API (Ollama, LM Studio, etc.)
 *   AI_PROVIDER=local               → In-process llama.cpp via node-llama-cpp
 *                                     No API key, no external service.
 *                                     Model is auto-downloaded on first run.
 *
 * Returns the model's text response.
 */
export async function aiComplete(opts: AICompleteOptions): Promise<string> {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  if (provider === 'openai-compatible') {
    return completeWithOpenAICompatible(opts);
  }

  if (provider === 'local') {
    const { completeLocal } = await import('./local-llm');
    return completeLocal(opts);
  }

  // Default → Anthropic
  return completeWithAnthropic(opts);
}
