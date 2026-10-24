import { toWorldXZ, type LocalFrame } from './geo';
import { worldHeight, type HeightField } from './terrain';

/** World position of a lon/lat point lying on the terrain, lifted by `lift` world units. */
export function drapePoint(
  hf: HeightField,
  frame: LocalFrame,
  lon: number,
  lat: number,
  exaggeration: number,
  lift: number,
): [number, number, number] {
  const { x, z } = toWorldXZ(frame, lon, lat);
  return [x, worldHeight(hf, lon, lat, hf.meta.elevation_min_m, exaggeration) + lift, z];
}

/**
 * Line-segment vertex pairs for the chosen edges, draped on the terrain.
 * A polyline with n points yields n-1 segments.
 */
export function buildEdgeSegments(
  edges: readonly number[],
  geometry: readonly (readonly number[])[],
  hf: HeightField,
  frame: LocalFrame,
  exaggeration: number,
  lift: number,
): Float32Array {
  let segments = 0;
  for (const e of edges) segments += Math.max(0, geometry[e].length / 2 - 1);
  const out = new Float32Array(segments * 6);
  let o = 0;
  for (const e of edges) {
    const g = geometry[e];
    let prev = drapePoint(hf, frame, g[0], g[1], exaggeration, lift);
    for (let i = 2; i < g.length; i += 2) {
      const cur = drapePoint(hf, frame, g[i], g[i + 1], exaggeration, lift);
      out.set(prev, o);
      out.set(cur, o + 3);
      o += 6;
      prev = cur;
    }
  }
  return out;
}
