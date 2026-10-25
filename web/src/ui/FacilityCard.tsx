import { t } from '../lib/i18n';
import { FACILITY_COLORS } from '../lib/palette';
import { isEmergencyTier, tierLabel } from '../lib/tiers';
import { useSceneStore } from '../state/store';
import { DiamondIcon, SquareIcon } from './Icons';
import { Tag } from './Tag';

/** Details of the facility under the pointer or chosen from the list. */
export function FacilityCard() {
  const selected = useSceneStore((s) => s.selected);
  const select = useSceneStore((s) => s.select);
  if (!selected) return null;
  const emergency = isEmergencyTier(selected.tier_guess);
  return (
    <div className="facility-card float" role="status">
      <span className="facility-icon">
        {emergency ? <DiamondIcon color={FACILITY_COLORS.emergency} /> : <SquareIcon color={FACILITY_COLORS.other} />}
      </span>
      <div className="facility-text">
        <strong>{selected.name || selected.id}</strong>
        <span className="muted small">
          {t('facility.tier')}: {tierLabel(selected.tier_guess)} <Tag kind="assumption" />
        </span>
      </div>
      <button type="button" className="btn-icon" aria-label={t('facility.close')} onClick={() => select(null)}>
        &times;
      </button>
    </div>
  );
}
