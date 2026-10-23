import { describe, expect, it } from 'vitest';
import { makeFrame } from './geo';
import { HeightField, buildTerrainMesh, elevationColor } from './terrain';
import type { TerrainMeta } from './types';

function meta(cols: number, rows: number): TerrainMeta {
  return {
    version: 1, source: 'test', west: 78, east: 78 + cols * 0.01, south: 30, north: 30 + rows * 0.01,
    cols, rows, cell_lon_deg: 0.01, cell_lat_deg: 0.01, cell_size_m: 960,
    elevation_min_m: 0, elevation_max_m: 100, voids_filled: 0, file: 'terrain.f32',
  };
}

// 3 cols x 2 rows. Row 0 is north. Values rise to the east.
const GRID = new Float32Array([0, 50, 100, 0, 50, 100]);

describe('HeightField', () => {
  it('rejects data whose size does not match the metadata', () => {
    expect(() => new HeightField(meta(3, 2), new Float32Array(5))).toThrow(/size mismatch/);
  });

  it('returns exact values at cell centres', () => {
    const hf = new HeightField(meta(3, 2), GRID);
    expect(hf.heightAt(hf.lonAt(0), hf.latAt(0))).toBeCloseTo(0);
    expect(hf.heightAt(hf.lonAt(2), hf.latAt(1))).toBeCloseTo(100);
  });

  it('interpolates bilinearly between centres', () => {
    const hf = new HeightField(meta(3, 2), GRID);
    const lon = (hf.lonAt(0) + hf.lonAt(1)) / 2;
    expect(hf.heightAt(lon, hf.latAt(0))).toBeCloseTo(25);
  });

  it('clamps outside the mesh to the edge value', () => {
    const hf = new HeightField(meta(3, 2), GRID);
    expect(hf.heightAt(70, 30.005)).toBeCloseTo(0);
    expect(hf.heightAt(90, 30.005)).toBeCloseTo(100);
  });
});

describe('buildTerrainMesh', () => {
  const hf = new HeightField(meta(3, 2), GRID);
  const frame = makeFrame(78.015, 30.01);
  const mesh = buildTerrainMesh(hf, frame, 2);

  it('has one vertex per sample and two triangles per cell', () => {
    expect(mesh.positions.length).toBe(3 * 2 * 3);
    expect(mesh.colors.length).toBe(3 * 2 * 3);
    expect(mesh.indices.length).toBe(2 * 1 * 6);
  });

  it('applies vertical exaggeration above the minimum elevation', () => {
    expect(mesh.positions[1]).toBeCloseTo(0); // elevation 0
    expect(mesh.positions[(0 * 3 + 2) * 3 + 1]).toBeCloseTo(200); // elevation 100 * 2
  });

  it('winds triangles so normals point up', () => {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const p = (i: number) => [mesh.positions[mesh.indices[i] * 3], mesh.positions[mesh.indices[i] * 3 + 2]];
      const [ax, az] = p(t), [bx, bz] = p(t + 1), [cx, cz] = p(t + 2);
      const crossY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az); // y component of (b-a) x (c-a)
      expect(crossY).toBeGreaterThan(0);
    }
  });
});

describe('elevationColor', () => {
  it('returns linear values within 0..1 and gets lighter with height', () => {
    const lo = elevationColor(0, 0, 100);
    const hi = elevationColor(100, 0, 100);
    for (const c of [...lo, ...hi]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(hi[0]).toBeGreaterThan(lo[0]);
  });

  it('does not divide by zero on a flat range', () => {
    expect(elevationColor(5, 5, 5).every((c) => Number.isFinite(c))).toBe(true);
  });
});
