import type { RoadGraph } from './graph';

export type TargetSet = 'primary' | 'emergency';

/**
 * Which facility tiers count as a destination (SPEC section 6, ADR-008).
 * Sub-centres, private clinics and restricted-access facilities never count as emergency destinations.
 */
export const TIERS_BY_SET: Readonly<Record<TargetSet, ReadonlySet<string>>> = {
  emergency: new Set(['district_hospital', 'trauma_centre', 'chc']),
  primary: new Set(['district_hospital', 'trauma_centre', 'chc', 'phc', 'hospital_other']),
};

/** Distinct graph nodes of snapped facilities in the set, ascending (deterministic). */
export function facilityNodes(graph: RoadGraph, set: TargetSet): number[] {
  const tiers = TIERS_BY_SET[set];
  const nodes = new Set<number>();
  for (const f of graph.facilities) {
    if (f.node !== null && tiers.has(f.tier)) nodes.add(f.node);
  }
  return [...nodes].sort((a, b) => a - b);
}

export type PlaceStatus = 'ok' | 'delayed' | 'isolated' | 'no_baseline' | 'unconnected';

export interface PlaceAccess {
  place: number;
  /** minutes to the nearest destination before the event; Infinity if none */
  before_min: number;
  /** minutes after the event; Infinity if none */
  after_min: number;
  status: PlaceStatus;
}

export interface SetMetrics {
  set: TargetSet;
  facilities_in_set: number;
  places_total: number;
  /** places the sim could not attach to a road (data gap, not an event effect) */
  places_unconnected: number;
  /** places with no route to any destination even before the event (data gap or disconnected network) */
  places_no_baseline: number;
  /** newly cut off by the event: reachable before, unreachable after */
  places_isolated: number;
  /** reachable, but now beyond the threshold (and not beyond it before) */
  places_newly_delayed: number;
  /** reachable but beyond the threshold, including places that already were */
  places_delayed: number;
  /** reachable before the event but already beyond the threshold, so the "before" figure can be shown */
  places_delayed_before: number;
  /** typical (median) minutes for places that have a route both before and after; null if none. Excludes cut-off places. */
  median_before_min: number | null;
  median_after_min: number | null;
  population: {
    isolated: number;
    delayed: number;
    /** share of isolated places with a known population, 0 to 1 (1 when nothing is isolated) */
    known_share_isolated: number;
  };
  /** most affected places first: isolated, then by added minutes */
  worst: PlaceAccess[];
}

const minutes = (dist_s: Float64Array, node: number | null): number =>
  node === null ? Infinity : dist_s[node] / 60;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeSetMetrics(
  graph: RoadGraph,
  set: TargetSet,
  before_s: Float64Array,
  after_s: Float64Array,
  tGoldenMin: number,
): { metrics: SetMetrics; perPlace: PlaceAccess[] } {
  const perPlace: PlaceAccess[] = [];
  let unconnected = 0;
  let noBaseline = 0;
  let isolated = 0;
  let newlyDelayed = 0;
  let delayed = 0;
  let popIsolated = 0;
  let popDelayed = 0;
  let isolatedKnown = 0;
  let delayedBefore = 0;
  const beforeBoth: number[] = [];
  const afterBoth: number[] = [];

  graph.places.forEach((place, i) => {
    const before = minutes(before_s, place.node);
    const after = minutes(after_s, place.node);
    if (Number.isFinite(before) && before > tGoldenMin) delayedBefore++;
    if (Number.isFinite(before) && Number.isFinite(after)) {
      beforeBoth.push(before);
      afterBoth.push(after);
    }
    let status: PlaceStatus;
    if (place.node === null) {
      status = 'unconnected';
      unconnected++;
    } else if (!Number.isFinite(before)) {
      status = 'no_baseline';
      noBaseline++;
    } else if (!Number.isFinite(after)) {
      status = 'isolated';
      isolated++;
      if (place.population !== null) {
        popIsolated += place.population;
        isolatedKnown++;
      }
    } else if (after > tGoldenMin) {
      status = 'delayed';
      delayed++;
      if (place.population !== null) popDelayed += place.population;
      if (before <= tGoldenMin) newlyDelayed++;
    } else {
      status = 'ok';
    }
    perPlace.push({ place: i, before_min: before, after_min: after, status });
  });

  const rank = (a: PlaceAccess): number => (a.status === 'isolated' ? 2 : a.status === 'delayed' ? 1 : 0);
  const worst = perPlace
    .filter((p) => p.status === 'isolated' || p.status === 'delayed')
    .sort((a, b) => rank(b) - rank(a) || b.after_min - b.before_min - (a.after_min - a.before_min) || a.place - b.place)
    .slice(0, 10);

  return {
    perPlace,
    metrics: {
      set,
      facilities_in_set: graph.facilities.filter((f) => f.node !== null && TIERS_BY_SET[set].has(f.tier)).length,
      places_total: graph.places.length,
      places_unconnected: unconnected,
      places_no_baseline: noBaseline,
      places_isolated: isolated,
      places_newly_delayed: newlyDelayed,
      places_delayed: delayed,
      places_delayed_before: delayedBefore,
      median_before_min: median(beforeBoth),
      median_after_min: median(afterBoth),
      population: {
        isolated: popIsolated,
        delayed: popDelayed,
        known_share_isolated: isolated === 0 ? 1 : isolatedKnown / isolated,
      },
      worst,
    },
  };
}
