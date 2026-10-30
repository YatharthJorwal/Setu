import { t } from '../lib/i18n';
import { severityLabel } from '../lib/labels';
import {
  ASSUMPTIONS,
  SEVERITIES,
  clearanceHours,
  edgeSummary,
  type TargetSet,
} from '../state/sim-api';
import { useSceneStore } from '../state/store';
import { Segmented } from './Segmented';
import { Tag } from './Tag';

export function AssumptionsList() {
  const bases = [...new Set(ASSUMPTIONS.map((a) => a.basis))];
  return (
    <details className="card fold">
      <summary>
        <h2>{t('scenario.assumptions')}</h2>
      </summary>
      <ul className="rows">
        {ASSUMPTIONS.map((a) => (
          <li key={a.key} className="small">
            <span>{a.label}</span>
            <span className="num">
              {a.value} {a.unit}
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">
        All of these are <Tag kind="assumption" />
      </p>
      {bases.map((b) => (
        <p key={b} className="small muted">
          {b}
        </p>
      ))}
    </details>
  );
}

export function ScenarioPanel() {
  const graph = useSceneStore((s) => s.graph);
  const graphError = useSceneStore((s) => s.graphError);
  const quickPicks = useSceneStore((s) => s.quickPicks);
  const scenario = useSceneStore((s) => s.scenario);
  const run = useSceneStore((s) => s.run);
  const runError = useSceneStore((s) => s.runError);
  const pickMiss = useSceneStore((s) => s.pickMiss);
  const pickEdge = useSceneStore((s) => s.pickEdge);
  const setSeverity = useSceneStore((s) => s.setSeverity);
  const setThreshold = useSceneStore((s) => s.setThreshold);
  const setTargetSet = useSceneStore((s) => s.setTargetSet);
  const clearScenario = useSceneStore((s) => s.clearScenario);

  if (graphError) {
    return (
      <section className="card">
        <h2>{t('scenario.title')}</h2>
        <div role="alert" className="alert">
          <p>{t('scenario.noGraph')}</p>
          <p className="small">{graphError}</p>
        </div>
      </section>
    );
  }
  if (!graph) {
    return (
      <section className="card">
        <h2>{t('scenario.title')}</h2>
        <p role="status" className="muted small">
          {t('status.loading')}
        </p>
      </section>
    );
  }

  const summary = scenario.edge !== null ? edgeSummary(graph, scenario.edge) : null;
  const hours = summary ? clearanceHours(summary.className, scenario.severity) : null;
  const picks = quickPicks.filter((c) => c.isolated > 0);

  return (
    <>
      <section className="card">
        <h2>{t('scenario.title')}</h2>
        <p className="muted small">{t('scenario.help')}</p>
        {pickMiss && (
          <p role="status" className="small warn">
            {t('scenario.noRoad')}
          </p>
        )}
        {runError && (
          <p role="alert" className="small alert">
            {runError}
          </p>
        )}

        <div className={summary ? 'selected' : 'selected empty'}>
          {summary ? (
            <>
              <strong>{summary.name}</strong>
              <span className="muted small">
                {summary.className} road, {summary.length_km} km{summary.bridge ? `, ${t('scenario.bridge')}` : ''}
              </span>
            </>
          ) : (
            <span className="muted">{t('scenario.none')}</span>
          )}
        </div>

        <Segmented
          name="severity"
          legend={t('scenario.severity')}
          options={SEVERITIES.map((s) => ({ value: s, label: severityLabel(s) }))}
          value={scenario.severity}
          onChange={setSeverity}
        />
        {hours !== null && (
          <p className="small muted note">
            {t('scenario.reopens', { hours })} <Tag kind="assumption" />
          </p>
        )}

        <Segmented<TargetSet>
          name="dest"
          legend={t('scenario.destinations')}
          options={[
            { value: 'emergency', label: t('scenario.dest.emergency') },
            { value: 'primary', label: t('scenario.dest.primary') },
          ]}
          value={scenario.targetSet}
          onChange={setTargetSet}
        />
        <p className="small muted note">
          {t(scenario.targetSet === 'emergency' ? 'scenario.destHint.emergency' : 'scenario.destHint.primary')}
        </p>

        <label className="field-group">
          <span className="field-label slider-label">
            {t('scenario.threshold')} <Tag kind="assumption" />
            <b className="num">{t('scenario.thresholdValue', { n: scenario.tGoldenMin })}</b>
          </span>
          <input
            type="range"
            min={10}
            max={240}
            step={5}
            value={scenario.tGoldenMin}
            onChange={(e) => setThreshold(e.target.valueAsNumber)}
          />
        </label>

        {run && (
          <button type="button" className="btn" onClick={clearScenario}>
            {t('scenario.clear')}
          </button>
        )}
      </section>

      {picks.length > 0 && (
        <section className="card">
          <h2>{t('scenario.quick')}</h2>
          <p className="muted small">{t('scenario.quickNote')}</p>
          <ul className="rows picks">
            {picks.map((c) => (
              <li key={c.edge}>
                <button type="button" className="pick" onClick={() => pickEdge(c.edge)}>
                  <span>{c.name || `Unnamed ${c.className} road`}</span>
                  <span className="chip danger">{t('scenario.quickCount', { count: c.isolated })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
