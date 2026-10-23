import { toWorldXZ, type LocalFrame } from './geo';
import { worldHeight, type HeightField } from './terrain';
import type { RoadsFile } from './types';

export type RoadGroup = 'major' | 'medium' | 'minor' | 'track' | 'bridge';

export const ROAD_GROUPS: readonly RoadGroup[] = ['major', 'medium', 'minor', 'track', 'bridge'];

export function roadGroup(className: string, isBridge: boolean): RoadGroup {
  if (isBridge) return 'bridge';
  switch (className) {
    case 'trunk':
    case 'primary':
      return 'major';
    case 'secondary':
    case 'tertiary':
      return 'medium';
    case 'track':
      return 'track';
    default:
      return 'minor';
  }
}

/** Distance (world units) roads sit above the terrain surface to avoid z-fighting. */
export const ROAD_LIFT = 12;

/**
 * Line-segment vertex buffers (pairs of points) per group, draped on the terrain.
 * A polyline with n points yields n-1 segments.
 */
export function buildRoadSegments(
  roads: RoadsFile,
  hf: HeightField,
  frame: LocalFrame,
  exaggeration: number,
): Record<RoadGroup, Float32Array> {
  const counts: Record<RoadGroup, number> = { major: 0, medium: 0, minor: 0, track: 0, bridge: 0 };
  const groupOf = roads.roads.map((w) => roadGroup(roads.classes[w.c] ?? '', w.b === 1));
  roads.roads.forEach((w, i) => {
    counts[groupOf[i]] += Math.max(0, w.p.length / 2 - 1);
  });

  const out = {} as Record<RoadGroup, Float32Array>;
  const cursor: Record<RoadGroup, number> = { major: 0, medium: 0, minor: 0, track: 0, bridge: 0 };
  for (const g of ROAD_GROUPS) out[g] = new Float32Array(counts[g] * 6);

  const base = hf.meta.elevation_min_m;
  const point = (lon: number, lat: number): [number, number, number] => {
    const { x, z } = toWorldXZ(frame, lon, lat);
    return [x, worldHeight(hf, lon, lat, base, exaggeration) + ROAD_LIFT, z];
  };

  roads.roads.forEach((w, i) => {
    const g = groupOf[i];
    const buf = out[g];
    let prev = point(w.p[0], w.p[1]);
    for (let k = 2; k < w.p.length; k += 2) {
      const cur = point(w.p[k], w.p[k + 1]);
      const o = cursor[g];
      buf[o] = prev[0];
      buf[o + 1] = prev[1];
      buf[o + 2] = prev[2];
      buf[o + 3] = cur[0];
      buf[o + 4] = cur[1];
      buf[o + 5] = cur[2];
      cursor[g] = o + 6;
      prev = cur;
    }
  });
  return out;
}
