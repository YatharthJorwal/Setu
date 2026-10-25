import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { FACILITY_COLORS, PLACE_COLOR, ROAD_COLORS, STATE_COLORS } from '../lib/palette';
import { useSceneStore } from '../state/store';
import { ConeIcon, DiamondIcon, DotIcon, LineIcon, PostIcon, RingIcon, SquareIcon } from './Icons';

function Item({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li>
      {icon}
      <span>{label}</span>
    </li>
  );
}

/** Every symbol on the map, drawn the way it appears there. Scenario symbols show only once a scenario is running. */
export function Legend() {
  const hasRun = useSceneStore((s) => s.run !== null);
  const hasPlaces = useSceneStore((s) => (s.assets?.places?.places.length ?? 0) > 0);
  return (
    <details className="legend float" open>
      <summary>{t('legend.title')}</summary>
      <div className="legend-body">
        <h3>{t('legend.roads')}</h3>
        <ul>
          <Item icon={<LineIcon color={ROAD_COLORS.major} />} label={t('legend.roadMajor')} />
          <Item icon={<LineIcon color={ROAD_COLORS.medium} />} label={t('legend.roadMedium')} />
          <Item icon={<LineIcon color={ROAD_COLORS.minor} />} label={t('legend.roadMinor')} />
          <Item icon={<LineIcon color={ROAD_COLORS.track} dashed />} label={t('legend.roadTrack')} />
          <Item icon={<LineIcon color={ROAD_COLORS.bridge} />} label={t('legend.roadBridge')} />
        </ul>
        <h3>{t('legend.map')}</h3>
        <ul>
          <Item icon={<DiamondIcon color={FACILITY_COLORS.emergency} />} label={t('legend.facilityEmergency')} />
          <Item icon={<SquareIcon color={FACILITY_COLORS.other} />} label={t('legend.facilityOther')} />
          {hasPlaces && <Item icon={<DotIcon color={PLACE_COLOR} />} label={t('legend.place')} />}
        </ul>
        {hasRun && (
          <>
            <h3>{t('legend.scenario')}</h3>
            <ul>
              <Item icon={<PostIcon color={STATE_COLORS.closed} />} label={t('legend.closed')} />
              <Item icon={<LineIcon color={STATE_COLORS.slowed} />} label={t('legend.slowed')} />
              <Item icon={<RingIcon color={STATE_COLORS.isolated} />} label={t('legend.cutOff')} />
              <Item icon={<ConeIcon color={STATE_COLORS.delayed} />} label={t('legend.delayed')} />
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
