import { describe, expect, it } from 'vitest';
import { lineGraph, makeGraph } from './fixtures';
import { buildRoadGraph, parseGraph } from './graph';
import { populationSummary } from './population';

describe('populationSummary', () => {
  it('adds up the people in places that have a figure', () => {
    const s = populationSummary(lineGraph([10, 20, 30, 40]));
    expect(s.total).toBe(100);
    expect(s.placesWithData).toBe(4);
    expect(s.placesTotal).toBe(5); // the fifth place has no road and no figure
    expect(s.analysed).toBe(100);
    expect(s.notAnalysed).toBe(0);
    expect(s.source).toBeNull();
  });

  it('separates people the model cannot analyse: off any road, or with no route before the event', () => {
    const g = makeGraph({
      nodes: 5,
      edges: [[0, 1], [3, 4]],
      facilities: [{ node: 0, tier: 'chc' }],
      places: [{ node: 1, population: 100 }, { node: null, population: 50 }, { node: 4, population: 5 }, { node: 1 }],
    });
    const s = populationSummary(g);
    expect(s.total).toBe(155);
    expect(s.placesWithData).toBe(3);
    expect(s.analysed).toBe(100);
    expect(s.notAnalysed).toBe(55);
  });

  it('reports zero when no population is loaded, without inventing any', () => {
    const s = populationSummary(lineGraph());
    expect(s.total).toBe(0);
    expect(s.placesWithData).toBe(0);
  });
});

describe('population source in the graph file', () => {
  const base = { version: 1, classes: ['trunk'], nodes: [[78, 30], [78.1, 30]], edges: [{ a: 0, b: 1, len: 100, c: 0, br: 0, p: [78, 30, 78.1, 30], n: '' }], places: [], facilities: [] };

  it('is read and carried onto the runtime graph', () => {
    const g = buildRoadGraph(parseGraph({ ...base, population_source: { name: 'WorldPop 2020 estimate', kind: 'modelled', year: 2020, note: 'n', licence: 'CC BY 4.0', citation: 'c' } }));
    expect(g.populationSource?.kind).toBe('modelled');
    expect(g.populationSource?.licence).toBe('CC BY 4.0');
  });

  it('treats an unknown kind as a modelled estimate, and a missing source as none', () => {
    expect(buildRoadGraph(parseGraph({ ...base, population_source: { name: 'x', kind: 'whatever' } })).populationSource?.kind).toBe('modelled');
    expect(buildRoadGraph(parseGraph({ ...base, population_source: { name: 'c', kind: 'census' } })).populationSource?.kind).toBe('census');
    expect(buildRoadGraph(parseGraph(base)).populationSource).toBeNull();
  });
});
