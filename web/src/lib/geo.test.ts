import { describe, expect, it } from 'vitest';
import { makeFrame, metresPerDegLat, metresPerDegLon, toWorldXZ } from './geo';

describe('geo', () => {
  it('matches known WGS84 degree lengths', () => {
    expect(metresPerDegLat(0)).toBeCloseTo(110574, -1);
    expect(metresPerDegLat(30)).toBeCloseTo(110852, -1);
    expect(metresPerDegLon(0)).toBeCloseTo(111319, -1);
    expect(metresPerDegLon(30)).toBeCloseTo(96486, -1);
  });

  it('puts the frame origin at (0, 0) and north at negative z', () => {
    const f = makeFrame(79, 30.5);
    expect(toWorldXZ(f, 79, 30.5)).toEqual({ x: 0, z: -0 });
    const north = toWorldXZ(f, 79, 30.6);
    expect(north.z).toBeLessThan(0);
    expect(north.x).toBe(0);
    const east = toWorldXZ(f, 79.1, 30.5);
    expect(east.x).toBeGreaterThan(0);
  });
});
