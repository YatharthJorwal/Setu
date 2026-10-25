import { describe, expect, it } from 'vitest';
import { PIN_STEM_HEIGHT, pinGeometryData, pinHeight, type PinHead } from './markerGeometry';

function outwardEverywhere(head: PinHead): boolean {
  const d = pinGeometryData(head);
  const P = d.positions;
  for (const part of d.parts) {
    for (let t = part.triStart; t < part.triStart + part.triCount; t++) {
      const [a, b, c] = [d.indices[3 * t], d.indices[3 * t + 1], d.indices[3 * t + 2]];
      const pa = [P[3 * a], P[3 * a + 1], P[3 * a + 2]];
      const pb = [P[3 * b], P[3 * b + 1], P[3 * b + 2]];
      const pc = [P[3 * c], P[3 * c + 1], P[3 * c + 2]];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const cen = [(pa[0] + pb[0] + pc[0]) / 3 - part.center[0], (pa[1] + pb[1] + pc[1]) / 3 - part.center[1], (pa[2] + pb[2] + pc[2]) / 3 - part.center[2]];
      if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] <= 0) return false;
    }
  }
  return true;
}

describe('pin geometry', () => {
  it('has the expected vertex and triangle counts', () => {
    const diamond = pinGeometryData('diamond');
    expect(diamond.positions.length / 3).toBe(8 + 6);
    expect(diamond.indices.length / 3).toBe(12 + 8);
    const box = pinGeometryData('box');
    expect(box.positions.length / 3).toBe(8 + 8);
    expect(box.indices.length / 3).toBe(12 + 12);
  });

  it('keeps every index inside the vertex list', () => {
    for (const head of ['diamond', 'box'] as const) {
      const d = pinGeometryData(head);
      for (const i of d.indices) expect(i).toBeLessThan(d.positions.length / 3);
    }
  });

  it('faces every triangle outward, for lighting', () => {
    expect(outwardEverywhere('diamond')).toBe(true);
    expect(outwardEverywhere('box')).toBe(true);
  });

  it('is lean: the stem is thin and the whole pin stands on y = 0', () => {
    const d = pinGeometryData('diamond');
    let minY = Infinity;
    let maxY = -Infinity;
    let stemWidth = 0;
    for (let i = 0; i < 8; i++) stemWidth = Math.max(stemWidth, Math.abs(d.positions[3 * i]));
    for (let i = 0; i < d.positions.length / 3; i++) {
      minY = Math.min(minY, d.positions[3 * i + 1]);
      maxY = Math.max(maxY, d.positions[3 * i + 1]);
    }
    expect(minY).toBe(0);
    expect(maxY).toBeCloseTo(pinHeight('diamond'));
    expect(stemWidth).toBeLessThan(0.15);
    expect(PIN_STEM_HEIGHT).toBeGreaterThan(2);
  });
});
