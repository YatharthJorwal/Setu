import { useCallback, useEffect, useState } from 'react';
import { t, type Key } from '../lib/i18n';
import { NEWS_FILTERS, filterNews, parseNews, timeAgo, type NewsFile, type NewsFilter, type NewsItem } from '../lib/news';

const REFRESH_MS = 15 * 60 * 1000;
const FILTER_KEY: Record<NewsFilter, Key> = {
  all: 'news.filter.all',
  area: 'news.filter.area',
  roads: 'news.filter.roads',
  weather: 'news.filter.weather',
  health: 'news.filter.health',
};

type State = { status: 'loading' } | { status: 'ready'; news: NewsFile } | { status: 'error'; message: string };

function Thumb({ src, source }: { src: string | null; source: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="news-thumb placeholder" aria-hidden="true">
        {source.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img className="news-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function Card({ item, now }: { item: NewsItem; now: Date }) {
  const badge = item.tags.includes('area') ? t('news.badge.area') : item.tags.includes('region') ? t('news.badge.region') : null;
  return (
    <li>
      <a className="news-item" href={item.url} target="_blank" rel="noopener noreferrer">
        <Thumb src={item.image} source={item.source} />
        <span className="news-text">
          <span className="news-title" lang={item.lang === 'hi' ? 'hi' : undefined}>
            {item.title}
          </span>
          <span className="news-meta">
            {item.source} &middot; {timeAgo(item.published, now)}
            {badge && <span className="chip">{badge}</span>}
          </span>
        </span>
      </a>
    </li>
  );
}

/** Recent headlines about the corridor, with pictures. The list is refreshed by the build; this page re-reads it every 15 minutes. */
export function NewsPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/news.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) throw new Error(t('news.noFile'));
      if (!res.ok) throw new Error(t('news.unavailable'));
      setState({ status: 'ready', news: parseNews(await res.json()) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error && err.message.startsWith('No headlines') ? err.message : t('news.unavailable') });
    } finally {
      setNow(new Date());
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const items = state.status === 'ready' ? filterNews(state.news.articles, filter) : [];

  return (
    <section className="card news" aria-label={t('news.title')}>
      <div className="news-head">
        <h2>{t('news.title')}</h2>
        <button type="button" className="btn" disabled={busy} onClick={() => void load()}>
          {t('news.refresh')}
        </button>
      </div>

      {state.status === 'loading' && (
        <p role="status" className="muted small">
          {t('news.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <p role="status" className="muted small">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <p className="muted small">
            {t('news.count', { n: items.length })}
            {state.news.updated && ` ${t('news.updated', { when: timeAgo(state.news.updated, now) })}`}
          </p>
          {state.news.error && <p className="small warn">{t('news.partial')}</p>}
          <div className="filters" role="group" aria-label={t('news.filters')}>
            {NEWS_FILTERS.map((f) => (
              <button key={f} type="button" className="chip-button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(FILTER_KEY[f])}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <p className="muted small">{t('news.empty')}</p>
          ) : (
            <ul className="news-list">
              {items.map((item) => (
                <Card key={item.url} item={item} now={now} />
              ))}
            </ul>
          )}
          <p className="small faint">{t('news.credit')}</p>
        </>
      )}
    </section>
  );
}
