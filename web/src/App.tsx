import { useEffect } from 'react';
import { t } from './lib/i18n';
import { Scene } from './render/Scene';
import { useSceneStore } from './state/store';
import { Dashboard } from './ui/Dashboard';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { FacilityCard } from './ui/FacilityCard';
import { Legend } from './ui/Legend';
import { MapToolbar } from './ui/MapToolbar';
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

/** Everything that floats over the map. Hidden until the map data has loaded. */
function MapOverlays() {
  const ready = useSceneStore((s) => s.status === 'ready');
  if (!ready) return null;
  return (
    <>
      <MapToolbar />
      <Dashboard />
      <div className="overlay-bl">
        <FacilityCard />
        <Legend />
      </div>
    </>
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
        <MapOverlays />
      </main>
    </div>
  );
}
