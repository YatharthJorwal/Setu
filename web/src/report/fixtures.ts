import type { ReportData } from './types';

/** A realistic report for tests. Not used by the app. */
export function sampleReport(over: Partial<ReportData> = {}): ReportData {
  return {
    generatedAt: '2026-10-26 14:05 UTC',
    scenario: { road: 'NH107', roadDetail: 'trunk road, 4.9 km', severity: 'Major', reopens: '12 h', destinations: 'Emergency care', threshold: '60 min', moment: 'At the slide' },
    kpis: [
      { label: 'Cut off (places)', tag: 'data', before: '0', after: '142' },
      { label: 'Beyond 60 min (places)', tag: 'assumption', before: '331', after: '340' },
      { label: 'Typical access (min)', tag: 'assumption', before: '79', after: '85' },
    ],
    people: 'Unknown. No population data is loaded.',
    restored: 'Access returns after 12 h',
    worst: [
      { place: 'Marana', status: 'cut_off', detail: 'Cut off' },
      { place: 'Utrasu', status: 'delayed', detail: '+37 min, 95 to 132 min' },
    ],
    notCounted: 'Not counted: 237 places are off any drivable road, and 26 had no route before the slide.',
    brief: {
      kind: 'ai',
      summary: 'A major landslide on NH107 would cut 142 places off from emergency care.',
      risks: ['142 places lose their only route.'],
      actions: [{ action: 'Stage an ambulance on the cut-off side.', rationale: '142 places have no other route.', metrics: ['Places cut off'] }],
      caveats: ['This is a simulation, not a forecast.'],
      sourceNote: 'Written by a local AI model (qwen3.5:4b) running on this computer, from the numbers above.',
    },
    assumptions: [{ label: 'Average speed on trunk roads', value: '30', unit: 'km/h' }],
    sources: [{ dataset: 'OpenStreetMap', licence: 'ODbL 1.0', retrieved: '2026-10-22', coverage: 'Fetched via Overpass.', gaps: 'Hill road attributes are sparse.' }],
    screenshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    notice: 'Illustrative simulator. Not an operational warning system.',
    credits: ['Map data (c) OpenStreetMap contributors (ODbL).'],
    record: '{\n  "simVersion": "0.1.0",\n  "seed": 0\n}',
    ...over,
  };
}
