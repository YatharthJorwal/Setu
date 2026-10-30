import { templateBrief } from './template';
import type { BriefInput, BriefResult } from './types';
import { validateBrief } from './validate';

/** For a hosted copy of the app: there is no local AI model to ask, so the rule-based summary is shown and labelled. */
export function hostedBrief(input: BriefInput): BriefResult {
  return { brief: templateBrief(input), source: 'template', reason: 'hosted' };
}

const TIMEOUT_MS = 130_000; // a local model can take a while to load the first time

/**
 * Asks the server for an AI brief. Whatever goes wrong (no key, no server, a slow or invalid answer),
 * it returns the rule-based template instead and says why, so the person always gets a brief and
 * always knows whether AI wrote it. The answer is checked again here even though the server checked it.
 */
export async function fetchBrief(
  input: BriefInput,
  fetchImpl: typeof fetch = fetch,
  url = '/api/brief',
): Promise<BriefResult> {
  const fallback = (reason: NonNullable<BriefResult['reason']>, detail?: string): BriefResult => ({
    brief: templateBrief(input),
    source: 'template',
    reason,
    ...(detail ? { detail } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    let body: { error?: unknown; message?: unknown; brief?: unknown; model?: unknown; provider?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* no readable body: the status code has to do */
    }
    const detail = typeof body.message === 'string' ? body.message.slice(0, 200) : undefined;
    if (res.status === 503) return fallback('no_key', detail);
    if (!res.ok) {
      const code = String(body.error ?? '');
      return fallback(code === 'invalid_output' ? 'invalid' : res.status === 404 || res.status === 504 ? 'unreachable' : 'error', detail);
    }
    try {
      const brief = validateBrief(body.brief, input);
      return {
        brief,
        source: 'ai',
        model: typeof body.model === 'string' ? body.model : undefined,
        provider: body.provider === 'ollama' || body.provider === 'anthropic' ? body.provider : undefined,
      };
    } catch {
      return fallback('invalid');
    }
  } catch {
    return fallback('unreachable');
  } finally {
    clearTimeout(timer);
  }
}
