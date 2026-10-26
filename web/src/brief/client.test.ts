import { describe, expect, it } from 'vitest';
import { fetchBrief } from './client';
import { sampleInput } from './fixtures';
import { templateBrief } from './template';

const input = sampleInput();

function fake(status: number, json?: unknown, throws = false): typeof fetch {
  return (async () => {
    if (throws) throw new Error('offline');
    return { ok: status >= 200 && status < 300, status, json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('fetchBrief', () => {
  it('returns the AI brief when the server answers and it passes the check', async () => {
    const r = await fetchBrief(input, fake(200, { brief: templateBrief(input), model: 'claude-haiku-5-5', provider: 'anthropic' }));
    expect(r.source).toBe('ai');
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.provider).toBe('anthropic');
    expect((await fetchBrief(input, fake(200, { brief: templateBrief(input), model: 'qwen3.5:4b', provider: 'ollama' }))).provider).toBe('ollama');
    expect((await fetchBrief(input, fake(200, { brief: templateBrief(input), model: 'x', provider: 'something' }))).provider).toBeUndefined();
  });

  it('passes the server explanation through when it falls back', async () => {
    const r = await fetchBrief(input, fake(502, { error: 'upstream_error', message: "model 'qwen3.5:4b' not found. Try: ollama pull qwen3.5:4b" }));
    expect(r.source).toBe('template');
    expect(r.detail).toContain('ollama pull');
  });

  it('falls back to the template and says why', async () => {
    expect((await fetchBrief(input, fake(503, { error: 'no_api_key' }))).reason).toBe('no_key');
    expect((await fetchBrief(input, fake(0, undefined, true))).reason).toBe('unreachable');
    expect((await fetchBrief(input, fake(404))).reason).toBe('unreachable');
    expect((await fetchBrief(input, fake(502, { error: 'invalid_output' }))).reason).toBe('invalid');
    expect((await fetchBrief(input, fake(502, { error: 'upstream_error' }))).reason).toBe('error');
    for (const status of [503, 502, 404]) expect((await fetchBrief(input, fake(status))).source).toBe('template');
  });

  it('does not trust a server answer that fails the number check', async () => {
    const bad = templateBrief(input);
    bad.summary = 'About 999 places are cut off.';
    const r = await fetchBrief(input, fake(200, { brief: bad, model: 'x' }));
    expect(r.source).toBe('template');
    expect(r.reason).toBe('invalid');
  });
});
