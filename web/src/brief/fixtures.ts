import type { BriefInput } from './types';

/** A realistic input for tests. Not used by the app. */
export function sampleInput(over: Partial<BriefInput> = {}): BriefInput {
  return {
    language: 'en',
    scenario: { type: 'landslide', severity: 'major', road: 'NH107', road_class: 'trunk', length_km: 4.9, reopens_after_h: 12, destinations: 'emergency', threshold_min: 60 },
    metrics: {
      cut_off_places: { value: 142, unit: 'places', tag: 'data', label: 'Places cut off' },
      delayed_places_before: { value: 331, unit: 'places', tag: 'assumption', label: 'Before' },
      delayed_places_after: { value: 340, unit: 'places', tag: 'assumption', label: 'After' },
      typical_access_min_before: { value: 79, unit: 'min', tag: 'assumption', label: 'Typical before' },
      typical_access_min_after: { value: 85, unit: 'min', tag: 'assumption', label: 'Typical after' },
      people_cut_off: { value: null, unit: 'people', tag: 'data', label: 'People cut off' },
      restored_after_h_min: { value: 12, unit: 'h', tag: 'assumption', label: 'Earliest' },
      restored_after_h_max: { value: 12, unit: 'h', tag: 'assumption', label: 'Latest' },
    },
    top_affected: [
      { place: 'Marana', status: 'cut_off', before_min: 95, after_min: null },
      { place: 'Utrasu', status: 'delayed', before_min: 95, after_min: 132 },
    ],
    data_gaps: { places_off_road: 237, places_no_route_before: 26 },
    assumptions: [{ label: 'Delay threshold', value: '60', unit: 'minutes' }],
    ...over,
  };
}
