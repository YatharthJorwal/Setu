import { t } from './i18n';

export type NewsTag = 'area' | 'region' | 'roads' | 'weather' | 'health';
export type NewsFilter = 'all' | 'area' | 'roads' | 'weather' | 'health';
export const NEWS_FILTERS: readonly NewsFilter[] = ['all', 'area', 'roads', 'weather', 'health'];
const TAGS: readonly string[] = ['area', 'region', 'roads', 'weather', 'health'];

export interface NewsItem {
  title: string;
  url: string;
  /** https only, or null */
  image: string | null;
  source: string;
  /** ISO time */
  published: string;
  lang: 'en' | 'hi';
  tags: NewsTag[];
}

export interface NewsFile {
  updated: string;
  articles: NewsItem[];
  /** set by the fetcher when part of the update failed */
  error?: string;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads news.json. Items that are malformed or unsafe are skipped; only a wrong overall shape throws. */
export function parseNews(json: unknown): NewsFile {
  if (!isRec(json) || !Array.isArray(json.articles)) throw new Error('news.json is not in the expected shape.');
  const articles: NewsItem[] = [];
  for (const raw of json.articles) {
    if (!isRec(raw)) continue;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const url = typeof raw.url === 'string' ? raw.url : '';
    const published = typeof raw.published === 'string' ? raw.published : '';
    if (title === '' || title.length > 300 || !/^https?:\/\//.test(url) || Number.isNaN(Date.parse(published))) continue;
    articles.push({
      title,
      url,
      image: typeof raw.image === 'string' && raw.image.startsWith('https://') ? raw.image : null,
      source: typeof raw.source === 'string' && raw.source !== '' ? raw.source.slice(0, 60) : new URL(url).hostname,
      published,
      lang: raw.lang === 'hi' ? 'hi' : 'en',
      tags: (Array.isArray(raw.tags) ? raw.tags : []).filter((x): x is NewsTag => typeof x === 'string' && TAGS.includes(x)),
    });
  }
  return {
    updated: typeof json.updated === 'string' && !Number.isNaN(Date.parse(json.updated)) ? json.updated : '',
    articles,
    error: typeof json.error === 'string' ? json.error : undefined,
  };
}

export function filterNews(items: readonly NewsItem[], filter: NewsFilter): NewsItem[] {
  return filter === 'all' ? [...items] : items.filter((i) => i.tags.includes(filter));
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 d ago". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (!(minutes >= 1)) return t('news.justNow');
  if (minutes < 60) return t('news.minAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('news.hourAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t('news.yesterday') : t('news.dayAgo', { n: days });
}
