// All user-facing strings go through t() so Hindi can be added without refactoring (RULES U7).

const en = {
  'app.title': 'Setu',
  'app.subtitle': 'Road-network cut-off simulator. Rudraprayag corridor.',
  'app.notice':
    'Illustrative simulator. Not an operational warning system and not affiliated with any government body.',
  'status.loading': 'Loading terrain and roads',
  'status.error': 'Could not load the map data',
  'status.webgl': 'This view needs WebGL, which this browser could not start.',
  'layers.title': 'Layers',
  'layers.roads': 'Roads',
  'layers.facilities': 'Health facilities',
  'layers.places': 'Villages and places',
  'view.title': 'View',
  'view.exaggeration': 'Vertical exaggeration',
  'view.exaggerationNote': 'Visual only. Does not change any measurement.',
  'view.reset': 'Reset view',
  'legend.title': 'Legend',
  'legend.roadMajor': 'Trunk and primary roads',
  'legend.roadMedium': 'Secondary and tertiary roads',
  'legend.roadMinor': 'Other roads (mostly village roads)',
  'legend.roadTrack': 'Tracks',
  'legend.roadBridge': 'Bridges (as tagged in OpenStreetMap)',
  'legend.facilityEmergency': 'CHC, trauma centre, district hospital (diamond)',
  'legend.facilityOther': 'Other facilities (small square)',
  'legend.place': 'Village or place (dot)',
  'hover.title': 'Selected facility',
  'hover.none': 'Hover a marker or choose a facility from the list.',
  'hover.tier': 'Tier (name-based guess)',
  'facilities.list': 'Facility list',
  'data.title': 'Data',
  'data.grid': 'Terrain grid',
  'data.elevation': 'Elevation range',
  'data.roads': 'Roads shown',
  'data.facilities': 'Facilities shown',
  'data.places': 'Places shown',
  'data.tag.data': 'data',
  'data.tag.assumption': 'assumption',
  'data.sources': 'Sources',
  'data.gaps': 'Known gaps',
  'tier.district_hospital': 'District hospital',
  'tier.trauma_centre': 'Trauma centre',
  'tier.chc': 'Community health centre (CHC)',
  'tier.phc': 'Primary health centre (PHC)',
  'tier.sub_centre': 'Sub-centre',
  'tier.hospital_other': 'Hospital (other)',
  'tier.clinic_other': 'Clinic (other)',
  'tier.restricted_access': 'Restricted access (for example military or ex-servicemen)',
  'tier.unknown': 'Unknown',
  'credits.osm': 'Map data (c) OpenStreetMap contributors (ODbL).',
  'credits.dem': 'Terrain: Copernicus DEM GLO-30 (ESA / European Union).',
} as const;

export type Key = keyof typeof en;

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
