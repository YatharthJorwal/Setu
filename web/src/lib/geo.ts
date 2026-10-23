// Local flat-earth frame for RENDERING only (ADR-009). Simulation distances come from the road graph
// (geodesic lengths computed in the pipeline), never from these coordinates.

export interface LocalFrame {
  lon0: number;
  lat0: number;
  mPerDegLon: number;
  mPerDegLat: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Metres per degree of latitude at latitude phi (degrees), WGS84 series. */
export function metresPerDegLat(phiDeg: number): number {
  const p = rad(phiDeg);
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

/** Metres per degree of longitude at latitude phi (degrees), WGS84 series. */
export function metresPerDegLon(phiDeg: number): number {
  const p = rad(phiDeg);
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

export function makeFrame(lon0: number, lat0: number): LocalFrame {
  return { lon0, lat0, mPerDegLon: metresPerDegLon(lat0), mPerDegLat: metresPerDegLat(lat0) };
}

/** World coordinates: x east, z south (so north is -z), in metres from the frame origin. */
export function toWorldXZ(frame: LocalFrame, lon: number, lat: number): { x: number; z: number } {
  return {
    x: (lon - frame.lon0) * frame.mPerDegLon,
    z: -(lat - frame.lat0) * frame.mPerDegLat,
  };
}
