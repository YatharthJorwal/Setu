import { buildRoadGraph, type GraphFile, type RoadGraph } from './graph';

/** Tiny hand-built networks for tests. Not used by the app. */
export const FIXTURE_CLASSES = [
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'living_street',
  'track',
];

export interface FixtureSpec {
  populationSource?: GraphFile['population_source'];
  nodes: number;
  /** [a, b, length in metres (default 1000), class name (default secondary)] */
  edges: Array<[number, number, number?, string?]>;
  places?: Array<{ node: number | null; population?: number | null }>;
  facilities?: Array<{ node: number | null; tier: string }>;
}

export function makeGraph(spec: FixtureSpec): RoadGraph {
  const file: GraphFile = {
    version: 1,
    classes: FIXTURE_CLASSES,
    nodes: Array.from({ length: spec.nodes }, (_, i) => [78 + i * 0.01, 30]),
    edges: spec.edges.map(([a, b, len = 1000, cls = 'secondary']) => ({
      a,
      b,
      len,
      c: FIXTURE_CLASSES.indexOf(cls),
      br: 0,
      p: [78 + a * 0.01, 30, 78 + b * 0.01, 30],
      n: '',
    })),
    population_source: spec.populationSource,
    places: (spec.places ?? []).map((p, i) => ({
      id: `p${i}`,
      name: `Place ${i}`,
      kind: 'village',
      lon: 78,
      lat: 30,
      node: p.node,
      snap_m: p.node === null ? null : 10,
      population: p.population ?? null,
    })),
    facilities: (spec.facilities ?? []).map((f, i) => ({
      id: `f${i}`,
      name: `Facility ${i}`,
      kind: 'hospital',
      lon: 78,
      lat: 30,
      node: f.node,
      snap_m: f.node === null ? null : 10,
      tier: f.tier,
      tier_source: 'guess',
    })),
  };
  return buildRoadGraph(file);
}

/** 0 - 1 - 2 - 3 - 4 in a line, 1 km each. A CHC at node 0. Places at nodes 1 to 4, plus one unconnected place. */
export function lineGraph(population?: number[]): RoadGraph {
  return makeGraph({
    nodes: 5,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
    facilities: [{ node: 0, tier: 'chc' }],
    places: [
      { node: 1, population: population?.[0] ?? null },
      { node: 2, population: population?.[1] ?? null },
      { node: 3, population: population?.[2] ?? null },
      { node: 4, population: population?.[3] ?? null },
      { node: null },
    ],
  });
}
