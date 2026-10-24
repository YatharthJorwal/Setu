import { DEFAULT_SPEED_KMH, freeSpeedKmh } from './assumptions';

// ---- file shapes (written by pipeline/build_graph.py) -------------------------------------------

export interface GraphEdgeFile {
  a: number;
  b: number;
  len: number;
  c: number;
  br: number;
  p: number[];
  n: string;
}

export interface GraphPlaceFile {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  node: number | null;
  snap_m: number | null;
  /** not available yet; the pipeline does not supply it */
  population?: number | null;
}

export interface GraphFacilityFile extends GraphPlaceFile {
  tier: string;
  tier_source: string;
}

export interface GraphFile {
  version: number;
  classes: string[];
  nodes: number[][];
  edges: GraphEdgeFile[];
  places: GraphPlaceFile[];
  facilities: GraphFacilityFile[];
}

// ---- validation -------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(r: Rec, key: string, what: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`graph.json ${what}: "${key}" is not a number.`);
  return v;
}

function nodeRef(r: Rec, what: string, nodeCount: number): number | null {
  const v = r.node;
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= nodeCount) {
    throw new Error(`graph.json ${what}: "node" is not a valid node index.`);
  }
  return v;
}

export function parseGraph(json: unknown): GraphFile {
  if (!isRec(json)) throw new Error('graph.json is not an object.');
  if (!Array.isArray(json.nodes) || !Array.isArray(json.edges) || !Array.isArray(json.classes)) {
    throw new Error('graph.json needs "classes", "nodes" and "edges" lists.');
  }
  const nodes = json.nodes.map((n, i) => {
    if (!Array.isArray(n) || n.length !== 2 || !n.every((x) => typeof x === 'number')) {
      throw new Error(`graph.json node ${i} is not a [lon, lat] pair.`);
    }
    return n as number[];
  });
  const classes = json.classes.map(String);
  const edges = json.edges.map((e, i) => {
    if (!isRec(e)) throw new Error(`graph.json edge ${i} is not an object.`);
    const w = `edge ${i}`;
    const a = num(e, 'a', w);
    const b = num(e, 'b', w);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= nodes.length || b >= nodes.length) {
      throw new Error(`graph.json ${w}: endpoint is not a valid node index.`);
    }
    const c = num(e, 'c', w);
    if (!Number.isInteger(c) || c < 0 || c >= classes.length) throw new Error(`graph.json ${w}: unknown road class.`);
    const len = num(e, 'len', w);
    if (len <= 0) throw new Error(`graph.json ${w}: length must be positive.`);
    if (!Array.isArray(e.p) || e.p.length < 4 || e.p.length % 2 !== 0) {
      throw new Error(`graph.json ${w}: invalid geometry.`);
    }
    return { a, b, len, c, br: num(e, 'br', w), p: e.p as number[], n: String(e.n ?? '') };
  });
  const places = (Array.isArray(json.places) ? json.places : []).map((p, i) => {
    if (!isRec(p)) throw new Error(`graph.json place ${i} is not an object.`);
    const w = `place ${i}`;
    const pop = p.population;
    return {
      id: String(p.id ?? i),
      name: String(p.name ?? ''),
      kind: String(p.kind ?? ''),
      lon: num(p, 'lon', w),
      lat: num(p, 'lat', w),
      node: nodeRef(p, w, nodes.length),
      snap_m: typeof p.snap_m === 'number' ? p.snap_m : null,
      population: typeof pop === 'number' && pop >= 0 ? pop : null,
    };
  });
  const facilities = (Array.isArray(json.facilities) ? json.facilities : []).map((f, i) => {
    if (!isRec(f)) throw new Error(`graph.json facility ${i} is not an object.`);
    const w = `facility ${i}`;
    return {
      id: String(f.id ?? i),
      name: String(f.name ?? ''),
      kind: String(f.kind ?? ''),
      lon: num(f, 'lon', w),
      lat: num(f, 'lat', w),
      node: nodeRef(f, w, nodes.length),
      snap_m: typeof f.snap_m === 'number' ? f.snap_m : null,
      tier: String(f.tier ?? 'unknown'),
      tier_source: String(f.tier_source ?? 'guess'),
    };
  });
  return { version: num(json, 'version', 'file'), classes, nodes, edges, places, facilities };
}

// ---- runtime graph ----------------------------------------------------------------------------

