import { describe, expect, it } from 'vitest';
import type { BriefResult } from '../brief';
import { buildBriefInput, templateBrief } from '../brief';
import { buildReportHtml } from '../report/buildReport';
import { lineGraph } from '../sim/fixtures';
import { runScenario } from '../sim/run';
import { assembleReportData, briefSourceNote, describePeople, describeRestored } from './report';
import type { BriefState, ScenarioSettings } from './store';

const graph = lineGraph();
const run = runScenario(graph, { type: 'landslide', edge: 1, severity: 'minor' });
const scenario: ScenarioSettings = { edge: 1, severity: 'minor', tGoldenMin: 60, targetSet: 'emergency', snapshot: 0, view: 'after' };
const provenance = [{ dataset: 'Test data', source_url: '', licence: 'Open', retrieved_on: '2026-10-22', coverage_note: 'All of it.', gaps: 'None.', manual_patches: [] }];
const now = new Date('2026-10-26T14:05:33Z');
const idle: BriefState = { status: 'idle', result: null, input: null };

describe('describePeople and describeRestored', () => {
  const m = run.snapshots[0].emergency;
  it('says people are unknown when no population is loaded', () => {
    expect(describePeople(m)).toContain('Unknown');
  });
  it('says when access returns, and says nothing when nobody was cut off', () => {
    expect(describeRestored(run, 'emergency', 0, m)).toBe('Access returns after 12 h');
    const none = runScenario(graph, { type: 'landslide', edge: 3, severity: 'minor' }); // the last road: only the end place is cut off
    expect(describeRestored(none, 'emergency', 0, { ...none.snapshots[0].emergency, places_isolated: 0 })).toBeNull();
  });
});

describe('briefSourceNote', () => {
  const base: BriefResult = { brief: templateBrief(buildBriefInput(graph, run, { edge: 1, severity: 'minor', tGoldenMin: 60, targetSet: 'emergency' }, 'en')), source: 'ai' };
  it('says who wrote it', () => {
    expect(briefSourceNote({ ...base, model: 'qwen3.5:4b', provider: 'ollama' }, 'en')).toContain('local AI model');
    expect(briefSourceNote({ ...base, model: 'claude-haiku-5-5', provider: 'anthropic' }, 'en')).toContain('claude-haiku-5-5');
    expect(briefSourceNote(base, 'en')).toContain('AI model');
  });
  it('says why the template was used, with the server detail and the Hindi limitation', () => {
    const note = briefSourceNote({ ...base, source: 'template', reason: 'unreachable', detail: 'Try: ollama pull qwen3.5:4b' }, 'hi');
    expect(note).toContain('Template summary, not AI');
    expect(note).toContain('Ollama');
    expect(note).toContain('English only');
    expect(note).toContain('ollama pull');
  });
});

describe('assembleReportData', () => {
  it('collects the scenario, results, places, assumptions, sources and the replay record', () => {
    const d = assembleReportData({ graph, run, scenario, brief: idle, provenance, now, screenshot: null });
    expect(d.generatedAt).toBe('2026-10-26 14:05 UTC');
    expect(d.scenario.road).toBe('Unnamed secondary road');
    expect(d.scenario.severity).toBe('Minor');
    expect(d.scenario.reopens).toBe('12 h');
    expect(d.kpis[0]).toMatchObject({ tag: 'data', before: '0', after: '3' });
    expect(d.worst.length).toBe(3);
    expect(d.worst[0]).toMatchObject({ status: 'cut_off', detail: 'Cut off' });
    expect(d.brief).toBeNull();
    expect(d.sources[0]).toMatchObject({ dataset: 'Test data', retrieved: '2026-10-22' });
    expect(d.assumptions.length).toBeGreaterThan(10);
    expect(JSON.parse(d.record).inputs.scenario.edge).toBe(1);
  });

  it('includes the brief, with metric names in words, when one has been written', () => {
    const input = buildBriefInput(graph, run, { edge: 1, severity: 'minor', tGoldenMin: 60, targetSet: 'emergency' }, 'en');
    const brief: BriefState = { status: 'ready', input, result: { brief: templateBrief(input), source: 'template', reason: 'unreachable' } };
    const d = assembleReportData({ graph, run, scenario, brief, provenance, now, screenshot: null });
    expect(d.brief?.kind).toBe('template');
    expect(d.brief?.actions[0].metrics[0]).toBe('Places cut off');
    expect(d.brief?.sourceNote).toContain('Template summary');
    expect(buildReportHtml(d)).toContain('Template summary, not AI');
  });

  it('refuses to build a report when there is no scenario', () => {
    expect(() => assembleReportData({ graph, run, scenario: { ...scenario, edge: null }, brief: idle, provenance, now, screenshot: null })).toThrow(/no scenario/);
  });

  it('follows the time shown: the reopening moment is labelled', () => {
    const d = assembleReportData({ graph, run, scenario: { ...scenario, snapshot: 1 }, brief: idle, provenance, now, screenshot: null });
    expect(d.scenario.moment).toBe('+12 h');
    expect(d.kpis[0].after).toBe('0');
  });
});
