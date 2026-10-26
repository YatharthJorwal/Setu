import { describe, expect, it } from 'vitest';
import { sampleInput } from './fixtures';
import { API_URL, DEFAULT_MODEL, DEFAULT_OLLAMA_MODEL, MAX_BODY_BYTES, chooseProvider, handleBrief, resetRateLimit } from './handler';
import { allowedNumberList } from './prompt';
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
    // with no provider chosen and no key, the local model is used; the Claude API needs a key when it is selected
    expect((await handleBrief(body, { BRIEF_PROVIDER: 'anthropic' }, fn, 'f')).status).toBe(503);
    expect((await handleBrief(body, { BRIEF_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '   ' }, fn, 'f')).status).toBe(503);
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

const ollamaReply = (text: string, extra: Record<string, unknown> = {}) => ({
  json: { model: 'qwen3.5:4b', message: { role: 'assistant', content: text }, done: true, done_reason: 'stop', ...extra },
});
const OLLAMA_CHAT = 'http://127.0.0.1:11434/api/chat';

describe('provider choice', () => {
  it('uses Ollama unless there is an Anthropic key, and obeys an explicit choice', () => {
    expect(chooseProvider({})).toBe('ollama');
    expect(chooseProvider({ ANTHROPIC_API_KEY: '  ' })).toBe('ollama');
    expect(chooseProvider({ ANTHROPIC_API_KEY: 'k' })).toBe('anthropic');
    expect(chooseProvider({ ANTHROPIC_API_KEY: 'k', BRIEF_PROVIDER: 'ollama' })).toBe('ollama');
    expect(chooseProvider({ BRIEF_PROVIDER: ' Anthropic ' })).toBe('anthropic');
    expect(chooseProvider({ BRIEF_PROVIDER: 'something else' })).toBe('ollama');
  });
});

describe('handleBrief with Ollama', () => {
  it('asks the local model with constrained output and thinking off, with no setup at all', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([ollamaReply(goodReply)]);
    const r = await handleBrief(body, {}, fn, 'o1');
    expect(r.status).toBe(200);
    const out = r.body as { source: string; model: string; provider: string };
    expect(out.provider).toBe('ollama');
    expect(out.model).toBe('qwen3.5:4b');
    expect(calls[0].url).toBe(OLLAMA_CHAT);
    expect('x-api-key' in calls[0].init.headers).toBe(false);

    const sent = JSON.parse(calls[0].init.body);
    expect(sent.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(sent.stream).toBe(false);
    expect(sent.think).toBe(false);
    expect(sent.options.temperature).toBeLessThan(0.5);
    expect(sent.options.num_ctx).toBeGreaterThanOrEqual(8192);
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[sent.messages.length - 1].role).toBe('user');
    expect(sent.messages[sent.messages.length - 1].content).toContain('Numbers you may write');
    // the schema only lets the model cite metrics that exist
    const refs = sent.format.properties.recommended_actions.items.properties.metric_refs.items.enum;
    expect(refs).toEqual(Object.keys(input.metrics));
    expect(sent.format.required).toContain('summary');
    // the system prompt for a small model carries a worked example
    expect(sent.messages[0].content).toContain('Example of the style');
  });

  it('uses the model and address from the environment, ignoring a trailing slash', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([ollamaReply(goodReply)]);
    await handleBrief(body, { OLLAMA_MODEL: 'qwen3.5:9b', OLLAMA_URL: 'http://192.168.1.5:11434/' }, fn, 'o2');
    expect(calls[0].url).toBe('http://192.168.1.5:11434/api/chat');
    expect(JSON.parse(calls[0].init.body).model).toBe('qwen3.5:9b');
  });

  it('retries once without the think field if the build rejects it', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([{ status: 400, json: { error: 'invalid option: think is not supported' } }, ollamaReply(goodReply)]);
    const r = await handleBrief(body, {}, fn, 'o3');
    expect(r.status).toBe(200);
    expect(calls.length).toBe(2);
    expect('think' in JSON.parse(calls[0].init.body)).toBe(true);
    expect('think' in JSON.parse(calls[1].init.body)).toBe(false);
  });

  it('tells the person how to fix a missing model or a stopped Ollama', async () => {
    resetRateLimit();
    const missing = await handleBrief(body, {}, fakeFetch([{ status: 404, json: { error: "model 'qwen3.5:4b' not found" } }]).fn, 'o4');
    expect(missing.status).toBe(502);
    expect((missing.body as { message: string }).message).toContain('ollama pull qwen3.5:4b');
    const down = await handleBrief(body, {}, fakeFetch([{ throws: true }]).fn, 'o4');
    expect(down.status).toBe(504);
    expect((down.body as { message: string }).message).toContain('Is it running');
  });

  it('corrects a small model that invents a number, and gives up cleanly when it keeps failing', async () => {
    resetRateLimit();
    const bad = JSON.parse(goodReply);
    bad.summary = 'About 999 places would be cut off.';
    const retry = fakeFetch([ollamaReply(JSON.stringify(bad)), ollamaReply(goodReply)]);
    expect((await handleBrief(body, {}, retry.fn, 'o5')).status).toBe(200);
    const second = JSON.parse(retry.calls[1].init.body);
    expect(second.messages.length).toBe(4); // system, user, the rejected answer, the correction
    expect(second.messages[3].content).toContain('999');

    const stubborn = fakeFetch([ollamaReply('', { message: { role: 'assistant', content: '', thinking: 'hmm...' } })]);
    const r = await handleBrief(body, {}, stubborn.fn, 'o6');
    expect(r.status).toBe(502);
    expect(stubborn.calls.length).toBe(2);
  });

  it('refuses to use the Claude API when it is selected but there is no key', async () => {
    resetRateLimit();
    const { fn, calls } = fakeFetch([ollamaReply(goodReply)]);
    expect((await handleBrief(body, { BRIEF_PROVIDER: 'anthropic' }, fn, 'o7')).status).toBe(503);
    expect(calls.length).toBe(0);
  });
});

describe('prompt helpers', () => {
  it('lists the allowed numbers in ascending order', () => {
    const list = allowedNumberList(input);
    expect(list).toContain('142');
    expect(list).toContain('107');
    expect(list.map(Number)).toEqual([...list.map(Number)].sort((a, b) => a - b));
  });
});