export interface SimPlace {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  node: number | null;
  population: number | null;
}

export interface SimFacility {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
  node: number | null;
  tier: string;
  tierSource: string;
}

/** Undirected road network in typed arrays. Adjacency is CSR: node n touches adjEdge[adjStart[n] .. adjStart[n+1]). */
export interface RoadGraph {
  classes: string[];
  nodeCount: number;
  nodeLon: Float64Array;
  nodeLat: Float64Array;
  edgeCount: number;
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeLen_m: Float64Array;
  edgeClass: Uint8Array;
  edgeBridge: Uint8Array;
  edgeName: string[];
  /** flat [lon, lat, ...] per edge; used for drawing only */
  edgeGeometry: number[][];
  /** free-flow traversal time of each edge, seconds */
  baseTime_s: Float64Array;
  adjStart: Int32Array;
  adjEdge: Int32Array;
  places: SimPlace[];
  facilities: SimFacility[];
}

export function otherEnd(graph: RoadGraph, edge: number, node: number): number {
  return graph.edgeA[edge] === node ? graph.edgeB[edge] : graph.edgeA[edge];
}

export function edgeClassName(graph: RoadGraph, edge: number): string {
  return graph.classes[graph.edgeClass[edge]] ?? '';
}

export interface EdgeSummary {
  /** road name or reference; a plain description when OpenStreetMap has none */
  name: string;
  className: string;
  length_km: number;
  bridge: boolean;
  hasName: boolean;
}

export function edgeSummary(graph: RoadGraph, edge: number): EdgeSummary {
  const className = edgeClassName(graph, edge);
  const raw = graph.edgeName[edge];
  return {
    name: raw || `Unnamed ${className} road`,
    className,
    length_km: Math.round(graph.edgeLen_m[edge] / 100) / 10,
    bridge: graph.edgeBridge[edge] === 1,
    hasName: raw.length > 0,
  };
}

export function buildRoadGraph(file: GraphFile): RoadGraph {
  const nodeCount = file.nodes.length;
  const edgeCount = file.edges.length;

  const nodeLon = new Float64Array(nodeCount);
  const nodeLat = new Float64Array(nodeCount);
  file.nodes.forEach((n, i) => {
    nodeLon[i] = n[0];
    nodeLat[i] = n[1];
  });

  const edgeA = new Int32Array(edgeCount);
  const edgeB = new Int32Array(edgeCount);
  const edgeLen_m = new Float64Array(edgeCount);
  const edgeClass = new Uint8Array(edgeCount);
  const edgeBridge = new Uint8Array(edgeCount);
  const baseTime_s = new Float64Array(edgeCount);
  const edgeName: string[] = [];
  const edgeGeometry: number[][] = [];
  const degree = new Int32Array(nodeCount);

  file.edges.forEach((e, i) => {
    edgeA[i] = e.a;
    edgeB[i] = e.b;
    edgeLen_m[i] = e.len;
    edgeClass[i] = e.c;
    edgeBridge[i] = e.br ? 1 : 0;
    const speedKmh = freeSpeedKmh(file.classes[e.c] ?? '') || DEFAULT_SPEED_KMH;
    baseTime_s[i] = e.len / ((speedKmh * 1000) / 3600);
    edgeName.push(e.n);
    edgeGeometry.push(e.p);
    degree[e.a]++;
    degree[e.b]++;
  });

  const adjStart = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) adjStart[i + 1] = adjStart[i] + degree[i];
  const fill = adjStart.slice(0, nodeCount);
  const adjEdge = new Int32Array(adjStart[nodeCount]);
  for (let e = 0; e < edgeCount; e++) {
    adjEdge[fill[edgeA[e]]++] = e;
    adjEdge[fill[edgeB[e]]++] = e;
  }

  return {
    classes: file.classes,
    nodeCount,
    nodeLon,
    nodeLat,
    edgeCount,
    edgeA,
    edgeB,
    edgeLen_m,
    edgeClass,
    edgeBridge,
    edgeName,
    edgeGeometry,
    baseTime_s,
    adjStart,
    adjEdge,
    places: file.places.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      lon: p.lon,
      lat: p.lat,
      node: p.node,
      population: p.population ?? null,
    })),
    facilities: file.facilities.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      lon: f.lon,
      lat: f.lat,
      node: f.node,
      tier: f.tier,
      tierSource: f.tier_source,
    })),
  };
}
