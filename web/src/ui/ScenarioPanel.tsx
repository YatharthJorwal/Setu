import { t, type Key } from '../lib/i18n';
import {
  ASSUMPTIONS,
  SEVERITIES,
  clearanceHours,
  edgeSummary,
  type Severity,
  type TargetSet,
} from '../state/sim-api';
import { useSceneStore } from '../state/store';
import { Tag } from './Tag';

const SEVERITY_KEY: Record<Severity, Key> = {
  minor: 'scenario.severity.minor',
  major: 'scenario.severity.major',
  severe: 'scenario.severity.severe',
};
const DEST_KEY: Record<TargetSet, Key> = {
  emergency: 'scenario.dest.emergency',
  primary: 'scenario.dest.primary',
};
const DESTS: readonly TargetSet[] = ['emergency', 'primary'];

export function severityLabel(s: Severity): string {
  return t(SEVERITY_KEY[s]);
}

function AssumptionsList() {
  const bases = [...new Set(ASSUMPTIONS.map((a) => a.basis))];
  return (
    <details>
      <summary>{t('scenario.assumptions')}</summary>
      <ul className="list">
        {ASSUMPTIONS.map((a) => (
          <li key={a.key} className="small">
            {a.label}: <strong>{a.value}</strong> {a.unit} <Tag kind="assumption" />
          </li>
        ))}
      </ul>
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
      <section>
        <h2>{t('scenario.title')}</h2>
        <div role="alert" className="error">
          <p>{t('scenario.noGraph')}</p>
          <p className="small">{graphError}</p>
        </div>
      </section>
    );
  }
  if (!graph) {
    return (
      <section>
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
    <section>
      <h2>{t('scenario.title')}</h2>
      <p>
        <strong>{t('scenario.name')}</strong>
      </p>
      <p className="muted small">{t('scenario.help')}</p>
      {pickMiss && (
        <p role="status" className="small warn">
          {t('scenario.noRoad')}
        </p>
      )}
      {runError && (
        <p role="alert" className="small error">
          {runError}
        </p>
      )}

      {summary && (
        <div className="card">
          <div className="muted small">{t('scenario.selected')}</div>
          <strong>{summary.name}</strong>
          <div className="small">
            {summary.className}, {summary.length_km} km{summary.bridge ? `, ${t('scenario.bridge')}` : ''}
          </div>
        </div>
      )}

      <fieldset className="group">
        <legend>{t('scenario.severity')}</legend>
        {SEVERITIES.map((s) => (
          <label key={s} className="row">
            <input type="radio" name="severity" checked={scenario.severity === s} onChange={() => setSeverity(s)} />
            <span>{severityLabel(s)}</span>
          </label>
        ))}
        {hours !== null && (
          <p className="small muted">
            {t('scenario.reopens', { hours })} <Tag kind="assumption" />
          </p>
        )}
      </fieldset>

      <fieldset className="group">
        <legend>{t('scenario.destinations')}</legend>
        {DESTS.map((d) => (
          <label key={d} className="row">
            <input type="radio" name="dest" checked={scenario.targetSet === d} onChange={() => setTargetSet(d)} />
            <span>{t(DEST_KEY[d])}</span>
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>
          {t('scenario.threshold')}: {scenario.tGoldenMin} <Tag kind="assumption" />
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
        <button type="button" onClick={clearScenario}>
          {t('scenario.clear')}
        </button>
      )}

      {picks.length > 0 && (
        <>
          <h2 className="spaced">{t('scenario.quick')}</h2>
          <ul className="list">
            {picks.map((c) => (
              <li key={c.edge}>
                <button type="button" className="link" onClick={() => pickEdge(c.edge)}>
                  {t('scenario.quickItem', { name: c.name || `Unnamed ${c.className} road`, count: c.isolated })}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <AssumptionsList />
    </section>
  );
}
