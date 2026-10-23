import { describe, expect, it } from 'vitest';
import { parseFacilities, parsePlaces, parseProvenance, parseRoads, parseTerrainMeta } from './assets';

const goodMeta = {
  version: 1, source: 's', west: 78, east: 79, south: 30, north: 31, cols: 10, rows: 10,
  cell_lon_deg: 0.1, cell_lat_deg: 0.1, cell_size_m: 9000, elevation_min_m: 0, elevation_max_m: 10,
  voids_filled: 0, file: 'terrain.f32',
};

describe('asset parsing', () => {
  it('accepts valid terrain metadata and rejects bad ones with a clear message', () => {
    expect(parseTerrainMeta(goodMeta).cols).toBe(10);
    expect(() => parseTerrainMeta({ ...goodMeta, cols: 'ten' })).toThrow(/"cols"/);
    expect(() => parseTerrainMeta({ ...goodMeta, east: 77 })).toThrow(/inverted/);
    expect(() => parseTerrainMeta({ ...goodMeta, cols: 1 })).toThrow(/smaller/);
    expect(() => parseTerrainMeta(null)).toThrow();
  });

  it('validates road coordinate lists', () => {
    const ok = { version: 1, classes: ['trunk'], total_km: 1, ways: 1, roads: [{ c: 0, b: 0, p: [1, 2, 3, 4] }] };
    expect(parseRoads(ok).roads.length).toBe(1);
    expect(() => parseRoads({ ...ok, roads: [{ c: 0, b: 0, p: [1, 2, 3] }] })).toThrow(/invalid coordinate/);
  });

  it('fills defaults for optional text fields', () => {
    const f = parseFacilities({ version: 1, facilities: [{ lon: 1, lat: 2 }] });
    expect(f.facilities[0].tier_guess).toBe('unknown');
    expect(parsePlaces({ version: 1, places: [{ lon: 1, lat: 2 }] }).places[0].name).toBe('');
    expect(parseProvenance([{ dataset: 'd' }])[0].manual_patches).toEqual([]);
  });
});
