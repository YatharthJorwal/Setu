import { t } from '../lib/i18n';
import { useSceneStore, type LayerKey } from '../state/store';

function LayerChip({ layer, label }: { layer: LayerKey; label: string }) {
  const on = useSceneStore((s) => s.layers[layer]);
  const setLayer = useSceneStore((s) => s.setLayer);
  return (
    <label className="chip-toggle">
      <input type="checkbox" checked={on} onChange={(e) => setLayer(layer, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Layer switches and view controls, floating over the map. */
export function MapToolbar() {
  const hasPlaces = useSceneStore((s) => (s.assets?.places?.places.length ?? 0) > 0);
  const exaggeration = useSceneStore((s) => s.exaggeration);
  const setExaggeration = useSceneStore((s) => s.setExaggeration);
  const resetView = useSceneStore((s) => s.resetView);
  return (
    <div className="toolbar float" role="group" aria-label="Map layers and view">
      <LayerChip layer="roads" label={t('layers.roads')} />
      <LayerChip layer="facilities" label={t('layers.facilities')} />
      {hasPlaces && <LayerChip layer="places" label={t('layers.places')} />}
      <span className="toolbar-sep" aria-hidden="true" />
      <label className="relief" title={t('view.reliefNote')}>
        <span>
          {t('view.relief')} <b>{exaggeration.toFixed(1)}x</b>
        </span>
        <input type="range" min={1} max={4} step={0.1} value={exaggeration} onChange={(e) => setExaggeration(e.target.valueAsNumber)} />
      </label>
      <button type="button" className="btn btn-ghost" onClick={resetView}>
        {t('view.reset')}
      </button>
    </div>
  );
}
