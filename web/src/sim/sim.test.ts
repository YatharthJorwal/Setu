import { describe, expect, it } from 'vitest';
import { adjacentSpeedFactor, ASSUMPTIONS, clearanceHours, freeSpeedKmh } from './assumptions';
import { rankCriticalEdges } from './criticality';
import { lineGraph, makeGraph } from './fixtures';
import { buildRoadGraph, edgeSummary, parseGraph } from './graph';
import { MinHeap } from './heap';
import { facilityNodes, TIERS_BY_SET } from './metrics';
import { describeNetwork } from './report';
import { makeRng } from './rng';
import { accessTimes, pathToSource } from './routing';
import { activeMutations, runScenario } from './run';
import { landslideMutations } from './scenarios/landslide';

// 1 km at 25 km/h (secondary) is 144 s.
const KM_SECONDARY_S = 144;

describe('rng', () => {
  it('is reproducible and in [0, 1)', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe('MinHeap', () => {
  it('pops in ascending order and breaks ties on the smaller value', () => {
    const h = new MinHeap(2);
    const rng = makeRng(7);
    const keys = Array.from({ length: 200 }, () => Math.floor(rng() * 20));
    keys.forEach((k, i) => h.push(k, i));
    let lastK = -1;
    let lastV = -1;
    let n = 0;
    while (h.pop()) {
      const ok = h.topKey > lastK || (h.topKey === lastK && h.topVal > lastV);
      expect(ok).toBe(true);
      lastK = h.topKey;
      lastV = h.topVal;
      n++;
    }
    expect(n).toBe(200);
  });
});

describe('assumptions', () => {
  it('has a documented row for every modelled constant and nothing unlabelled', () => {
    expect(ASSUMPTIONS.length).toBeGreaterThan(10);
    for (const row of ASSUMPTIONS) {
      expect(row.basis.length).toBeGreaterThan(10);
      expect(row.status).toBe('assumption');
    }
  });

  it('gives main roads faster clearance than village roads, and worse slides longer', () => {
    expect(clearanceHours('trunk', 'major')).toBeLessThan(clearanceHours('unclassified', 'major'));
    expect(clearanceHours('trunk', 'minor')).toBeLessThan(clearanceHours('trunk', 'severe'));
    expect(freeSpeedKmh('something_new')).toBe(15);
    expect(adjacentSpeedFactor('minor')).toBe(1);
  });
});

describe('graph parsing', () => {
  const good = {
    version: 1, classes: ['trunk'], nodes: [[78, 30], [78.1, 30]],
    edges: [{ a: 0, b: 1, len: 100, c: 0, br: 0, p: [78, 30, 78.1, 30], n: '' }],
    places: [], facilities: [],
  };

  it('accepts a valid file and builds adjacency', () => {
    const g = buildRoadGraph(parseGraph(good));
    expect(g.nodeCount).toBe(2);
    expect(g.adjStart[2]).toBe(2);
    expect(g.adjEdge[g.adjStart[0]]).toBe(0);
  });

  it('rejects bad edges, classes, lengths and node references', () => {
    expect(() => parseGraph({ ...good, edges: [{ ...good.edges[0], b: 9 }] })).toThrow(/node index/);
    expect(() => parseGraph({ ...good, edges: [{ ...good.edges[0], c: 5 }] })).toThrow(/class/);
    expect(() => parseGraph({ ...good, edges: [{ ...good.edges[0], len: 0 }] })).toThrow(/length/);
    expect(() => parseGraph({ ...good, places: [{ lon: 1, lat: 2, node: 7 }] })).toThrow(/node/);
    expect(() => parseGraph(null)).toThrow();
  });
});

describe('routing', () => {
  it('computes travel times along a line', () => {
    const g = lineGraph();
    const { dist_s } = accessTimes(g, [0], null);
    expect(dist_s[0]).toBe(0);
    expect(dist_s[2]).toBeCloseTo(2 * KM_SECONDARY_S);
    expect(dist_s[4]).toBeCloseTo(4 * KM_SECONDARY_S);
  });

  it('treats a closed edge as a wall and a slowed edge as proportionally slower', () => {
    const g = lineGraph();
    const closed = new Float64Array(g.edgeCount).fill(1);
    closed[1] = 0;
    const r = accessTimes(g, [0], closed);
    expect(r.dist_s[1]).toBeCloseTo(KM_SECONDARY_S);
    expect(r.dist_s[2]).toBe(Infinity);
    expect(r.dist_s[4]).toBe(Infinity);

    const slow = new Float64Array(g.edgeCount).fill(1);
    slow[1] = 0.5;
    expect(accessTimes(g, [0], slow).dist_s[2]).toBeCloseTo(3 * KM_SECONDARY_S);
  });

  it('uses the nearest of several sources and reconstructs the path', () => {
    const g = lineGraph();
    const { dist_s, prevEdge } = accessTimes(g, [0, 4], null);
    expect(dist_s[3]).toBeCloseTo(KM_SECONDARY_S);
    expect(dist_s[2]).toBeCloseTo(2 * KM_SECONDARY_S);
    expect(pathToSource(g, prevEdge, 3)).toEqual([3]);
    expect(pathToSource(g, prevEdge, 0)).toEqual([]);
    expect(pathToSource(g, accessTimes(g, [0], null).prevEdge, 2)).toEqual([1, 0]);
  });

  it('never gets faster when roads close, and fully recovers when they reopen (random networks)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = makeRng(seed);
      const n = 12;
      const edges: Array<[number, number, number]> = [];
      for (let i = 1; i < n; i++) edges.push([Math.floor(rng() * i), i, 200 + Math.floor(rng() * 2000)]);
      for (let k = 0; k < 8; k++) {
        const a = Math.floor(rng() * n);
        const b = Math.floor(rng() * n);
        if (a !== b) edges.push([a, b, 200 + Math.floor(rng() * 2000)]);
      }
      const g = makeGraph({ nodes: n, edges });
      const base = accessTimes(g, [0], null).dist_s;
      const factor = new Float64Array(g.edgeCount).fill(1);
      factor[Math.floor(rng() * g.edgeCount)] = 0;
      const after = accessTimes(g, [0], factor).dist_s;
      for (let i = 0; i < n; i++) expect(after[i]).toBeGreaterThanOrEqual(base[i] - 1e-9);
      expect(accessTimes(g, [0], new Float64Array(g.edgeCount).fill(1)).dist_s).toEqual(base);
    }
  });
});

describe('landslide scenario', () => {
  it('closes the chosen edge and, for worse slides, slows the roads that touch it', () => {
    const g = lineGraph();
    const minor = landslideMutations(g, { type: 'landslide', edge: 1, severity: 'minor' });
    expect(minor).toEqual([{ edge: 1, tStart_s: 0, tEnd_s: 12 * 3600, factor: 0 }]);
    const major = landslideMutations(g, { type: 'landslide', edge: 1, severity: 'major' });
    expect(major.length).toBe(3);
    expect(major.slice(1).map((m) => m.edge).sort()).toEqual([0, 2]);
    expect(major[1].factor).toBe(0.85);
  });

  it('rejects an edge that is not in the graph', () => {
    const g = lineGraph();
    expect(() => landslideMutations(g, { type: 'landslide', edge: 99, severity: 'minor' })).toThrow(RangeError);
    expect(() => landslideMutations(g, { type: 'landslide', edge: -1, severity: 'minor' })).toThrow(RangeError);
  });
});

describe('runScenario', () => {
  it('isolates everything beyond the cut, reports the gap, and restores access at clearance', () => {
    const g = lineGraph([100, 200, 300, 400]);
    const r = runScenario(g, { type: 'landslide', edge: 1, severity: 'minor' });
    expect(r.snapshots.length).toBe(2);
    expect(r.snapshots[0].t_s).toBe(0);
    expect(r.snapshots[1].t_s).toBe(12 * 3600);

    const e0 = r.snapshots[0].emergency;
    expect(e0.places_isolated).toBe(3);
    expect(e0.places_unconnected).toBe(1);
    expect(e0.places_no_baseline).toBe(0);
    expect(e0.population.isolated).toBe(200 + 300 + 400);
    expect(e0.population.known_share_isolated).toBe(1);

    expect(e0.places_delayed_before).toBe(0);
    expect(e0.median_before_min).toBeCloseTo(KM_SECONDARY_S / 60); // only the place at node 1 still has a route
    expect(e0.median_after_min).toBeCloseTo(KM_SECONDARY_S / 60);
    expect(r.placesBySnapshot.length).toBe(2);
    expect(r.placesBySnapshot[0].emergency).toEqual(r.placesAtEvent.emergency);
    expect(r.placesBySnapshot[1].emergency.every((p) => p.status === 'ok' || p.status === 'unconnected')).toBe(true);

    expect(r.restoredAfter_h.emergency).toEqual([null, 12, 12, 12, null]);
    expect(r.snapshots[1].emergency.places_isolated).toBe(0);
    expect(r.placesAtEvent.emergency.map((p) => p.status)).toEqual(['ok', 'isolated', 'isolated', 'isolated', 'unconnected']);
  });

  it('reports newly delayed places when a detour exists', () => {
    const g = makeGraph({
      nodes: 4,
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      facilities: [{ node: 0, tier: 'chc' }],
      places: [{ node: 1 }],
    });
    // before: 1 km, 2.4 min. After closing edge 0 (0-1): the long way round, 3 km, 7.2 min.
    const r = runScenario(g, { type: 'landslide', edge: 0, severity: 'minor' }, { tGoldenMin: 5 });
    const m = r.snapshots[0].emergency;
    expect(m.places_isolated).toBe(0);
    expect(m.places_newly_delayed).toBe(1);
    expect(r.placesAtEvent.emergency[0].before_min).toBeCloseTo(2.4);
    expect(r.placesAtEvent.emergency[0].after_min).toBeCloseTo(7.2);
    expect(r.placesAtEvent.emergency[0].status).toBe('delayed');
  });

  it('does not blame the event for places that had no route to begin with', () => {
    const g = makeGraph({
      nodes: 5,
      edges: [[0, 1], [3, 4]],
      facilities: [{ node: 0, tier: 'chc' }],
      places: [{ node: 1 }, { node: 4 }],
    });
    const m = runScenario(g, { type: 'landslide', edge: 0, severity: 'minor' }).snapshots[0].emergency;
    expect(m.places_isolated).toBe(1);
    expect(m.places_no_baseline).toBe(1);
  });

  it('counts only qualifying tiers as destinations', () => {
    const g = makeGraph({
      nodes: 3,
      edges: [[0, 1], [1, 2]],
      facilities: [{ node: 0, tier: 'phc' }, { node: 2, tier: 'sub_centre' }],
      places: [{ node: 1 }],
    });
    expect(facilityNodes(g, 'emergency')).toEqual([]);
    expect(facilityNodes(g, 'primary')).toEqual([0]);
    expect(TIERS_BY_SET.emergency.has('sub_centre')).toBe(false);
    expect(TIERS_BY_SET.primary.has('restricted_access')).toBe(false);
    const r = runScenario(g, { type: 'landslide', edge: 0, severity: 'minor' });
    expect(r.snapshots[0].emergency.places_no_baseline).toBe(1);
    expect(r.snapshots[0].primary.places_isolated).toBe(1);
  });

  it('reports population share honestly when some populations are unknown', () => {
    const g = lineGraph([100, null as unknown as number, 300, 400]);
    const m = runScenario(g, { type: 'landslide', edge: 0, severity: 'minor' }).snapshots[0].emergency;
    expect(m.places_isolated).toBe(4);
    expect(m.population.isolated).toBe(100 + 300 + 400);
    expect(m.population.known_share_isolated).toBeCloseTo(3 / 4);
  });

  it('is deterministic: same inputs and seed give identical results', () => {
    const g = lineGraph([1, 2, 3, 4]);
    const a = runScenario(g, { type: 'landslide', edge: 2, severity: 'major' }, { seed: 5 });
    const b = runScenario(g, { type: 'landslide', edge: 2, severity: 'major' }, { seed: 5 });
    expect(a).toEqual(b);
    expect(a.record.seed).toBe(5);
    expect(a.record.inputs.scenario.edge).toBe(2);
  });
});

describe('activeMutations and edgeSummary', () => {
  it('lists only the mutations in force at a given time', () => {
    const g = lineGraph();
    const muts = landslideMutations(g, { type: 'landslide', edge: 1, severity: 'major' });
    expect(activeMutations(muts, 0).length).toBe(3);
    expect(activeMutations(muts, 48 * 3600 - 1).length).toBe(3); // a major slide on a secondary road: 48 h
    expect(activeMutations(muts, 48 * 3600)).toEqual([]);
  });

  it('describes an edge, with a plain fallback name', () => {
    const g = lineGraph();
    expect(edgeSummary(g, 0)).toEqual({ name: 'Unnamed secondary road', className: 'secondary', length_km: 1, bridge: false, hasName: false });
  });
});

describe('criticality and report', () => {
  it('can keep one segment per named road', () => {
    const g = makeGraph({
      nodes: 4,
      edges: [[0, 1], [1, 2], [2, 3]],
      facilities: [{ node: 0, tier: 'chc' }],
      places: [{ node: 1 }, { node: 2 }, { node: 3 }],
    });
    // fixtures have empty names, so every segment is kept; onePerRoad must not drop unnamed ones
    expect(rankCriticalEdges(g, { onePerRoad: true }).length).toBe(3);
  });

  it('ranks the segment whose loss cuts off the most places first and respects the class filter', () => {
    const g = lineGraph();
    const ranked = rankCriticalEdges(g, { classes: ['secondary'] });
    expect(ranked[0].edge).toBe(0);
    expect(ranked[0].isolated).toBe(4);
    expect(ranked.map((r) => r.isolated)).toEqual([4, 3, 2, 1]);
    expect(rankCriticalEdges(g, { classes: ['tertiary'] })).toEqual([]);
  });

  it('describes a network', () => {
    const rep = describeNetwork(lineGraph());
    expect(rep.nodes).toBe(5);
    expect(rep.edges).toBe(4);
    expect(rep.totalKm).toBe(4);
    expect(rep.places).toEqual({ total: 5, unconnected: 1, noEmergencyAccess: 0, noPrimaryAccess: 0 });
    expect(rep.facilitiesByTier).toEqual({ chc: 1 });
    expect(rep.emergencyAccessMin.max).toBeCloseTo((4 * KM_SECONDARY_S) / 60);
    expect(rep.mostCriticalEmergency.length).toBe(4);
  });
});
