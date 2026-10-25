import { t } from '../lib/i18n';
import { useSceneStore } from '../state/store';
import { DataPanel } from './DataPanel';
import { BridgeMark } from './Icons';
import { ScenarioPanel } from './ScenarioPanel';

/** The left rail: brand, the scenario controls, and the folded-away data notes. */
export function Panel() {
  const status = useSceneStore((s) => s.status);
  const error = useSceneStore((s) => s.error);
  const ready = useSceneStore((s) => s.assets !== null);

  return (
    <aside className="rail" aria-label="Scenario controls">
      <header className="brand">
        <span className="brand-mark">
          <BridgeMark />
        </span>
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.subtitle')}</p>
          <p className="faint small">{t('app.area')}</p>
        </div>
      </header>

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
          <DataPanel />
        </>
      )}

      <p className="notice" role="note">
        {t('app.notice')}
      </p>
    </aside>
  );
}
