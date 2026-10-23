import { toWorldXZ, type LocalFrame } from './geo';
import type { TerrainMeta } from './types';

/** Elevation grid. Samples sit at cell centres; row 0 is the northern edge. */
export class HeightField {
  readonly meta: TerrainMeta;
  readonly data: Float32Array;

  constructor(meta: TerrainMeta, data: Float32Array) {
    if (data.length !== meta.cols * meta.rows) {
      throw new Error(
        `Terrain size mismatch: expected ${meta.cols * meta.rows} samples (${meta.cols} x ${meta.rows}), got ${data.length}.`,
      );
    }
    this.meta = meta;
    this.data = data;
  }

  at(row: number, col: number): number {
    return this.data[row * this.meta.cols + col];
  }

  lonAt(col: number): number {
    return this.meta.west + (col + 0.5) * this.meta.cell_lon_deg;
  }

  latAt(row: number): number {
    return this.meta.north - (row + 0.5) * this.meta.cell_lat_deg;
  }

  /** Bilinear elevation in metres. Positions outside the mesh clamp to its edge. */
  heightAt(lon: number, lat: number): number {
    const { cols, rows, west, north, cell_lon_deg, cell_lat_deg } = this.meta;
    const fc = clamp((lon - west) / cell_lon_deg - 0.5, 0, cols - 1);
    const fr = clamp((north - lat) / cell_lat_deg - 0.5, 0, rows - 1);
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    const c1 = Math.min(c0 + 1, cols - 1);
    const r1 = Math.min(r0 + 1, rows - 1);
    const tc = fc - c0;
    const tr = fr - r0;
    const top = this.at(r0, c0) * (1 - tc) + this.at(r0, c1) * tc;
    const bottom = this.at(r1, c0) * (1 - tc) + this.at(r1, c1) * tc;
    return top * (1 - tr) + bottom * tr;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Height in world units: (elevation - base) * exaggeration. */
export function worldHeight(hf: HeightField, lon: number, lat: number, baseElevation_m: number, exaggeration: number): number {
  return (hf.heightAt(lon, lat) - baseElevation_m) * exaggeration;
}

export interface TerrainMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

// Muted hypsometric ramp, sRGB 0-255. Strong colour is reserved for scenario state (RULES U1).
const RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 52, 64, 52],
  [0.25, 84, 96, 70],
  [0.5, 124, 124, 98],
  [0.75, 156, 148, 130],
  [0.9, 190, 186, 176],
  [1.0, 236, 236, 232],
];

const srgbToLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Linear-space RGB (0-1) for an elevation, so three.js vertex colours look as intended. */
export function elevationColor(h: number, hMin: number, hMax: number): [number, number, number] {
  const t = hMax > hMin ? clamp((h - hMin) / (hMax - hMin), 0, 1) : 0;
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, r1, g1, b1] = RAMP[i];
    if (t <= t1) {
      const [t0, r0, g0, b0] = RAMP[i - 1];
      const k = (t - t0) / (t1 - t0);
      return [
        srgbToLinear(r0 + (r1 - r0) * k),
        srgbToLinear(g0 + (g1 - g0) * k),
        srgbToLinear(b0 + (b1 - b0) * k),
      ];
    }
  }
  const [, r, g, b] = RAMP[RAMP.length - 1];
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Grid mesh in world space. Vertices at cell centres; two triangles per cell. */
export function buildTerrainMesh(
  hf: HeightField,
  frame: LocalFrame,
  exaggeration: number,
): TerrainMesh {
  const { cols, rows, elevation_min_m, elevation_max_m } = hf.meta;
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);

  for (let r = 0; r < rows; r++) {
    const lat = hf.latAt(r);
    for (let c = 0; c < cols; c++) {
      const lon = hf.lonAt(c);
      const h = hf.at(r, c);
      const { x, z } = toWorldXZ(frame, lon, lat);
      const i = (r * cols + c) * 3;
      positions[i] = x;
      positions[i + 1] = (h - elevation_min_m) * exaggeration;
      positions[i + 2] = z;
      const [cr, cg, cb] = elevationColor(h, elevation_min_m, elevation_max_m);
      colors[i] = cr;
      colors[i + 1] = cg;
      colors[i + 2] = cb;
    }
  }

  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c; // north-west
      const b = a + 1; // north-east
      const d = a + cols; // south-west
      const e = d + 1; // south-east
      // counter-clockwise seen from above (+y): north is -z, so a -> d -> b
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = e;
    }
  }
  return { positions, colors, indices };
}
