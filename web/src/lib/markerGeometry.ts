/**
 * Slim "pin" markers: a thin stem with a small head, built by hand so facility markers stay lean.
 * Unit size: the head is about 1 unit across, the whole pin about 4.6 units tall. Scale it so one unit
 * is a few screen pixels.
 */

export type PinHead = 'diamond' | 'box';

export interface PinPart {
  center: [number, number, number];
  triStart: number;
  triCount: number;
}

export interface PinData {
  positions: Float32Array;
  indices: Uint16Array;
  parts: PinPart[];
}

type V = [number, number, number];

export const PIN_STEM_HEIGHT = 2.6;
const STEM_HALF_WIDTH = 0.1;
const HEAD_RADIUS = 1;
const BOX_HALF = 0.8;

/** Flip any triangle that faces toward the part's centre, so every face points outward. */
function orientOutward(positions: V[], tris: Array<[number, number, number]>, center: V): Array<[number, number, number]> {
  return tris.map(([a, b, c]) => {
    const pa = positions[a];
    const pb = positions[b];
    const pc = positions[c];
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const cx = (pa[0] + pb[0] + pc[0]) / 3 - center[0];
    const cy = (pa[1] + pb[1] + pc[1]) / 3 - center[1];
    const cz = (pa[2] + pb[2] + pc[2]) / 3 - center[2];
    return nx * cx + ny * cy + nz * cz >= 0 ? [a, b, c] : [a, c, b];
  });
}

function boxPart(center: V, hx: number, hy: number, hz: number): { verts: V[]; tris: Array<[number, number, number]> } {
  const verts: V[] = [];
  for (let i = 0; i < 8; i++) {
    verts.push([center[0] + (i & 1 ? hx : -hx), center[1] + (i & 2 ? hy : -hy), center[2] + (i & 4 ? hz : -hz)]);
  }
  // two triangles per face; orientOutward fixes the winding
  const quads: Array<[number, number, number, number]> = [
    [0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5],
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]] as Array<[number, number, number]>);
  return { verts, tris: orientOutward(verts, tris, center) };
}

function octahedronPart(center: V, r: number): { verts: V[]; tris: Array<[number, number, number]> } {
  const verts: V[] = [
    [center[0] + r, center[1], center[2]], [center[0] - r, center[1], center[2]],
    [center[0], center[1] + r, center[2]], [center[0], center[1] - r, center[2]],
    [center[0], center[1], center[2] + r], [center[0], center[1], center[2] - r],
  ];
  const tris: Array<[number, number, number]> = [];
  for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) tris.push([x, y, z]);
  return { verts, tris: orientOutward(verts, tris, center) };
}

export function pinGeometryData(head: PinHead): PinData {
  const stem = boxPart([0, PIN_STEM_HEIGHT / 2, 0], STEM_HALF_WIDTH, PIN_STEM_HEIGHT / 2, STEM_HALF_WIDTH);
  const headCenter: V = [0, PIN_STEM_HEIGHT + (head === 'diamond' ? HEAD_RADIUS : BOX_HALF), 0];
  const top = head === 'diamond' ? octahedronPart(headCenter, HEAD_RADIUS) : boxPart(headCenter, BOX_HALF, BOX_HALF, BOX_HALF);

  const verts = [...stem.verts, ...top.verts];
  const offset = stem.verts.length;
  const indices = [...stem.tris.flat(), ...top.tris.flat().map((i) => i + offset)];
  const positions = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => positions.set(v, i * 3));
  return {
    positions,
    indices: new Uint16Array(indices),
    parts: [
      { center: [0, PIN_STEM_HEIGHT / 2, 0], triStart: 0, triCount: stem.tris.length },
      { center: headCenter, triStart: stem.tris.length, triCount: top.tris.length },
    ],
  };
}

/** Total height of a pin in its own units. */
export function pinHeight(head: PinHead): number {
  return PIN_STEM_HEIGHT + 2 * (head === 'diamond' ? HEAD_RADIUS : BOX_HALF);
}
