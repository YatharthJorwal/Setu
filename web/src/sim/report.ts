import type { RoadGraph } from './graph';
import { rankCriticalEdges, type CriticalEdge } from './criticality';
import { facilityNodes } from './metrics';
import { accessTimes } from './routing';

export interface NetworkReport {
  nodes: number;
  edges: number;
  totalKm: number;
  places: { total: number; unconnected: number; noEmergencyAccess: number; noPrimaryAccess: number };
  facilitiesByTier: Record<string, number>;
  facilitiesUnsnapped: number;
  emergencyDestinations: number;
  primaryDestinations: number;
  /** minutes from places to the nearest emergency destination, over places that can reach one */
  emergencyAccessMin: { median: number | null; p90: number | null; max: number | null };
  mostCriticalEmergency: CriticalEdge[];
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** One-shot description of a loaded graph: used by the real-data test and, later, the data panel. */
export function describeNetwork(graph: RoadGraph): NetworkReport {
  const emergency = facilityNodes(graph, 'emergency');
  const primary = facilityNodes(graph, 'primary');
  const eDist = accessTimes(graph, emergency, null).dist_s;
  const pDist = accessTimes(graph, primary, null).dist_s;

  let totalM = 0;
  for (let e = 0; e < graph.edgeCount; e++) totalM += graph.edgeLen_m[e];

  const tiers: Record<string, number> = {};
  for (const f of graph.facilities) tiers[f.tier] = (tiers[f.tier] ?? 0) + 1;

  const reachable: number[] = [];
  let noE = 0;
  let noP = 0;
  let unconnected = 0;
  for (const p of graph.places) {
    if (p.node === null) {
      unconnected++;
      continue;
    }
    if (Number.isFinite(eDist[p.node])) reachable.push(eDist[p.node] / 60);
    else noE++;
    if (!Number.isFinite(pDist[p.node])) noP++;
  }
  reachable.sort((a, b) => a - b);

  return {
    nodes: graph.nodeCount,
    edges: graph.edgeCount,
    totalKm: Math.round(totalM / 100) / 10,
    places: { total: graph.places.length, unconnected, noEmergencyAccess: noE, noPrimaryAccess: noP },
    facilitiesByTier: tiers,
    facilitiesUnsnapped: graph.facilities.filter((f) => f.node === null).length,
    emergencyDestinations: emergency.length,
    primaryDestinations: primary.length,
    emergencyAccessMin: {
      median: quantile(reachable, 0.5),
      p90: quantile(reachable, 0.9),
      max: reachable.length ? reachable[reachable.length - 1] : null,
    },
    mostCriticalEmergency: rankCriticalEdges(graph, { top: 10 }),
  };
}

