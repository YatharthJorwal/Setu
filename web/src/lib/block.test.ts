import { describe, expect, it } from 'vitest';
import { STRATA_BANDS, STRATA_SPAN_M, buildBlock } from './block';
import { makeFrame } from './geo';
import { HeightField } from './terrain';
import type { TerrainMeta } from './types';

function field(cols: number, rows: number, fn: (r: number, c: number) => number): HeightField {
  const meta: TerrainMeta = {
    version: 1, source: 't', west: 78, east: 78 + cols * 0.01, south: 30, north: 30 + rows * 0.01, cols, rows,
    cell_lon_deg: 0.01, cell_lat_deg: 0.01, cell_size_m: 960, elevation_min_m: 0, elevation_max_m: 1000,
    voids_filled: 0, file: 'x',
  };
  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) data[r * cols + c] = fn(r, c);
  return new HeightField(meta, data);
}

const frame = makeFrame(78.02, 30.02);

describe('buildBlock', () => {
  const hf = field(4, 3, (r, c) => 100 * (r + c));
  const depth = 500;
  const block = buildBlock(hf, frame, 2, depth);

  it('has four walls and a base, with matching attribute and index sizes', () => {
    const wallVerts = 2 * (4 + 4 + 3 + 3); // top and bottom for each edge sample
    expect(block.positions.length / 3).toBe(wallVerts + 4);
    expect(block.uvs.length / 2).toBe(block.positions.length / 3);
    const wallTris = 2 * ((4 - 1) + (4 - 1) + (3 - 1) + (3 - 1));
    expect(block.indices.length / 3).toBe(wallTris + 2);
    for (const i of block.indices) expect(i).toBeLessThan(block.positions.length / 3);
  });

  it('puts wall tops on the surface and bottoms on the flat base', () => {
    const ys = Array.from({ length: block.positions.length / 3 }, (_, i) => block.positions[3 * i + 1]);
    expect(Math.min(...ys)).toBe(-depth);
    // the highest corner of this field is (rows 2, cols 3) = 500 m, times exaggeration 2
    expect(Math.max(...ys)).toBeCloseTo(1000);
  });

  it('faces every wall outward and the base downward', () => {
    const P = block.positions;
    // centre of the block footprint, mid height
    let cx = 0;
    let cz = 0;
    const n = P.length / 3;
    for (let i = 0; i < n; i++) {
      cx += P[3 * i];
      cz += P[3 * i + 2];
    }
    cx /= n;
    cz /= n;
    for (let t = 0; t < block.indices.length / 3; t++) {
      const [a, b, c] = [block.indices[3 * t], block.indices[3 * t + 1], block.indices[3 * t + 2]];
      const pa = [P[3 * a], P[3 * a + 1], P[3 * a + 2]];
      const pb = [P[3 * b], P[3 * b + 1], P[3 * b + 2]];
      const pc = [P[3 * c], P[3 * c + 1], P[3 * c + 2]];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const isBase = pa[1] === -depth && pb[1] === -depth && pc[1] === -depth;
      if (isBase) {
        expect(nrm[1]).toBeLessThan(0);
      } else {
        const out = [(pa[0] + pb[0] + pc[0]) / 3 - cx, (pa[2] + pb[2] + pc[2]) / 3 - cz];
        expect(nrm[0] * out[0] + nrm[2] * out[1]).toBeGreaterThan(0);
      }
    }
  });

  it('maps v to 1 at the surface and lower with depth', () => {
    for (let i = 0; i < block.positions.length / 3 - 4; i += 2) {
      expect(block.uvs[2 * i + 1]).toBe(1); // top vertex
      const y = block.positions[3 * i + 1];
      expect(block.uvs[2 * (i + 1) + 1]).toBeCloseTo(1 - (y + depth) / STRATA_SPAN_M);
    }
  });
});

describe('strata', () => {
  it('adds up to the span the texture covers', () => {
    expect(STRATA_BANDS.reduce((s, [t]) => s + t, 0)).toBe(STRATA_SPAN_M);
  });
});
