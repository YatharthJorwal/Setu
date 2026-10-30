import { t } from '../lib/i18n';
import { tierLabel } from '../lib/tiers';
import { useSceneStore } from '../state/store';
import { Tag } from './Tag';

const fmt = (n: number): string => n.toLocaleString('en');

/** What is on the map, where it came from, and what is thin. Folded away until wanted. */
export function DataPanel() {
  const assets = useSceneStore((s) => s.assets);
  const select = useSceneStore((s) => s.select);
  const graph = useSceneStore((s) => s.graph);
  if (!assets) return null;
  const places = assets.places?.places.length ?? 0;

  return (
    <details className="card fold">
      <summary>
        <h2>{t('data.title')}</h2>
      </summary>
      <dl className="facts">
        <div>
          <dt>{t('data.grid')}</dt>
          <dd>
            {assets.meta.cols} x {assets.meta.rows}, about {Math.round(assets.meta.cell_size_m)} m <Tag kind="data" />
          </dd>
        </div>
        <div>
          <dt>{t('data.elevation')}</dt>
          <dd>
            {fmt(Math.round(assets.meta.elevation_min_m))} to {fmt(Math.round(assets.meta.elevation_max_m))} m <Tag kind="data" />
          </dd>
        </div>
        <div>
          <dt>{t('data.roads')}</dt>
          <dd>
            {fmt(assets.roads.ways)} ways, about {fmt(Math.round(assets.roads.total_km))} km <Tag kind="data" />
          </dd>
        </div>
        <div>
          <dt>{t('data.facilities')}</dt>
          <dd>
            {fmt(assets.facilities.facilities.length)} <Tag kind="data" />
            <span className="muted small"> {t('data.tiersGuess')} </span>
            <Tag kind="assumption" />
          </dd>
        </div>
        {places > 0 && (
          <div>
            <dt>{t('data.places')}</dt>
            <dd>
              {fmt(places)} <Tag kind="data" />
            </dd>
          </div>
        )}
      </dl>

      <details className="sub">
        <summary>{t('data.facilityList')}</summary>
        <ul className="rows scroll">
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
              <span className="muted small">{tierLabel(f.tier_guess)}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="sub">
        <summary>{t('data.sources')}</summary>
        <ul className="plain">
          {assets.provenance.map((p) => (
            <li key={p.dataset}>
              <strong>{p.dataset}</strong>
              <div className="small">{p.licence}</div>
              <div className="small muted">
                Retrieved {p.retrieved_on}. {p.coverage_note}
              </div>
              <div className="small">
                <em>{t('data.gaps')}:</em> {p.gaps}
              </div>
            </li>
          ))}
        </ul>
        {graph?.populationSource?.citation && (
          <p className="small muted">{t('credits.pop', { citation: graph.populationSource.citation })}</p>
        )}
        <p className="small muted">{t('credits.osm')}</p>
        <p className="small muted">{t('credits.dem')}</p>
      </details>
    </details>
  );
}
