import { adjacentSpeedFactor, clearanceHours, type Severity } from '../assumptions';
import { edgeClassName, type RoadGraph } from '../graph';

/** A timed change to one road edge. factor 0 closes it; between 0 and 1 slows it. */
export interface EdgeMutation {
  edge: number;
  tStart_s: number;
  /** null means it never recovers within the run */
  tEnd_s: number | null;
  factor: number;
}

export interface LandslideInput {
  type: 'landslide';
  edge: number;
  severity: Severity;
}

/**
 * S1: the chosen road segment closes until its clearance time. Roads touching it slow down for the
 * same period (debris, caution). All times and factors are assumptions (see assumptions.ts).
 */
export function landslideMutations(graph: RoadGraph, input: LandslideInput): EdgeMutation[] {
  const { edge, severity } = input;
  if (!Number.isInteger(edge) || edge < 0 || edge >= graph.edgeCount) {
    throw new RangeError(`Edge ${edge} is not in the graph (0 to ${graph.edgeCount - 1}).`);
  }
  const tEnd_s = clearanceHours(edgeClassName(graph, edge), severity) * 3600;
  const out: EdgeMutation[] = [{ edge, tStart_s: 0, tEnd_s, factor: 0 }];

  const factor = adjacentSpeedFactor(severity);
  if (factor < 1) {
    const seen = new Set<number>([edge]);
    for (const node of [graph.edgeA[edge], graph.edgeB[edge]]) {
      for (let k = graph.adjStart[node]; k < graph.adjStart[node + 1]; k++) {
        const e = graph.adjEdge[k];
        if (seen.has(e)) continue;
        seen.add(e);
        out.push({ edge: e, tStart_s: 0, tEnd_s, factor });
      }
    }
  }
  return out;
}
