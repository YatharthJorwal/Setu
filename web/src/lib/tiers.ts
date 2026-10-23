import { t } from './i18n';

/** Tiers treated as emergency destinations (SPEC section 6, ADR-008). */
const EMERGENCY = new Set(['district_hospital', 'trauma_centre', 'chc']);

export function isEmergencyTier(tier: string): boolean {
  return EMERGENCY.has(tier);
}

export function tierLabel(tier: string): string {
  switch (tier) {
    case 'district_hospital':
      return t('tier.district_hospital');
    case 'trauma_centre':
      return t('tier.trauma_centre');
    case 'chc':
      return t('tier.chc');
    case 'phc':
      return t('tier.phc');
    case 'sub_centre':
      return t('tier.sub_centre');
    case 'hospital_other':
      return t('tier.hospital_other');
    case 'clinic_other':
      return t('tier.clinic_other');
    case 'restricted_access':
      return t('tier.restricted_access');
    default:
      return t('tier.unknown');
  }
}
