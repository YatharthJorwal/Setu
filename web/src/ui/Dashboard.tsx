import { t } from '../lib/i18n';
import { edgeSummary, type SetMetrics } from '../state/sim-api';
import { useSceneStore } from '../state/store';
import { severityLabel } from './ScenarioPanel';
import { Tag } from './Tag';

const fmtMin = (v: number | null): string => (v === null ? '-' : String(Math.round(v)));
const fmtN = (n: number): string => n.toLocaleString('en');

function peopleText(m: SetMetrics): string {
  if (m.places_isolated === 0) return '0';
  const share = m.population.known_share_isolated;
  if (share === 0) return t('dash.peopleUnknown');
  if (share < 1) {
    return t('dash.peoplePartial', { n: fmtN(m.population.isolated), pct: Math.round(share * 100) });
  }
  return fmtN(m.population.isolated);
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
      <aside className="dashboard" aria-label={t('dash.title')}>
        <h2>{t('dash.title')}</h2>
        <p className="muted small">{t('dash.empty')}</p>
      </aside>
    );
  }

  const summary = edgeSummary(graph, scenario.edge);
  const snap = run.snapshots[scenario.snapshot] ?? run.snapshots[0];
  const m = snap[scenario.targetSet];
  const set = scenario.targetSet;
  const hoursOf = (i: number): number => Math.round((run.snapshots[i].t_s / 3600) * 10) / 10;
  const timeLabel = scenario.snapshot === 0 ? t('dash.timeEvent') : t('dash.timeAfter', { hours: hoursOf(scenario.snapshot) });

  const restored = run.restoredAfter_h[set].filter((h): h is number => h !== null);
  const restoredText =
    m.places_isolated === 0 && scenario.snapshot === 0
      ? null
      : restored.length === 0
        ? t('dash.never')
        : Math.min(...restored) === Math.max(...restored)
          ? t('dash.restoredOne', { h: Math.min(...restored) })
          : t('dash.restored', { min: Math.min(...restored), max: Math.max(...restored) });

  return (
    <aside className="dashboard" aria-label={t('dash.title')}>
      <h2>{t('dash.title')}</h2>
      <p>
        <strong>{t('dash.headline', { severity: severityLabel(scenario.severity), road: summary.name })}</strong>
      </p>

      {run.snapshots.length > 1 && (
        <label className="field">
          <span>
            {t('dash.time')}: {timeLabel}
          </span>
          <input
            type="range"
            min={0}
            max={run.snapshots.length - 1}
            step={1}
            value={scenario.snapshot}
            aria-valuetext={timeLabel}
            onChange={(e) => setSnapshot(e.target.valueAsNumber)}
          />
        </label>
      )}

      <fieldset className="group inline">
        <legend>{t('dash.view')}</legend>
        {(['before', 'after'] as const).map((v) => (
          <label key={v} className="row">
            <input type="radio" name="mapview" checked={scenario.view === v} onChange={() => setView(v)} />
            <span>{t(v === 'before' ? 'dash.before' : 'dash.after')}</span>
          </label>
        ))}
      </fieldset>

      <table className="metrics">
        <thead>
          <tr>
            <th scope="col">{t('dash.col.metric')}</th>
            <th scope="col">{t('dash.col.before')}</th>
            <th scope="col">{t('dash.col.after')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              {t('dash.cutOff')} <Tag kind="data" />
            </th>
            <td>0</td>
            <td>{fmtN(m.places_isolated)}</td>
          </tr>
          <tr>
            <th scope="row">
              {t('dash.delayed')} ({scenario.tGoldenMin} min) <Tag kind="assumption" />
            </th>
            <td>{fmtN(m.places_delayed_before)}</td>
            <td>{fmtN(m.places_delayed)}</td>
          </tr>
          <tr>
            <th scope="row">
              {t('dash.median')} <Tag kind="assumption" />
              <div className="small muted">{t('dash.medianNote')}</div>
            </th>
            <td>{fmtMin(m.median_before_min)}</td>
            <td>{fmtMin(m.median_after_min)}</td>
          </tr>
        </tbody>
      </table>

      <p className="small">
        {t('dash.people')}: {peopleText(m)}
      </p>
      {restoredText && <p className="small">{restoredText} <Tag kind="assumption" /></p>}
      <p className="small muted">{t('dash.notCounted', { a: fmtN(m.places_unconnected), b: fmtN(m.places_no_baseline) })}</p>

      {m.worst.length > 0 && (
        <>
          <h2 className="spaced">{t('dash.worst')}</h2>
          <ul className="list">
            {m.worst.map((w) => {
              const place = graph.places[w.place];
              return (
                <li key={w.place} className="small">
                  {place.name || t('dash.unnamedPlace')}{' '}
                  <span className="muted">
                    {w.status === 'isolated'
                      ? t('dash.cutOffShort')
                      : `${t('dash.delayedShort')}: ${fmtMin(w.before_min)} to ${fmtMin(w.after_min)} min`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="small muted">{t('dash.caveat')}</p>
    </aside>
  );
}
