import { toWorldXZ, type LocalFrame } from './geo';
import type { HeightField } from './terrain';

/** Depth (metres below the surface) the strata texture spans. Deeper rock keeps the last colour. */
export const STRATA_SPAN_M = 3000;

export interface BlockMesh {
  positions: Float32Array;
  /** u along the wall; v = 1 at the surface, falling with depth (see strataBands) */
  uvs: Float32Array;
  indices: Uint32Array;
}

type V = [number, number, number];

/**
 * The solid block under the terrain: four walls that follow the terrain's edge profile down to a flat
 * base, plus the base itself. The walls carry a layered soil-and-stone texture, so the model reads as a
 * cut-away chunk of ground instead of a floating sheet.
 */
export function buildBlock(hf: HeightField, frame: LocalFrame, exaggeration: number, depth: number): BlockMesh {
  const { cols, rows, elevation_min_m } = hf.meta;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const surface = (r: number, c: number): V => {
    const { x, z } = toWorldXZ(frame, hf.lonAt(c), hf.latAt(r));
    return [x, (hf.at(r, c) - elevation_min_m) * exaggeration, z];
  };
  const bottomY = -depth;

  const wall = (edge: V[], outward: V): void => {
    const start = positions.length / 3;
    edge.forEach((p, i) => {
      const u = i / Math.max(1, edge.length - 1);
      positions.push(p[0], p[1], p[2]); // top, on the surface
      uvs.push(u, 1);
      positions.push(p[0], bottomY, p[2]); // bottom
      uvs.push(u, 1 - (p[1] - bottomY) / STRATA_SPAN_M);
    });
    for (let i = 0; i < edge.length - 1; i++) {
      const a = start + 2 * i; // top i
      const b = a + 1; // bottom i
      const c = a + 2; // top i+1
      const d = a + 3; // bottom i+1
      for (const tri of [[a, b, c], [c, b, d]]) {
        // orient so the face looks away from the block
        const [i0, i1, i2] = tri;
        const p0 = positions.slice(3 * i0, 3 * i0 + 3);
        const p1 = positions.slice(3 * i1, 3 * i1 + 3);
        const p2 = positions.slice(3 * i2, 3 * i2 + 3);
        const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const facing = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] >= 0;
        indices.push(i0, facing ? i1 : i2, facing ? i2 : i1);
      }
    }
  };

  const north: V[] = [];
  const south: V[] = [];
  for (let c = 0; c < cols; c++) {
    north.push(surface(0, c));
    south.push(surface(rows - 1, c));
  }
  const west: V[] = [];
  const east: V[] = [];
  for (let r = 0; r < rows; r++) {
    west.push(surface(r, 0));
    east.push(surface(r, cols - 1));
  }
  wall(north, [0, 0, -1]); // north is -z
  wall(south, [0, 0, 1]);
  wall(west, [-1, 0, 0]);
  wall(east, [1, 0, 0]);

  // the base: a flat rectangle facing down, in the colour of the deepest rock
  const nw = surface(0, 0);
  const ne = surface(0, cols - 1);
  const sw = surface(rows - 1, 0);
  const se = surface(rows - 1, cols - 1);
  const base = positions.length / 3;
  for (const p of [nw, ne, sw, se]) {
    positions.push(p[0], bottomY, p[2]);
    uvs.push(0.5, 0);
  }
  // seen from below (-y): nw, ne, se, sw wind counter-clockwise from underneath
  indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  const flip = (() => {
    const [a, b, c] = [base, base + 1, base + 3];
    const ux = positions[3 * b] - positions[3 * a];
    const uz = positions[3 * b + 2] - positions[3 * a + 2];
    const vx = positions[3 * c] - positions[3 * a];
    const vz = positions[3 * c + 2] - positions[3 * a + 2];
    return uz * vx - ux * vz; // y component of u x v
  })();
  if (flip > 0) {
    // would face up: swap to face down
    const n = indices.length;
    [indices[n - 5], indices[n - 4]] = [indices[n - 4], indices[n - 5]];
    [indices[n - 2], indices[n - 1]] = [indices[n - 1], indices[n - 2]];
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Layer thickness (metres) and colour (sRGB hex), from the surface down. Illustrative, not a geological survey. */
export const STRATA_BANDS: ReadonlyArray<readonly [number, string]> = [
  [40, '#4a3b2a'],
  [100, '#6b5a43'],
  [280, '#8c7a62'],
  [280, '#77705f'],
  [250, '#5d6368'],
  [350, '#8a8d8c'],
  [350, '#4f5559'],
  [450, '#7a6f66'],
  [400, '#454a50'],
  [500, '#363a40'],
];
