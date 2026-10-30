import type { ReactNode } from 'react';
import { formatPeople, percentOf, roundPeople } from '../lib/format';
import { t } from '../lib/i18n';
import { useSceneStore } from '../state/store';
import { AnimatedNumber } from './AnimatedNumber';
import { BridgeMark } from './Icons';
import { Tag } from './Tag';

/** The brand and, always in view, how many people live in the corridor and how many the current scenario cuts off. */
export function TopBar() {
  const graph = useSceneStore((s) => s.graph);
  const corridor = useSceneStore((s) => s.corridor);
  const run = useSceneStore((s) => s.run);
  const scenario = useSceneStore((s) => s.scenario);

  const approx = graph?.populationSource?.kind === 'modelled';
  const hasData = corridor !== null && corridor.placesWithData > 0;
  const m = run ? (run.snapshots[scenario.snapshot] ?? run.snapshots[0])[scenario.targetSet] : null;

  // what the scenario cuts off: a number, "unknown", or nothing yet
  let cutValue: ReactNode = '-';
  let cutSub: string = t('pop.hint');
  let cutClass = 'pop-metric';
  if (hasData && m) {
    const share = m.population.known_share_isolated;
    if (m.places_isolated === 0) {
      cutValue = '0';
    } else if (share === 0) {
      cutValue = t('pop.unknown');
    } else {
      cutValue = (
        <>
          {share < 1 && <small className="pop-pre">{t('pop.atLeast')} </small>}
          {approx && '≈ '}
          <AnimatedNumber value={approx ? roundPeople(m.population.isolated) : Math.round(m.population.isolated)} />
        </>
      );
      cutClass = 'pop-metric danger';
    }
    cutSub = t('pop.share', { pct: percentOf(m.population.isolated, corridor.total) });
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <BridgeMark />
        </span>
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.subtitle')}</p>
          <p className="faint small">{t('app.area')}</p>
        </div>
      </div>

      {graph && corridor && (
        <section className="pop" aria-label={t('pop.title')}>
          <div className="pop-metric">
            <div className="pop-label">{t('pop.total')}</div>
            <div className="pop-value">{hasData ? formatPeople(corridor.total, approx) : '-'}</div>
            <div className="pop-sub">
              {hasData ? (
                <>
                  {graph.populationSource?.name ?? ''} {approx && <Tag kind="assumption" />}
                </>
              ) : (
                <>
                  {t('pop.none')}. {t('pop.noneNote')}
                </>
              )}
            </div>
            {hasData && corridor.notAnalysed > 0 && (
              <div className="pop-note" title={t('pop.notAnalysed', { n: formatPeople(corridor.notAnalysed, approx) })}>
                {t('pop.notAnalysed', { n: formatPeople(corridor.notAnalysed, approx) })}
              </div>
            )}
          </div>

          <div className={cutClass} aria-live="polite">
            <div className="pop-label">{t('pop.cutOff')}</div>
            <div className="pop-value">{cutValue}</div>
            <div className="pop-sub">{cutSub}</div>
          </div>
        </section>
      )}
    </header>
  );
}
