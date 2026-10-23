// Shapes of the files produced by pipeline.build (docs/DATA.md). Keep in sync with pipeline/build.py.

export interface TerrainMeta {
  version: number;
  source: string;
  west: number;
  east: number;
  south: number;
  north: number;
  cols: number;
  rows: number;
  cell_lon_deg: number;
  cell_lat_deg: number;
  cell_size_m: number;
  elevation_min_m: number;
  elevation_max_m: number;
  voids_filled: number;
  file: string;
}

export interface RoadWay {
  /** index into RoadsFile.classes */
  c: number;
  /** 1 if tagged as a bridge */
  b: number;
  /** flat [lon, lat, lon, lat, ...] */
  p: number[];
}

export interface RoadsFile {
  version: number;
  classes: string[];
  total_km: number;
  ways: number;
  roads: RoadWay[];
}

export interface Facility {
  id: string;
  name: string;
  kind: string;
  /** name-based GUESS, not an official tier (ADR-008) */
  tier_guess: string;
  lon: number;
  lat: number;
}

export interface FacilitiesFile {
  version: number;
  facilities: Facility[];
}

export interface Place {
  name: string;
  kind: string;
  lon: number;
  lat: number;
}

export interface PlacesFile {
  version: number;
  places: Place[];
}

export interface ProvenanceEntry {
  dataset: string;
  source_url: string;
  licence: string;
  retrieved_on: string;
  coverage_note: string;
  gaps: string;
  manual_patches: string[];
}
