import { t } from '../lib/i18n';
import { useSceneStore } from '../state/store';
import { DataPanel } from './DataPanel';
import { NewsPanel } from './NewsPanel';
import { AssumptionsList, ScenarioPanel } from './ScenarioPanel';

/** The left rail: scenario controls, the local news, and the folded-away notes. */
export function Panel() {
  const status = useSceneStore((s) => s.status);
  const error = useSceneStore((s) => s.error);
  const ready = useSceneStore((s) => s.assets !== null);

  return (
    <aside className="rail" aria-label="Scenario controls">
      {status === 'loading' && (
        <p role="status" className="muted">
          {t('status.loading')}
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="alert">
          <strong>{t('status.error')}</strong>
          <p className="small">{error}</p>
        </div>
      )}

      {ready && (
        <>
          <ScenarioPanel />
          <NewsPanel />
          <AssumptionsList />
          <DataPanel />
        </>
      )}

      <p className="notice" role="note">
        {t('app.notice')}
      </p>
    </aside>
  );
}
