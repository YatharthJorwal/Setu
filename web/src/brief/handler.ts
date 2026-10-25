import { correctionMessage, systemPrompt, userMessage } from './prompt';
import { BriefError, parseBriefInput, validateBrief } from './validate';
import type { BriefInput } from './types';

// Framework-agnostic: the Vite dev server and the Netlify function both call this one function.

export interface HandlerEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Claude Haiku 5.5: fast and inexpensive. Set ANTHROPIC_MODEL to claude-sonnet-5-5 for more polish. */
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';
export const MAX_BODY_BYTES = 24_000;
/** Thinking and the reply share this limit on the current models, so it is generous. */
const MAX_TOKENS = 6000;
const TIMEOUT_MS = 40_000;
const RATE_LIMIT_PER_MINUTE = 12;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

class UpstreamError extends Error {
  constructor(
    readonly kind: 'unreachable' | 'http' | 'refused',
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
  }
}

// ---- a small per-instance rate limit (it does not replace a real one on a public site)
const hits = new Map<string, number[]>();
export function resetRateLimit(): void {
  hits.clear();
}
function rateLimited(clientId: string, now: number): boolean {
  const recent = (hits.get(clientId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(clientId, recent);
  return recent.length > RATE_LIMIT_PER_MINUTE;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new BriefError('bad_output', 'No JSON object found.', ['The answer contained no JSON object.']);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new BriefError('bad_output', 'Invalid JSON.', ['The answer was not valid JSON.']);
  }
}

async function callModel(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  input: BriefInput,
  messages: Message[],
): Promise<{ text: string; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    // No temperature, assistant prefill, forced tool choice or thinking settings: the current models reject them.
    res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: systemPrompt(input.language), messages }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new UpstreamError('unreachable', err instanceof Error ? err.message : 'request failed');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: { message?: unknown } };
      if (typeof j.error?.message === 'string') detail = j.error.message.slice(0, 200);
    } catch {
      /* the body was not JSON; the status code is enough */
    }
    throw new UpstreamError('http', detail || `HTTP ${res.status}`, res.status);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: unknown }>;
    stop_reason?: string;
    model?: unknown;
  };
  if (data.stop_reason === 'refusal') throw new UpstreamError('refused', 'The model declined to answer.');
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
  return { text, model: typeof data.model === 'string' ? data.model : model };
}

export async function handleBrief(
  rawBody: string,
  env: HandlerEnv,
  fetchImpl: typeof fetch = fetch,
  clientId = 'anon',
): Promise<HandlerResult> {
  try {
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return { status: 413, body: { error: 'too_large' } };

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: 'bad_input', message: 'The request was not valid JSON.' } };
    }
    let input: BriefInput;
    try {
      input = parseBriefInput(json);
    } catch (err) {
      if (err instanceof BriefError) return { status: 400, body: { error: 'bad_input', message: err.message } };
      throw err;
    }

    if (rateLimited(clientId, Date.now())) return { status: 429, body: { error: 'rate_limited' } };

    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return { status: 503, body: { error: 'no_api_key', message: 'The AI service is not configured on this server.' } };
    }
    const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

    const messages: Message[] = [{ role: 'user', content: userMessage(input) }];
    let lastIssues: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      let reply: { text: string; model: string };
      try {
        reply = await callModel(fetchImpl, apiKey, model, input, messages);
      } catch (err) {
        if (err instanceof UpstreamError) {
          const status = err.kind === 'unreachable' ? 504 : 502;
          return { status, body: { error: err.kind === 'unreachable' ? 'unreachable' : 'upstream_error', message: err.message } };
        }
        throw err;
      }
      try {
        const brief = validateBrief(extractJson(reply.text), input);
        return { status: 200, body: { brief, source: 'ai', model: reply.model } };
      } catch (err) {
        if (!(err instanceof BriefError)) throw err;
        lastIssues = err.issues.length > 0 ? err.issues : [err.message];
        messages.push(
          { role: 'assistant', content: reply.text.trim() === '' ? '(empty)' : reply.text },
          { role: 'user', content: correctionMessage(lastIssues) },
        );
      }
    }
    return { status: 502, body: { error: 'invalid_output', issues: lastIssues } };
  } catch {
    return { status: 500, body: { error: 'server_error' } };
  }
}
