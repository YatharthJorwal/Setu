import { templateBrief } from './template';
import type { BriefInput, BriefResult } from './types';
import { validateBrief } from './validate';

const TIMEOUT_MS = 60_000;

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
  const fallback = (reason: NonNullable<BriefResult['reason']>): BriefResult => ({
    brief: templateBrief(input),
    source: 'template',
    reason,
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
    if (res.status === 503) return fallback('no_key');
    if (!res.ok) {
      let code = '';
      try {
        code = String(((await res.json()) as { error?: unknown }).error ?? '');
      } catch {
        /* no readable body */
      }
      return fallback(code === 'invalid_output' ? 'invalid' : res.status === 404 || res.status === 504 ? 'unreachable' : 'error');
    }
    const data = (await res.json()) as { brief?: unknown; model?: unknown };
    try {
      const brief = validateBrief(data.brief, input);
      return { brief, source: 'ai', model: typeof data.model === 'string' ? data.model : undefined };
    } catch {
      return fallback('invalid');
    }
  } catch {
    return fallback('unreachable');
  } finally {
    clearTimeout(timer);
  }
}
