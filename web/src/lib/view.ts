/**
 * World units covered by one screen pixel at a given distance. Multiplying a marker's pixel size by this
 * keeps it the same size on screen at any zoom, so markers stay small and never swell into each other.
 */
export function worldPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  const height = Math.max(1, viewportHeightPx);
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / height;
}

/** Smaller facility markers appear only when zoomed in, so the overview stays readable. */
export const DETAIL_MARKER_DISTANCE = 45000;

/** Cubic ease-out, for short appear animations. k is clamped to 0..1. */
export function easeOut(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return 1 - Math.pow(1 - c, 3);
}
