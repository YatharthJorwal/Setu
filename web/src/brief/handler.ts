import { briefJsonSchema, correctionMessage, systemPrompt, userMessage } from './prompt';
import { BriefError, parseBriefInput, validateBrief } from './validate';
import type { BriefInput, BriefProvider } from './types';

// Framework-agnostic: the Vite dev server and the Netlify function both call this one function.
// The brief can be written by the Claude API or by a local Ollama model. Either way the answer goes
// through the same validation before anyone sees it.

export interface HandlerEnv {
  /** "anthropic" or "ollama". Empty means: an Anthropic key if there is one, otherwise Ollama. */
  BRIEF_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Claude Haiku 5.5: fast and inexpensive. Set ANTHROPIC_MODEL to claude-sonnet-5-5 for more polish. */
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const DEFAULT_OLLAMA_MODEL = 'qwen3.5:4b';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';
export const MAX_BODY_BYTES = 24_000;
/** Thinking and the reply share this limit on the current Claude models, so it is generous. */
const MAX_TOKENS = 6000;
const ANTHROPIC_TIMEOUT_MS = 40_000;
/** A local model may need time to load into memory the first time. */
const OLLAMA_TIMEOUT_MS = 120_000;
const RATE_LIMIT_PER_MINUTE = 12;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ModelReply {
  text: string;
  model: string;
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

export function chooseProvider(env: HandlerEnv): BriefProvider {
  const p = env.BRIEF_PROVIDER?.trim().toLowerCase();
  if (p === 'anthropic' || p === 'ollama') return p;
  return env.ANTHROPIC_API_KEY?.trim() ? 'anthropic' : 'ollama';
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

async function post(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  unreachableMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } catch {
    throw new UpstreamError('unreachable', unreachableMessage);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads an error message from either provider's error body: { error: "..." } or { error: { message: "..." } }. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === 'string') return j.error.slice(0, 200);
    const inner = (j.error as { message?: unknown } | undefined)?.message;
    if (typeof inner === 'string') return inner.slice(0, 200);
  } catch {
    /* the body was not JSON; the status code is enough */
  }
  return `HTTP ${res.status}`;
}

async function callAnthropic(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  input: BriefInput,
  messages: Message[],
): Promise<ModelReply> {
  // No temperature, assistant prefill, forced tool choice or thinking settings: the current models reject them.
  const res = await post(
    fetchImpl,
    API_URL,
    { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
    { model, max_tokens: MAX_TOKENS, system: systemPrompt(input.language, 'anthropic'), messages },
    ANTHROPIC_TIMEOUT_MS,
    'The Claude API could not be reached.',
  );
  if (!res.ok) throw new UpstreamError('http', await errorMessage(res), res.status);

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

async function callOllama(
  fetchImpl: typeof fetch,
  baseUrl: string,
  model: string,
  input: BriefInput,
  messages: Message[],
): Promise<ModelReply> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`;
  const unreachable = `Could not reach Ollama at ${baseUrl}. Is it running?`;
  const request = (withThink: boolean) => ({
    model,
    messages: [{ role: 'system', content: systemPrompt(input.language, 'ollama') }, ...messages],
    stream: false,
    // thinking off: a short structured answer does not need it, and some builds think by default
    ...(withThink ? { think: false } : {}),
    format: briefJsonSchema(input),
    keep_alive: '15m',
    options: { temperature: 0.2, num_ctx: 8192, num_predict: 1500 },
  });
  const headers = { 'content-type': 'application/json' };

  let res = await post(fetchImpl, url, headers, request(true), OLLAMA_TIMEOUT_MS, unreachable);
  if (res.status === 400) {
    const msg = await errorMessage(res);
    // a build that does not know the `think` field: ask again without it
    if (!/think/i.test(msg)) throw new UpstreamError('http', msg, 400);
    res = await post(fetchImpl, url, headers, request(false), OLLAMA_TIMEOUT_MS, unreachable);
  }
  if (!res.ok) {
    const msg = await errorMessage(res);
    if (res.status === 404 || /not found/i.test(msg)) {
      throw new UpstreamError('http', `${msg}. Try: ollama pull ${model}`, res.status);
    }
    throw new UpstreamError('http', msg, res.status);
  }
  const data = (await res.json()) as { message?: { content?: unknown }; model?: unknown };
  const text = typeof data.message?.content === 'string' ? data.message.content : '';
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

    const provider = chooseProvider(env);
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (provider === 'anthropic' && !apiKey) {
      return { status: 503, body: { error: 'no_api_key', message: 'The Claude API is selected but no ANTHROPIC_API_KEY is set on this server.' } };
    }
    const anthropicModel = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
    const ollamaModel = env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
    const ollamaUrl = env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL;

    const messages: Message[] = [{ role: 'user', content: userMessage(input) }];
    let lastIssues: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      let reply: ModelReply;
      try {
        reply =
          provider === 'ollama'
            ? await callOllama(fetchImpl, ollamaUrl, ollamaModel, input, messages)
            : await callAnthropic(fetchImpl, apiKey as string, anthropicModel, input, messages);
      } catch (err) {
        if (err instanceof UpstreamError) {
          const status = err.kind === 'unreachable' ? 504 : 502;
          return { status, body: { error: err.kind === 'unreachable' ? 'unreachable' : 'upstream_error', message: err.message } };
        }
        throw err;
      }
      try {
        const brief = validateBrief(extractJson(reply.text), input);
        return { status: 200, body: { brief, source: 'ai', model: reply.model, provider } };
      } catch (err) {
        if (!(err instanceof BriefError)) throw err;
        lastIssues = err.issues.length > 0 ? err.issues : [err.message];
        messages.push(
          { role: 'assistant', content: reply.text.trim() === '' ? '(empty)' : reply.text },
          { role: 'user', content: correctionMessage(lastIssues) },
        );
      }
    }
    return { status: 502, body: { error: 'invalid_output', issues: lastIssues, message: 'The model could not produce a brief that passed the number check.' } };
  } catch {
    return { status: 500, body: { error: 'server_error' } };
  }
}
