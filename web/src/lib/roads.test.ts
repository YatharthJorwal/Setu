import { describe, expect, it } from 'vitest';
import { makeFrame } from './geo';
import { ROAD_LIFT, buildRoadSegments, roadGroup } from './roads';
import { HeightField } from './terrain';
import type { RoadsFile, TerrainMeta } from './types';

const meta: TerrainMeta = {
  version: 1, source: 't', west: 78, east: 78.03, south: 30, north: 30.02, cols: 3, rows: 2,
  cell_lon_deg: 0.01, cell_lat_deg: 0.01, cell_size_m: 960, elevation_min_m: 100, elevation_max_m: 100,
  voids_filled: 0, file: 'x',
};
const hf = new HeightField(meta, new Float32Array(6).fill(100));
const frame = makeFrame(78.015, 30.01);

describe('roadGroup', () => {
  it('groups by class and lets bridges override', () => {
    expect(roadGroup('trunk', false)).toBe('major');
    expect(roadGroup('tertiary', false)).toBe('medium');
    expect(roadGroup('unclassified', false)).toBe('minor');
    expect(roadGroup('track', false)).toBe('track');
    expect(roadGroup('primary', true)).toBe('bridge');
  });
});

describe('buildRoadSegments', () => {
  const roads: RoadsFile = {
    version: 1, classes: ['trunk', 'unclassified'], total_km: 1, ways: 2,
    roads: [
      { c: 0, b: 0, p: [78.005, 30.005, 78.01, 30.005, 78.02, 30.005] }, // 3 points -> 2 segments
      { c: 1, b: 1, p: [78.005, 30.015, 78.02, 30.015] }, // 2 points -> 1 segment, bridge
    ],
  };

  it('makes n-1 segments per polyline, in the right groups', () => {
    const seg = buildRoadSegments(roads, hf, frame, 1);
    expect(seg.major.length).toBe(2 * 6);
    expect(seg.bridge.length).toBe(1 * 6);
    expect(seg.minor.length).toBe(0);
    expect(seg.track.length).toBe(0);
  });

  it('drapes on the terrain with a small lift and scales with exaggeration', () => {
    expect(buildRoadSegments(roads, hf, frame, 1).major[1]).toBeCloseTo(0 + ROAD_LIFT);
    const hfHigh = new HeightField({ ...meta, elevation_min_m: 0 }, new Float32Array(6).fill(100));
    expect(buildRoadSegments(roads, hfHigh, frame, 3).major[1]).toBeCloseTo(300 + ROAD_LIFT);
  });

  it('chains consecutive segments end to start', () => {
    const m = buildRoadSegments(roads, hf, frame, 1).major;
    expect(m[3]).toBeCloseTo(m[6]);
    expect(m[5]).toBeCloseTo(m[8]);
  });
});
