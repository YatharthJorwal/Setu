import { roundPeople } from '../lib/format';
import { clearanceHours, edgeSummary, freeSpeedKmh } from '../sim';
import type { RoadGraph, RunResult, Severity, TargetSet } from '../sim';
import { BRIEF_LIMITS, type BriefInput, type BriefLanguage, type BriefMetric } from './types';

export interface BriefSettings {
  edge: number;
  severity: Severity;
  tGoldenMin: number;
  targetSet: TargetSet;
}

/** Names come from open map data and are passed to a language model: strip control characters and cap the length. */
export function cleanName(raw: string, fallback = 'Unnamed place'): string {
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BRIEF_LIMITS.name);
  return s === '' ? fallback : s;
}

const round = (v: number): number | null => (Number.isFinite(v) ? Math.round(v) : null);
const roundOrNull = (v: number | null): number | null => (v === null ? null : Math.round(v));

/** Turns a finished run into the numbers the brief may use. Describes the moment of the slide (first snapshot). */
export function buildBriefInput(graph: RoadGraph, run: RunResult, settings: BriefSettings, language: BriefLanguage): BriefInput {
  const set = settings.targetSet;
  const m = run.snapshots[0][set];
  const summary = edgeSummary(graph, settings.edge);
  const T = settings.tGoldenMin;

  const restored = run.restoredAfter_h[set].filter((h): h is number => h !== null);
  const share = m.population.known_share_isolated;
  const peopleKnown = m.places_isolated === 0 ? 0 : share === 1 ? roundPeople(m.population.isolated) : null;
  // an estimate is a modelled figure, not a measurement: tag and label it that way
  const modelled = graph.populationSource?.kind === 'modelled';
  const tag = modelled ? ('assumption' as const) : ('data' as const);
  const corridorTotal = graph.places.reduce((sum, p) => sum + (p.population ?? 0), 0);

  const metrics: Record<string, BriefMetric> = {
    cut_off_places: { value: m.places_isolated, unit: 'places', tag: 'data', label: 'Places cut off' },
    delayed_places_before: { value: m.places_delayed_before, unit: 'places', tag: 'assumption', label: `Places beyond ${T} minutes before the slide` },
    delayed_places_after: { value: m.places_delayed, unit: 'places', tag: 'assumption', label: `Places beyond ${T} minutes after the slide` },
    typical_access_min_before: { value: roundOrNull(m.median_before_min), unit: 'min', tag: 'assumption', label: 'Typical access time before the slide' },
    typical_access_min_after: { value: roundOrNull(m.median_after_min), unit: 'min', tag: 'assumption', label: 'Typical access time after the slide' },
    people_cut_off: { value: peopleKnown, unit: 'people', tag, label: modelled ? 'People cut off (estimate)' : 'People cut off' },
  };
  if (corridorTotal > 0) {
    metrics.corridor_people = { value: roundPeople(corridorTotal), unit: 'people', tag, label: modelled ? 'People in the corridor (estimate)' : 'People in the corridor' };
  }
  if (restored.length > 0) {
    metrics.restored_after_h_min = { value: Math.min(...restored), unit: 'h', tag: 'assumption', label: 'Earliest time access returns' };
    metrics.restored_after_h_max = { value: Math.max(...restored), unit: 'h', tag: 'assumption', label: 'Latest time access returns' };
  }

  const top_affected = m.worst.slice(0, 5).map((w) => {
    const isolated = w.status === 'isolated';
    return {
      place: cleanName(graph.places[w.place].name),
      status: isolated ? ('cut_off' as const) : ('delayed' as const),
      before_min: round(w.before_min),
      after_min: isolated ? null : round(w.after_min),
    };
  });

  return {
    language,
    scenario: {
      type: 'landslide',
      severity: settings.severity,
      road: cleanName(summary.name, 'Unnamed road'),
      road_class: summary.className,
      length_km: summary.length_km,
      reopens_after_h: clearanceHours(summary.className, settings.severity),
      destinations: set,
      threshold_min: T,
    },
    metrics,
    top_affected,
    data_gaps: { places_off_road: m.places_unconnected, places_no_route_before: m.places_no_baseline },
    assumptions: [
      { label: 'Delay threshold', value: String(T), unit: 'minutes' },
      { label: 'Time for the road to reopen', value: String(clearanceHours(summary.className, settings.severity)), unit: 'hours' },
      { label: 'Average speed on trunk and primary roads', value: String(freeSpeedKmh('trunk')), unit: 'km/h' },
      { label: 'Average speed on village roads', value: String(freeSpeedKmh('unclassified')), unit: 'km/h' },
    ],
  };
}
