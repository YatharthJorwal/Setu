import { t } from '../lib/i18n';
import { STATE_COLORS } from '../lib/palette';
import { edgeSummary, type SetMetrics } from '../state/sim-api';
import { useSceneStore, type MapView } from '../state/store';
import { AnimatedNumber } from './AnimatedNumber';
import { ConeIcon, RingIcon } from './Icons';
import { Segmented } from './Segmented';
import { severityLabel } from './ScenarioPanel';
import { Tag } from './Tag';

const fmtN = (n: number): string => n.toLocaleString('en');
const round = (v: number | null): number | null => (v === null ? null : Math.round(v));

function peopleText(m: SetMetrics): string {
  if (m.places_isolated === 0) return '0';
  const share = m.population.known_share_isolated;
  if (share === 0) return t('dash.peopleUnknown');
  if (share < 1) return t('dash.peoplePartial', { n: fmtN(m.population.isolated), pct: Math.round(share * 100) });
  return fmtN(m.population.isolated);
}

interface KpiProps {
  label: string;
  tag: 'data' | 'assumption';
  after: number | null;
  before: number | null;
  unit: string;
  tone?: 'danger';
}

function Kpi({ label, tag, after, before, unit, tone }: KpiProps) {
  return (
    <div className={tone && (after ?? 0) > 0 ? 'kpi danger' : 'kpi'}>
      <div className="kpi-label">
        {label} <Tag kind={tag} />
      </div>
      <div className="kpi-value">
        <AnimatedNumber value={after} />
        <small>{unit}</small>
      </div>
      <div className="kpi-was">{t('dash.kpi.was', { n: before === null ? '-' : fmtN(before) })}</div>
    </div>
  );
}

export function Dashboard() {
  const graph = useSceneStore((s) => s.graph);
  const run = useSceneStore((s) => s.run);
  const scenario = useSceneStore((s) => s.scenario);
  const setSnapshot = useSceneStore((s) => s.setSnapshot);
  const setView = useSceneStore((s) => s.setView);

  if (!graph) return null;
  if (!run || scenario.edge === null) {
    return (
      <aside className="dashboard float" aria-label={t('dash.title')}>
        <div className="eyebrow">{t('dash.title')}</div>
        <p className="muted">{t('dash.empty')}</p>
      </aside>
    );
  }

  const summary = edgeSummary(graph, scenario.edge);
  const snap = run.snapshots[scenario.snapshot] ?? run.snapshots[0];
  const set = scenario.targetSet;
  const m = snap[set];
  const hoursOf = (i: number): number => Math.round((run.snapshots[i].t_s / 3600) * 10) / 10;

  const restored = run.restoredAfter_h[set].filter((h): h is number => h !== null);
  const restoredText =
    m.places_isolated === 0 && scenario.snapshot === 0
      ? null
      : restored.length === 0
        ? t('dash.never')
        : Math.min(...restored) === Math.max(...restored)
          ? t('dash.restoredOne', { h: Math.min(...restored) })
          : t('dash.restored', { min: Math.min(...restored), max: Math.max(...restored) });

  const noImpact = m.places_isolated === 0 && m.places_delayed === m.places_delayed_before && scenario.snapshot === 0;

  return (
    <aside className="dashboard float" aria-label={t('dash.title')}>
      <div key={`${scenario.edge}-${scenario.severity}`} className="fade-in">
        <div className="eyebrow">{t('dash.title')}</div>
        <h2 className="headline">{summary.name}</h2>
        <div className="chips">
          <span className="chip">{t('dash.headline', { severity: severityLabel(scenario.severity) })}</span>
          <span className="chip">
            {summary.className}, {summary.length_km} km
          </span>
        </div>
      </div>

      <div className="controls">
        <Segmented<MapView>
          name="mapview"
          legend={t('dash.view')}
          options={[
            { value: 'before', label: t('dash.before') },
            { value: 'after', label: t('dash.after') },
          ]}
          value={scenario.view}
          onChange={setView}
        />
        {run.snapshots.length > 1 && (
          <Segmented
            name="time"
            legend={t('dash.time')}
            options={run.snapshots.map((_, i) => ({
              value: String(i),
              label: i === 0 ? t('dash.timeEvent') : t('dash.timeAfter', { hours: hoursOf(i) }),
            }))}
            value={String(scenario.snapshot)}
            onChange={(v) => setSnapshot(Number(v))}
          />
        )}
      </div>

      <div className="kpis">
        <Kpi label={t('dash.kpi.cutOff')} tag="data" after={m.places_isolated} before={0} unit={t('dash.kpi.places')} tone="danger" />
        <Kpi
          label={t('dash.kpi.delayed', { n: scenario.tGoldenMin })}
          tag="assumption"
          after={m.places_delayed}
          before={m.places_delayed_before}
          unit={t('dash.kpi.places')}
        />
        <Kpi
          label={t('dash.kpi.typical')}
          tag="assumption"
          after={round(m.median_after_min)}
          before={round(m.median_before_min)}
          unit={t('dash.kpi.unit')}
        />
      </div>
      <p className="small muted">{t('dash.typicalNote')}</p>

      {noImpact ? (
        <p className="callout">{t('dash.noImpact')}</p>
      ) : (
        <>
          <p className="small">
            <span className="muted">{t('dash.people')}: </span>
            {peopleText(m)}
          </p>
          {restoredText && (
            <p className="small">
              {restoredText} <Tag kind="assumption" />
            </p>
          )}
        </>
      )}

      {m.worst.length > 0 && (
        <>
          <div className="eyebrow spaced">{t('dash.worst')}</div>
          <ul className="rows scroll">
            {m.worst.map((w) => {
              const place = graph.places[w.place];
              const isolated = w.status === 'isolated';
              return (
                <li key={w.place} className="small">
                  <span>{place.name || t('dash.unnamedPlace')}</span>
                  <span className={isolated ? 'chip danger' : 'chip warn'}>
                    {isolated ? <RingIcon color={STATE_COLORS.isolated} /> : <ConeIcon color={STATE_COLORS.delayed} />}
                    {isolated ? t('dash.cutOffShort') : t('dash.delayedShort', { n: Math.round(w.after_min - w.before_min) })}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="small muted spaced">{t('dash.notCounted', { a: fmtN(m.places_unconnected), b: fmtN(m.places_no_baseline) })}</p>
      <p className="small faint">{t('dash.caveat')}</p>
    </aside>
  );
}
