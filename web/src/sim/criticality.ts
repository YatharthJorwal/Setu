import { T_GOLDEN_MIN_DEFAULT } from './assumptions';
import { edgeClassName, type RoadGraph } from './graph';
import { facilityNodes, type TargetSet } from './metrics';
import { accessTimes } from './routing';

export interface CriticalEdge {
  edge: number;
  name: string;
  className: string;
  /** places cut off if this one segment is closed (before any clearance) */
  isolated: number;
  newlyDelayed: number;
  /** people in the isolated places that have a known population */
  populationIsolated: number;
}

/**
 * Closes each candidate segment on its own and counts what is lost. A first look at the road
 * segments the network depends on. No adjacent slowdown and no reopening: a pure single-edge cut.
 */
export function rankCriticalEdges(
  graph: RoadGraph,
  options: {
    classes?: readonly string[];
    set?: TargetSet;
    tGoldenMin?: number;
    top?: number;
    /** keep only the most critical segment of each named road (unnamed segments are all kept) */
    onePerRoad?: boolean;
  } = {},
): CriticalEdge[] {
  const classes = new Set(options.classes ?? ['trunk', 'primary', 'secondary']);
  const set = options.set ?? 'emergency';
  const tGolden_s = (options.tGoldenMin ?? T_GOLDEN_MIN_DEFAULT) * 60;
  const sources = facilityNodes(graph, set);
  const before = accessTimes(graph, sources, null).dist_s;

  const factor = new Float64Array(graph.edgeCount).fill(1);
  const out: CriticalEdge[] = [];
  for (let e = 0; e < graph.edgeCount; e++) {
    const className = edgeClassName(graph, e);
    if (!classes.has(className)) continue;
    factor[e] = 0;
    const after = accessTimes(graph, sources, factor).dist_s;
    factor[e] = 1;

    let isolated = 0;
    let newlyDelayed = 0;
    let populationIsolated = 0;
    for (const p of graph.places) {
      if (p.node === null || !Number.isFinite(before[p.node])) continue;
      const a = after[p.node];
      if (!Number.isFinite(a)) {
        isolated++;
        populationIsolated += p.population ?? 0;
      } else if (a > tGolden_s && before[p.node] <= tGolden_s) {
        newlyDelayed++;
      }
    }
    out.push({ edge: e, name: graph.edgeName[e], className, isolated, newlyDelayed, populationIsolated });
  }
  out.sort((a, b) => b.isolated - a.isolated || b.newlyDelayed - a.newlyDelayed || a.edge - b.edge);
  if (options.onePerRoad) {
    const seen = new Set<string>();
    const kept = out.filter((c) => {
      if (c.name === '') return true;
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    });
    return kept.slice(0, options.top ?? 10);
  }
  return out.slice(0, options.top ?? 10);
}
