import { describe, expect, it } from 'vitest';
import { buildEdgeSegments, drapePoint } from './drape';
import { makeFrame } from './geo';
import { buildPickIndex, nearestEdge, polylineMidpoint } from './pick';
import { HeightField } from './terrain';
import type { TerrainMeta } from './types';

const frame = makeFrame(78.5, 30.5);

describe('road picking', () => {
  // edge 0 runs east-west through the origin; edge 1 runs north-south 2 km east of it
  const geometry = [
    [78.49, 30.5, 78.5, 30.5, 78.51, 30.5],
    [78.52, 30.49, 78.52, 30.51],
  ];
  const index = buildPickIndex(geometry, frame);

  it('flattens every segment', () => {
    expect(index.count).toBe(3);
    expect(Array.from(index.edge)).toEqual([0, 0, 1]);
  });

  it('finds the nearest edge within tolerance and nothing beyond it', () => {
    expect(nearestEdge(index, 100, 30, 150)?.edge).toBe(0);
    expect(nearestEdge(index, 100, 3000, 150)).toBeNull();
    expect(nearestEdge(index, 1900, 0, 400)?.edge).toBe(1); // 2 km east: closer to the north-south road
    expect(nearestEdge(index, 0, 0, 0)).toBeNull(); // a zero tolerance finds nothing
  });

  it('breaks ties toward the lower edge id', () => {
    const idx = buildPickIndex([[78.5, 30.5, 78.51, 30.5], [78.5, 30.5, 78.51, 30.5]], frame);
    expect(nearestEdge(idx, 100, 10, 100)?.edge).toBe(0);
  });

  it('finds the midpoint of a polyline', () => {
    expect(polylineMidpoint([0, 0, 2, 0])).toEqual([1, 0]);
    const [lon, lat] = polylineMidpoint([0, 0, 1, 0, 1, 3]); // lengths 1 and 3, half is 2: two thirds up the second leg
    expect(lon).toBeCloseTo(1);
    expect(lat).toBeCloseTo(1);
  });
});

describe('draping', () => {
  const meta: TerrainMeta = {
    version: 1, source: 't', west: 78.4, east: 78.6, south: 30.4, north: 30.6, cols: 2, rows: 2,
    cell_lon_deg: 0.1, cell_lat_deg: 0.1, cell_size_m: 9000, elevation_min_m: 100, elevation_max_m: 100,
    voids_filled: 0, file: 'x',
  };
  const hf = new HeightField(meta, new Float32Array(4).fill(100));

  it('places a point at base height plus lift', () => {
    const p = drapePoint(hf, frame, 78.5, 30.5, 2, 15);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(15);
    expect(p[2]).toBeCloseTo(0);
  });

  it('builds n-1 segments per chosen edge and ignores the others', () => {
    const geometry = [[78.45, 30.5, 78.5, 30.5, 78.55, 30.5], [78.5, 30.45, 78.5, 30.55]];
    expect(buildEdgeSegments([0], geometry, hf, frame, 1, 0).length).toBe(2 * 6);
    expect(buildEdgeSegments([1], geometry, hf, frame, 1, 0).length).toBe(1 * 6);
    expect(buildEdgeSegments([0, 1], geometry, hf, frame, 1, 0).length).toBe(3 * 6);
    expect(buildEdgeSegments([], geometry, hf, frame, 1, 0).length).toBe(0);
  });
});
