import { T_GOLDEN_MIN_DEFAULT } from './assumptions';
import type { RoadGraph } from './graph';
import { computeSetMetrics, facilityNodes, type PlaceAccess, type SetMetrics, type TargetSet } from './metrics';
import { accessTimes } from './routing';
import { landslideMutations, type EdgeMutation, type LandslideInput } from './scenarios/landslide';

export const SIM_VERSION = '0.1.0';
const SETS: readonly TargetSet[] = ['emergency', 'primary'];

export interface RunInputs {
  scenario: LandslideInput;
  tGoldenMin: number;
}

/** Everything needed to replay a run. No wall-clock data, so equal records mean equal runs. */
export interface RunRecord {
  simVersion: string;
  seed: number;
  inputs: RunInputs;
}

export interface Snapshot {
  t_s: number;
  emergency: SetMetrics;
  primary: SetMetrics;
}

export interface RunResult {
  record: RunRecord;
  mutations: EdgeMutation[];
  /** one per topology change: the moment of the event, then each time a road reopens */
  snapshots: Snapshot[];
  /** per place, at the moment of the event */
  placesAtEvent: Record<TargetSet, PlaceAccess[]>;
  /** per place, for every snapshot (same order as `snapshots`) */
  placesBySnapshot: Array<Record<TargetSet, PlaceAccess[]>>;
  /** per place: hours until access returns, for places the event cut off. null if not cut off or never restored. */
  restoredAfter_h: Record<TargetSet, Array<number | null>>;
}

/** Mutations in force at time t. */
export function activeMutations(mutations: readonly EdgeMutation[], t_s: number): EdgeMutation[] {
  return mutations.filter((m) => m.tStart_s <= t_s && (m.tEnd_s === null || t_s < m.tEnd_s));
}

export function runScenario(
  graph: RoadGraph,
  scenario: LandslideInput,
  options: { tGoldenMin?: number; seed?: number } = {},
): RunResult {
  const tGoldenMin = options.tGoldenMin ?? T_GOLDEN_MIN_DEFAULT;
  const seed = options.seed ?? 0;
  const mutations = landslideMutations(graph, scenario);

  const sources = { emergency: facilityNodes(graph, 'emergency'), primary: facilityNodes(graph, 'primary') };
  const baseline = {
    emergency: accessTimes(graph, sources.emergency, null).dist_s,
    primary: accessTimes(graph, sources.primary, null).dist_s,
  };

  const breaks = [...new Set([0, ...mutations.flatMap((m) => (m.tEnd_s === null ? [] : [m.tEnd_s]))])].sort(
    (a, b) => a - b,
  );

  const factorAt = (t: number): Float64Array => {
    const f = new Float64Array(graph.edgeCount).fill(1);
    for (const m of activeMutations(mutations, t)) f[m.edge] = Math.min(f[m.edge], m.factor);
    return f;
  };

  const snapshots: Snapshot[] = [];
  const perPlaceAt: Array<Record<TargetSet, PlaceAccess[]>> = [];
  for (const t of breaks) {
    const factor = factorAt(t);
    const row = {} as Record<TargetSet, PlaceAccess[]>;
    const metrics = {} as Record<TargetSet, SetMetrics>;
    for (const set of SETS) {
      const after = accessTimes(graph, sources[set], factor).dist_s;
      const r = computeSetMetrics(graph, set, baseline[set], after, tGoldenMin);
      row[set] = r.perPlace;
      metrics[set] = r.metrics;
    }
    perPlaceAt.push(row);
    snapshots.push({ t_s: t, emergency: metrics.emergency, primary: metrics.primary });
  }

  const restoredAfter_h = {} as Record<TargetSet, Array<number | null>>;
  for (const set of SETS) {
    restoredAfter_h[set] = perPlaceAt[0][set].map((p, i) => {
      if (p.status !== 'isolated') return null;
      for (let k = 1; k < breaks.length; k++) {
        if (Number.isFinite(perPlaceAt[k][set][i].after_min)) return breaks[k] / 3600;
      }
      return null;
    });
  }

  return {
    record: { simVersion: SIM_VERSION, seed, inputs: { scenario, tGoldenMin } },
    mutations,
    snapshots,
    placesAtEvent: perPlaceAt[0],
    placesBySnapshot: perPlaceAt,
    restoredAfter_h,
  };
}
