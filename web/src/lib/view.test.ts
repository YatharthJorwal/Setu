import { describe, expect, it } from 'vitest';
import { scaleForDistance } from './view';

describe('scaleForDistance', () => {
  it('stays at 1 up close, grows with distance, and is capped', () => {
    expect(scaleForDistance(500)).toBe(1);
    expect(scaleForDistance(30000)).toBeCloseTo(2);
    expect(scaleForDistance(1e9)).toBe(10);
  });
});
