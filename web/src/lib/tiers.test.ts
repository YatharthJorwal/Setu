import { describe, expect, it } from 'vitest';
import { isEmergencyTier, isPrimaryTier, tierLabel } from './tiers';

describe('tiers', () => {
  it('counts only CHC, trauma centre and district hospital as emergency', () => {
    for (const t of ['chc', 'trauma_centre', 'district_hospital']) expect(isEmergencyTier(t)).toBe(true);
    for (const t of ['phc', 'sub_centre', 'clinic_other', 'restricted_access', 'hospital_other', 'unknown']) {
      expect(isEmergencyTier(t)).toBe(false);
    }
  });

  it('treats PHCs and other hospitals as primary-only, never emergency', () => {
    expect(isPrimaryTier('phc')).toBe(true);
    expect(isPrimaryTier('hospital_other')).toBe(true);
    expect(isPrimaryTier('chc')).toBe(false);
    expect(isPrimaryTier('sub_centre')).toBe(false);
  });

  it('labels unknown values as Unknown', () => {
    expect(tierLabel('chc')).toBe('Community health centre (CHC)');
    expect(tierLabel('something_new')).toBe('Unknown');
  });
});
