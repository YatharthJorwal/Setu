import { describe, expect, it } from 'vitest';
import { formatPeople, percentOf, roundPeople } from './format';

describe('roundPeople', () => {
  it('keeps small numbers exact and rounds larger ones to a sensible step', () => {
    expect(roundPeople(0)).toBe(0);
    expect(roundPeople(-5)).toBe(0);
    expect(roundPeople(Number.NaN)).toBe(0);
    expect(roundPeople(87)).toBe(87);
    expect(roundPeople(842)).toBe(840);
    expect(roundPeople(999)).toBe(1000);
    expect(roundPeople(52_349)).toBe(52_300);
    expect(roundPeople(100_499)).toBe(100_000);
    expect(roundPeople(100_500)).toBe(101_000);
  });
});

describe('formatPeople and percentOf', () => {
  it('marks estimates with an approximate sign and leaves counts alone', () => {
    expect(formatPeople(52_349, true)).toBe('≈ 52,300');
    expect(formatPeople(52_349, false)).toBe('52,349');
  });
  it('gives sensible percentages, including very small and undefined ones', () => {
    expect(percentOf(25, 100)).toBe('25%');
    expect(percentOf(1, 1000)).toBe('<1%');
    expect(percentOf(0, 1000)).toBe('0%');
    expect(percentOf(5, 0)).toBe('-');
  });
});
