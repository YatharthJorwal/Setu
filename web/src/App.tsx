import { useEffect } from 'react';
import { t } from './lib/i18n';
import { Scene } from './render/Scene';
import { useSceneStore } from './state/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Panel } from './ui/Panel';

function Stage() {
  const status = useSceneStore((s) => s.status);
  if (status === 'loading' || status === 'idle') return <div className="message">{t('status.loading')}</div>;
  if (status === 'error') return <div className="message">{t('status.error')}</div>;
  return (
    <ErrorBoundary>
      <Scene />
    </ErrorBoundary>
  );
}

export default function App() {
  const load = useSceneStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="app">
      <Panel />
      <main className="stage">
        <Stage />
      </main>
    </div>
  );
}
