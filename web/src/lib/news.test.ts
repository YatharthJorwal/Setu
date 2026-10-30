import { describe, expect, it } from 'vitest';
import { filterNews, parseNews, timeAgo, type NewsItem } from './news';

const good = {
  title: 'Landslide blocks road near Guptkashi', url: 'https://example.com/a', image: 'https://img.example.com/a.jpg',
  source: 'The Hindu', published: '2026-10-27T06:00:00Z', lang: 'en', tags: ['area', 'roads'],
};

describe('parseNews', () => {
  it('reads valid articles and the update time', () => {
    const n = parseNews({ updated: '2026-10-27T12:00:00Z', articles: [good] });
    expect(n.articles.length).toBe(1);
    expect(n.updated).toBe('2026-10-27T12:00:00Z');
    expect(n.articles[0].tags).toEqual(['area', 'roads']);
  });

  it('skips anything malformed or unsafe instead of failing the whole list', () => {
    const n = parseNews({ articles: [
      good,
      { ...good, title: '' },
      { ...good, title: 'x'.repeat(400) },
      { ...good, url: 'javascript:alert(1)' },
      { ...good, url: 'ftp://example.com/x' },
      { ...good, published: 'yesterday-ish' },
      'not an object',
    ] });
    expect(n.articles.length).toBe(1);
  });

  it('drops insecure images, unknown tags and fills a missing source from the address', () => {
    const n = parseNews({ articles: [{ ...good, image: 'http://insecure.example.com/a.jpg', tags: ['area', 'gossip'], source: '' }] });
    expect(n.articles[0].image).toBeNull();
    expect(n.articles[0].tags).toEqual(['area']);
    expect(n.articles[0].source).toBe('example.com');
  });

  it('carries the fetcher error note and rejects the wrong overall shape', () => {
    expect(parseNews({ articles: [], error: 'GDELT timed out' }).error).toBe('GDELT timed out');
    expect(() => parseNews(null)).toThrow(/expected shape/);
    expect(() => parseNews({ articles: 'nope' })).toThrow(/expected shape/);
  });
});

describe('filterNews', () => {
  const items = [
    { ...good, tags: ['area', 'roads'] },
    { ...good, url: 'https://example.com/b', tags: ['region', 'weather'] },
    { ...good, url: 'https://example.com/c', tags: ['area', 'health'] },
  ] as NewsItem[];
  it('keeps everything for All and narrows by tag otherwise', () => {
    expect(filterNews(items, 'all').length).toBe(3);
    expect(filterNews(items, 'area').length).toBe(2);
    expect(filterNews(items, 'weather').length).toBe(1);
    expect(filterNews(items, 'roads').length).toBe(1);
    expect(filterNews(items, 'health').length).toBe(1);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  it('speaks in minutes, hours and days, and never in the future', () => {
    expect(timeAgo('2026-10-27T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-27T12:30:00Z', now)).toBe('just now');
    expect(timeAgo('2026-10-27T11:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2026-10-27T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-26T09:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-10-22T12:00:00Z', now)).toBe('5 d ago');
  });
});
