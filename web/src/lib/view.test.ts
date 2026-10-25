import { describe, expect, it } from 'vitest';
import { easeOut, worldPerPixel } from './view';

describe('worldPerPixel', () => {
  it('doubles when the distance doubles and halves when the screen is twice as tall', () => {
    const a = worldPerPixel(10000, 40, 800);
    expect(worldPerPixel(20000, 40, 800)).toBeCloseTo(2 * a);
    expect(worldPerPixel(10000, 40, 1600)).toBeCloseTo(a / 2);
  });

  it('matches the pinhole formula and survives a zero-height viewport', () => {
    // fov 90 degrees: visible height is twice the distance
    expect(worldPerPixel(1000, 90, 1000)).toBeCloseTo(2);
    expect(Number.isFinite(worldPerPixel(1000, 40, 0))).toBe(true);
  });
});

describe('easeOut', () => {
  it('runs from 0 to 1, never overshoots, and clamps', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-3)).toBe(0);
    expect(easeOut(7)).toBe(1);
  });
});
