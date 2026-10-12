import { describe, expect, it } from 'vitest';
import type { LiveNews } from '../data/live';
import { marketsOf } from './markets';
import { activeCount, applyFilter, DEFAULT_FILTER, fold, hiddenCount, isRelevant, marketCounts } from './newsFilter';

const NOW = new Date('2026-10-12T08:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function item(id: string, over: Partial<LiveNews>): LiveNews {
  return {
    id,
    topic: 'Markt',
    topics: [],
    positions: 0,
    title: 'Titel',
    summary: '',
    source: 'tagesschau.de',
    publishedAt: hoursAgo(1),
    url: `https://example.com/${id}`,
    importance: null,
    official: false,
    ...over,
  };
}

describe('markets', () => {
  it('assigns markets by whole words', () => {
    expect(marketsOf('DAX schließt höher, Bundesbank warnt')).toEqual(expect.arrayContaining(['de', 'rates']));
    expect(marketsOf('Wall Street: Nasdaq und S&P 500 legen zu')).toContain('us');
    expect(marketsOf('Ölpreis steigt, Opec berät')).toContain('commodities');
    expect(marketsOf('Bitcoin fällt unter Marke')).toContain('crypto');
    expect(marketsOf('Nvidia und KI treiben die Chip-Werte')).toContain('tech');
  });
  it('does not match parts of words or lower-case short words', () => {
    expect(marketsOf('Goldman Sachs erhöht die Prognose')).not.toContain('commodities');
    expect(marketsOf('Bus und Taxi')).not.toContain('us');
    expect(marketsOf('the fed up crowd')).not.toContain('us');
    expect(marketsOf('Die Energiewende kommt voran')).toEqual([]);
  });
});

describe('news filter', () => {
  const items = [
    item('a', { title: 'DAX auf Rekordhoch', importance: 3, publishedAt: hoursAgo(2), positions: 1, topics: ['DAX'] }),
    item('b', { title: 'Fed lässt Zinsen unverändert', importance: 5, source: 'Federal Reserve', official: true, publishedAt: hoursAgo(10) }),
    item('c', { title: 'Bitcoin steigt', importance: 2, source: 'CNBC', publishedAt: hoursAgo(30) }),
    item('d', { title: 'Öl wird teurer', summary: 'Opec kürzt die Förderung.', importance: 4, source: 'CNBC', publishedAt: hoursAgo(5) }),
  ];

  const all = { ...DEFAULT_FILTER, showAll: true };
  it('sorts by importance or recency', () => {
    expect(applyFilter(items, all, NOW).map((n) => n.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(applyFilter(items, { ...all, sort: 'recent' }, NOW).map((n) => n.id)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('filters by time window, source, depot, importance and central banks', () => {
    expect(applyFilter(items, { ...all, hours: 6 }, NOW).map((n) => n.id).sort()).toEqual(['a', 'd']);
    expect(applyFilter(items, { ...all, source: 'CNBC' }, NOW).map((n) => n.id).sort()).toEqual(['c', 'd']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, onlyDepot: true }, NOW).map((n) => n.id)).toEqual(['a']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, onlyImportant: true }, NOW).map((n) => n.id)).toEqual(['b', 'd']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, onlyOfficial: true }, NOW).map((n) => n.id)).toEqual(['b']);
  });
  it('filters by market (any of the chosen) and counts them', () => {
    expect(applyFilter(items, { ...all, markets: ['crypto'] }, NOW).map((n) => n.id)).toEqual(['c']);
    expect(applyFilter(items, { ...all, markets: ['crypto', 'commodities'] }, NOW).map((n) => n.id).sort()).toEqual(['c', 'd']);
    expect(marketCounts(items)).toMatchObject({ crypto: 1, commodities: 1, de: 1, us: 1, rates: 1 });
  });
  it('searches all words in title, summary and source, ignoring case and accents', () => {
    expect(applyFilter(items, { ...DEFAULT_FILTER, query: 'opec förderung' }, NOW).map((n) => n.id)).toEqual(['d']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, query: 'FED zinsen' }, NOW).map((n) => n.id)).toEqual(['b']);
    expect(applyFilter(items, { ...all, query: 'cnbc bitcoin' }, NOW).map((n) => n.id)).toEqual(['c']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, query: 'gibtsnicht' }, NOW)).toEqual([]);
    expect(fold('Zürich Öl')).toBe('zurich ol');
  });
  it('hides unimportant news by default, but keeps what concerns the depot and central banks', () => {
    const list = [
      item('imp5', { importance: 5 }),
      item('imp3', { importance: 3 }),
      item('imp2', { importance: 2 }),
      item('imp1', { importance: 1 }),
      item('depot2', { importance: 2, positions: 1 }),
      item('depot1', { importance: 1, positions: 2 }),
      item('official1', { importance: 1, official: true }),
      item('fresh', { importance: null, publishedAt: hoursAgo(1) }),
      item('stale', { importance: null, publishedAt: hoursAgo(20) }),
      item('staleDepot', { importance: null, positions: 1, publishedAt: hoursAgo(20) }),
    ];
    expect(applyFilter(list, { ...DEFAULT_FILTER, sort: 'recent' }, NOW).map((n) => n.id).sort()).toEqual(['depot2', 'fresh', 'imp3', 'imp5', 'official1', 'staleDepot']);
    expect(applyFilter(list, all, NOW)).toHaveLength(list.length);
    expect(hiddenCount(list, DEFAULT_FILTER, NOW)).toBe(4);
    expect(hiddenCount(list, all, NOW)).toBe(0);
    expect(isRelevant(item('x', { importance: 2 }), NOW)).toBe(false);
  });
  it('counts active filters without the sort order', () => {
    expect(activeCount(DEFAULT_FILTER)).toBe(0);
    expect(activeCount({ ...DEFAULT_FILTER, query: 'x', markets: ['us', 'de'], hours: 24, onlyDepot: true, sort: 'recent' })).toBe(5);
    expect(activeCount({ ...DEFAULT_FILTER, showAll: true })).toBe(1);
  });
});
