import { MinHeap } from './heap';
import { otherEnd, type RoadGraph } from './graph';

export interface AccessResult {
  /** seconds from each node to the nearest source; Infinity if unreachable */
  dist_s: Float64Array;
  /** edge used to reach each node on its shortest path, or -1 */
  prevEdge: Int32Array;
}

/**
 * Multi-source Dijkstra over the undirected road graph. The roads are undirected, so distances from
 * the facilities are the same as distances to them: one pass answers every village.
 * factor[e] scales the speed on edge e: 1 normal, 0 closed, between 0 and 1 slowed. null means all normal.
 */
export function accessTimes(
  graph: RoadGraph,
  sources: readonly number[],
  factor: Float64Array | null,
): AccessResult {
  const dist_s = new Float64Array(graph.nodeCount).fill(Infinity);
  const prevEdge = new Int32Array(graph.nodeCount).fill(-1);
  const heap = new MinHeap(Math.max(1024, sources.length * 2));

  for (const s of sources) {
    if (dist_s[s] > 0) {
      dist_s[s] = 0;
      heap.push(0, s);
    }
  }

  while (heap.pop()) {
    const d = heap.topKey;
    const u = heap.topVal;
    if (d > dist_s[u]) continue;
    for (let k = graph.adjStart[u]; k < graph.adjStart[u + 1]; k++) {
      const e = graph.adjEdge[k];
      const f = factor ? factor[e] : 1;
      if (f <= 0) continue;
      const v = otherEnd(graph, e, u);
      const nd = d + graph.baseTime_s[e] / f;
      if (nd < dist_s[v]) {
        dist_s[v] = nd;
        prevEdge[v] = e;
        heap.push(nd, v);
      }
    }
  }
  return { dist_s, prevEdge };
}

/** Edges from `node` back to its nearest source, in travel order. Empty if node is a source or unreachable. */
export function pathToSource(graph: RoadGraph, prevEdge: Int32Array, node: number): number[] {
  const path: number[] = [];
  let cur = node;
  for (let guard = 0; guard <= graph.nodeCount; guard++) {
    const e = prevEdge[cur];
    if (e < 0) break;
    path.push(e);
    cur = otherEnd(graph, e, cur);
  }
  return path;
}
