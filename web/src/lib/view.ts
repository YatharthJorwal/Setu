/** Markers grow with camera distance so they stay visible when zoomed out. */
export function scaleForDistance(distance: number): number {
  return Math.min(10, Math.max(1, distance / 15000));
}
