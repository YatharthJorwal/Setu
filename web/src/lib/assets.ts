import { makeFrame, type LocalFrame } from './geo';
import { HeightField } from './terrain';
import type {
  FacilitiesFile,
  PlacesFile,
  ProvenanceEntry,
  RoadsFile,
  TerrainMeta,
} from './types';

export interface Assets {
  meta: TerrainMeta;
  terrain: HeightField;
  frame: LocalFrame;
  roads: RoadsFile;
  facilities: FacilitiesFile;
  places: PlacesFile | null;
  provenance: ProvenanceEntry[];
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(rec: Rec, key: string, what: string): number {
  const v = rec[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}: "${key}" is missing or not a number.`);
  return v;
}

function arr(rec: Rec, key: string, what: string): unknown[] {
  const v = rec[key];
  if (!Array.isArray(v)) throw new Error(`${what}: "${key}" is missing or not a list.`);
  return v;
}

export function parseTerrainMeta(json: unknown): TerrainMeta {
  if (!isRec(json)) throw new Error('terrain.json is not an object.');
  const w = 'terrain.json';
  const meta = {
    version: num(json, 'version', w),
    source: String(json.source ?? ''),
    west: num(json, 'west', w),
    east: num(json, 'east', w),
    south: num(json, 'south', w),
    north: num(json, 'north', w),
    cols: num(json, 'cols', w),
    rows: num(json, 'rows', w),
    cell_lon_deg: num(json, 'cell_lon_deg', w),
    cell_lat_deg: num(json, 'cell_lat_deg', w),
    cell_size_m: num(json, 'cell_size_m', w),
    elevation_min_m: num(json, 'elevation_min_m', w),
    elevation_max_m: num(json, 'elevation_max_m', w),
    voids_filled: num(json, 'voids_filled', w),
    file: String(json.file ?? 'terrain.f32'),
  };
  if (meta.cols < 2 || meta.rows < 2) throw new Error('terrain.json: grid is smaller than 2 x 2.');
  if (meta.east <= meta.west || meta.north <= meta.south) throw new Error('terrain.json: bounds are inverted.');
  return meta;
}

export function parseRoads(json: unknown): RoadsFile {
  if (!isRec(json)) throw new Error('roads.json is not an object.');
  const w = 'roads.json';
  const roads = arr(json, 'roads', w).map((r, i) => {
    if (!isRec(r) || !Array.isArray(r.p) || r.p.length < 4 || r.p.length % 2 !== 0) {
      throw new Error(`roads.json: road ${i} has an invalid coordinate list.`);
    }
    return { c: num(r, 'c', w), b: num(r, 'b', w), p: r.p as number[] };
  });
  return {
    version: num(json, 'version', w),
    classes: arr(json, 'classes', w).map(String),
    total_km: num(json, 'total_km', w),
    ways: num(json, 'ways', w),
    roads,
  };
}

export function parseFacilities(json: unknown): FacilitiesFile {
  if (!isRec(json)) throw new Error('facilities.json is not an object.');
  const w = 'facilities.json';
  return {
    version: num(json, 'version', w),
    facilities: arr(json, 'facilities', w).map((f, i) => {
      if (!isRec(f)) throw new Error(`facilities.json: item ${i} is not an object.`);
      return {
        id: String(f.id ?? i),
        name: String(f.name ?? ''),
        kind: String(f.kind ?? ''),
        tier_guess: String(f.tier_guess ?? 'unknown'),
        lon: num(f, 'lon', w),
        lat: num(f, 'lat', w),
      };
    }),
  };
}

export function parsePlaces(json: unknown): PlacesFile {
  if (!isRec(json)) throw new Error('places.json is not an object.');
  const w = 'places.json';
  return {
    version: num(json, 'version', w),
    places: arr(json, 'places', w).map((p, i) => {
      if (!isRec(p)) throw new Error(`places.json: item ${i} is not an object.`);
      return { name: String(p.name ?? ''), kind: String(p.kind ?? ''), lon: num(p, 'lon', w), lat: num(p, 'lat', w) };
    }),
  };
}

export function parseProvenance(json: unknown): ProvenanceEntry[] {
  if (!Array.isArray(json)) throw new Error('provenance.json is not a list.');
  return json.map((e, i) => {
    if (!isRec(e)) throw new Error(`provenance.json: item ${i} is not an object.`);
    return {
      dataset: String(e.dataset ?? ''),
      source_url: String(e.source_url ?? ''),
      licence: String(e.licence ?? ''),
      retrieved_on: String(e.retrieved_on ?? ''),
      coverage_note: String(e.coverage_note ?? ''),
      gaps: String(e.gaps ?? ''),
      manual_patches: Array.isArray(e.manual_patches) ? e.manual_patches.map(String) : [],
    };
  });
}

async function fetchOk(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return res;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetchOk(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}. Did you run "python -m pipeline.build"?`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} is not valid JSON.`);
  }
}

/** Loads every processed file. places.json is optional (a missing file is not an error). */
export async function loadAssets(baseUrl: string): Promise<Assets> {
  const base = baseUrl.replace(/\/$/, '');
  const meta = parseTerrainMeta(await getJson(`${base}/terrain.json`));

  const binRes = await fetchOk(`${base}/${meta.file}`);
  if (!binRes.ok) throw new Error(`${meta.file} returned HTTP ${binRes.status}.`);
  const terrain = new HeightField(meta, new Float32Array(await binRes.arrayBuffer()));

  const [roads, facilities, provenance] = await Promise.all([
    getJson(`${base}/roads.json`).then(parseRoads),
    getJson(`${base}/facilities.json`).then(parseFacilities),
    getJson(`${base}/provenance.json`).then(parseProvenance),
  ]);

  let places: PlacesFile | null = null;
  const placesRes = await fetchOk(`${base}/places.json`);
  if (placesRes.ok) {
    try {
      places = parsePlaces(await placesRes.json());
    } catch (err) {
      throw new Error(`places.json is invalid: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const frame = makeFrame((meta.west + meta.east) / 2, (meta.south + meta.north) / 2);
  return { meta, terrain, frame, roads, facilities, places, provenance };
}
