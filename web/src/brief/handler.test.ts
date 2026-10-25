import { describe, expect, it } from 'vitest';
import { sampleInput } from './fixtures';
import { API_URL, DEFAULT_MODEL, MAX_BODY_BYTES, handleBrief, resetRateLimit } from './handler';
import { templateBrief } from './template';

const input = sampleInput();
const body = JSON.stringify(input);
const goodReply = JSON.stringify(templateBrief(input));

interface Call {
  url: string;
  init: { headers: Record<string, string>; body: string };
}

function fakeFetch(replies: Array<{ status?: number; json?: unknown; throws?: boolean }>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r.throws) throw new Error('network down');
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.json } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  json: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: 'end_turn', model: 'claude-haiku-5-5', ...extra },
});

describe('handleBrief', () => {
  it('returns a validated AI brief and sends a request the current models accept', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([reply(goodReply)]);
    const r = await handleBrief(body, { ANTHROPIC_API_KEY: 'sk-test' }, fn, 'a');
    expect(r.status).toBe(200);
    expect((r.body as { source: string }).source).toBe('ai');
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(API_URL);
    expect(calls[0].init.headers['x-api-key']).toBe('sk-test');
    expect(calls[0].init.headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.model).toBe(DEFAULT_MODEL);
    for (const forbidden of ['temperature', 'top_p', 'top_k', 'tool_choice', 'thinking']) expect(forbidden in sent).toBe(false);
    expect(sent.messages[sent.messages.length - 1].role).toBe('user');
    expect(sent.max_tokens).toBeGreaterThan(2000);
    expect(JSON.stringify(r.body)).not.toContain('sk-test');
  });

  it('uses the model from the environment', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([reply(goodReply)]);
    await handleBrief(body, { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-sonnet-5-5' }, fn, 'b');
    expect(JSON.parse(calls[0].init.body).model).toBe('claude-sonnet-5-5');
  });

  it('accepts an answer wrapped in code fences or chatter', async () => {
    resetRateLimit();
    const { fn } = fakeFetch([reply('Here you go:\n```json\n' + goodReply + '\n```')]);
    expect((await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fn, 'c')).status).toBe(200);
  });

  it('asks once more when the first answer invents a number, then accepts the corrected one', async () => {
    resetRateLimit();
    const bad = JSON.parse(goodReply);
    bad.summary = 'Roughly 999 places would be cut off.';
    const { fn, calls } = fakeFetch([reply(JSON.stringify(bad)), reply(goodReply)]);
    const r = await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fn, 'd');
    expect(r.status).toBe(200);
    expect(calls.length).toBe(2);
    const second = JSON.parse(calls[1].init.body);
    expect(second.messages.length).toBe(3);
    expect(second.messages[2].role).toBe('user');
    expect(second.messages[2].content).toContain('999');
  });

  it('gives up with 502 after two bad answers and lists the issues', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([reply('not json at all')]);
    const r = await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fn, 'e');
    expect(r.status).toBe(502);
    expect((r.body as { error: string }).error).toBe('invalid_output');
    expect(calls.length).toBe(2);
  });

  it('reports a missing key, bad requests and oversize requests without calling the model', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([reply(goodReply)]);
    expect((await handleBrief(body, {}, fn, 'f')).status).toBe(503);
    expect((await handleBrief(body, { ANTHROPIC_API_KEY: '   ' }, fn, 'f')).status).toBe(503);
    expect((await handleBrief('{nope', { ANTHROPIC_API_KEY: 'k' }, fn, 'f')).status).toBe(400);
    expect((await handleBrief('{"language":"en"}', { ANTHROPIC_API_KEY: 'k' }, fn, 'f')).status).toBe(400);
    expect((await handleBrief('x'.repeat(MAX_BODY_BYTES + 1), { ANTHROPIC_API_KEY: 'k' }, fn, 'f')).status).toBe(413);
    expect(calls.length).toBe(0);
  });

  it('maps upstream failures to clear statuses', async () => {
    resetRateLimit();
    expect((await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fakeFetch([{ throws: true }]).fn, 'g')).status).toBe(504);
    const r = await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fakeFetch([{ status: 401, json: { error: { message: 'invalid x-api-key' } } }]).fn, 'g');
    expect(r.status).toBe(502);
    expect((r.body as { message: string }).message).toContain('invalid');
    const refusal = await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fakeFetch([reply('', { stop_reason: 'refusal' })]).fn, 'g');
    expect(refusal.status).toBe(502);
  });

  it('limits how often one client can ask', async () => {
    resetRateLimit();
    const { fn } = fakeFetch([reply(goodReply)]);
    let last = 200;
    for (let i = 0; i < 14; i++) last = (await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fn, 'busy')).status;
    expect(last).toBe(429);
    expect((await handleBrief(body, { ANTHROPIC_API_KEY: 'k' }, fn, 'someone-else')).status).toBe(200);
  });
});
