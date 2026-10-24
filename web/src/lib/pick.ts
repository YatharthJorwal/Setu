import { toWorldXZ, type LocalFrame } from './geo';

/** Road segments flattened into world XZ, so a click can be matched to the nearest road. */
export interface PickIndex {
  x0: Float32Array;
  z0: Float32Array;
  x1: Float32Array;
  z1: Float32Array;
  edge: Int32Array;
  count: number;
}

/** geometry[e] is the flat [lon, lat, lon, lat, ...] list of edge e. */
export function buildPickIndex(geometry: readonly (readonly number[])[], frame: LocalFrame): PickIndex {
  let count = 0;
  for (const g of geometry) count += Math.max(0, g.length / 2 - 1);
  const x0 = new Float32Array(count);
  const z0 = new Float32Array(count);
  const x1 = new Float32Array(count);
  const z1 = new Float32Array(count);
  const edge = new Int32Array(count);
  let k = 0;
  geometry.forEach((g, e) => {
    let prev = toWorldXZ(frame, g[0], g[1]);
    for (let i = 2; i < g.length; i += 2) {
      const cur = toWorldXZ(frame, g[i], g[i + 1]);
      x0[k] = prev.x;
      z0[k] = prev.z;
      x1[k] = cur.x;
      z1[k] = cur.z;
      edge[k] = e;
      k++;
      prev = cur;
    }
  });
  return { x0, z0, x1, z1, edge, count };
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Nearest edge to a world point within `tolerance` metres, or null. Ties go to the lower edge id. */
export function nearestEdge(
  index: PickIndex,
  x: number,
  z: number,
  tolerance: number,
): { edge: number; distance: number } | null {
  let best = -1;
  let bestD = tolerance;
  for (let i = 0; i < index.count; i++) {
    const d = distToSegment(x, z, index.x0[i], index.z0[i], index.x1[i], index.z1[i]);
    if (d < bestD) {
      bestD = d;
      best = index.edge[i];
    }
  }
  return best < 0 ? null : { edge: best, distance: bestD };
}

/** Point halfway along a flat [lon, lat, ...] polyline, by planar length in degrees. Good enough to place a marker. */
export function polylineMidpoint(flat: readonly number[]): [number, number] {
  const n = flat.length / 2;
  if (n < 2) return [flat[0], flat[1]];
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < n; i++) {
    const l = Math.hypot(flat[2 * i] - flat[2 * i - 2], flat[2 * i + 1] - flat[2 * i - 1]);
    lens.push(l);
    total += l;
  }
  let remaining = total / 2;
  for (let i = 0; i < lens.length; i++) {
    if (remaining <= lens[i] || i === lens.length - 1) {
      const t = lens[i] === 0 ? 0 : remaining / lens[i];
      return [flat[2 * i] + (flat[2 * i + 2] - flat[2 * i]) * t, flat[2 * i + 1] + (flat[2 * i + 3] - flat[2 * i + 1]) * t];
    }
    remaining -= lens[i];
  }
  return [flat[0], flat[1]];
}
