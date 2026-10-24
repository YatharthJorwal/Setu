import { t } from '../lib/i18n';
import { tierLabel } from '../lib/tiers';
import { FACILITY_COLORS, PLACE_COLOR, ROAD_COLORS } from '../lib/palette';
import { useSceneStore, type LayerKey } from '../state/store';
import { ScenarioPanel } from './ScenarioPanel';
import { Tag } from './Tag';

function LayerToggle({ layer, label }: { layer: LayerKey; label: string }) {
  const on = useSceneStore((s) => s.layers[layer]);
  const setLayer = useSceneStore((s) => s.setLayer);
  return (
    <label className="row">
      <input type="checkbox" checked={on} onChange={(e) => setLayer(layer, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Swatch({ color, shape = 'line' }: { color: string; shape?: 'line' | 'diamond' | 'square' | 'dot' }) {
  return <span className={`swatch swatch-${shape}`} style={{ background: color }} aria-hidden="true" />;
}

const fmt = (n: number): string => n.toLocaleString('en');

export function Panel() {
  const status = useSceneStore((s) => s.status);
  const error = useSceneStore((s) => s.error);
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useSceneStore((s) => s.exaggeration);
  const setExaggeration = useSceneStore((s) => s.setExaggeration);
  const resetView = useSceneStore((s) => s.resetView);
  const selected = useSceneStore((s) => s.selected);
  const select = useSceneStore((s) => s.select);

  const hasPlaces = (assets?.places?.places.length ?? 0) > 0;

  return (
    <aside className="panel" aria-label="Controls and data">
      <header>
        <h1>{t('app.title')}</h1>
        <p className="muted">{t('app.subtitle')}</p>
      </header>

      {status === 'loading' && <p role="status">{t('status.loading')}</p>}
      {status === 'error' && (
        <div role="alert" className="error">
          <strong>{t('status.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      {assets && (
        <>
          <section>
            <h2>{t('layers.title')}</h2>
            <LayerToggle layer="roads" label={t('layers.roads')} />
            <LayerToggle layer="facilities" label={t('layers.facilities')} />
            {hasPlaces && <LayerToggle layer="places" label={t('layers.places')} />}
          </section>

          <ScenarioPanel />

          <section>
            <h2>{t('view.title')}</h2>
            <label className="field">
              <span>
                {t('view.exaggeration')}: {exaggeration.toFixed(1)}x
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
              />
            </label>
            <p className="muted small">{t('view.exaggerationNote')}</p>
            <button type="button" onClick={resetView}>
              {t('view.reset')}
            </button>
          </section>

          <section aria-live="polite">
            <h2>{t('hover.title')}</h2>
            {selected ? (
              <div className="card">
                <strong>{selected.name || selected.id}</strong>
                <div>
                  {t('hover.tier')}: {tierLabel(selected.tier_guess)} <Tag kind="assumption" />
                </div>
              </div>
            ) : (
              <p className="muted small">{t('hover.none')}</p>
            )}
          </section>

          <section>
            <h2>{t('legend.title')}</h2>
            <ul className="legend">
              <li><Swatch color={ROAD_COLORS.major} />{t('legend.roadMajor')}</li>
              <li><Swatch color={ROAD_COLORS.medium} />{t('legend.roadMedium')}</li>
              <li><Swatch color={ROAD_COLORS.minor} />{t('legend.roadMinor')}</li>
              <li><Swatch color={ROAD_COLORS.track} />{t('legend.roadTrack')}</li>
              <li><Swatch color={ROAD_COLORS.bridge} />{t('legend.roadBridge')}</li>
              <li><Swatch color={FACILITY_COLORS.emergency} shape="diamond" />{t('legend.facilityEmergency')}</li>
              <li><Swatch color={FACILITY_COLORS.other} shape="square" />{t('legend.facilityOther')}</li>
              {hasPlaces && <li><Swatch color={PLACE_COLOR} shape="dot" />{t('legend.place')}</li>}
            </ul>
          </section>

          <section>
            <h2>{t('data.title')}</h2>
            <ul className="facts">
              <li>
                {t('data.grid')}: {assets.meta.cols} x {assets.meta.rows}, about {Math.round(assets.meta.cell_size_m)} m cells{' '}
                <Tag kind="data" />
              </li>
              <li>
                {t('data.elevation')}: {fmt(Math.round(assets.meta.elevation_min_m))} to{' '}
                {fmt(Math.round(assets.meta.elevation_max_m))} m <Tag kind="data" />
              </li>
              <li>
                {t('data.roads')}: {fmt(assets.roads.ways)} ways, about {fmt(Math.round(assets.roads.total_km))} km{' '}
                <Tag kind="data" />
              </li>
              <li>
                {t('data.facilities')}: {fmt(assets.facilities.facilities.length)} <Tag kind="data" /> (tiers are
                name-based guesses <Tag kind="assumption" />)
              </li>
              {hasPlaces && (
                <li>
                  {t('data.places')}: {fmt(assets.places?.places.length ?? 0)} <Tag kind="data" />
                </li>
              )}
            </ul>

            <details>
              <summary>{t('facilities.list')}</summary>
              <ul className="list">
                {assets.facilities.facilities.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="link"
                      onMouseEnter={() => select(f)}
                      onFocus={() => select(f)}
                      onClick={() => select(f)}
                    >
                      {f.name || f.id}
                    </button>
                    <span className="muted small"> {tierLabel(f.tier_guess)}</span>
                  </li>
                ))}
              </ul>
            </details>

            <details>
              <summary>{t('data.sources')}</summary>
              <ul className="list">
                {assets.provenance.map((p) => (
                  <li key={p.dataset}>
                    <strong>{p.dataset}</strong>
                    <div className="small">{p.licence}</div>
                    <div className="small muted">Retrieved {p.retrieved_on}. {p.coverage_note}</div>
                    <div className="small"><em>{t('data.gaps')}:</em> {p.gaps}</div>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <footer className="credits small muted">
            <p>{t('credits.osm')}</p>
            <p>{t('credits.dem')}</p>
          </footer>
        </>
      )}

      <p className="notice" role="note">
        {t('app.notice')}
      </p>
    </aside>
  );
}
