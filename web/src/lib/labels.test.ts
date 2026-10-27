import { describe, expect, it } from 'vitest';
import { destinationLabel, severityLabel } from './labels';

describe('labels', () => {
  it('names severities and destinations, and passes unknown values through', () => {
    expect(severityLabel('major')).toBe('Major');
    expect(severityLabel('catastrophic')).toBe('catastrophic');
    expect(destinationLabel('primary')).toBe('Primary care');
    expect(destinationLabel('emergency')).toBe('Emergency care');
  });
});
