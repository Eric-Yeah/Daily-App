import { describe, expect, it } from 'vitest';
import { daysBetween, hhmm, parts } from './berlin.ts';
import { headlineDrivers, importantItems, inDays, rankNews, type NewsInput } from './briefing.ts';
import { gdeltQuery, matchTopics, topicIndex, topTopics } from './newsTopics.ts';
import { canonicalUrl, parseFeed, parseGdelt, plainText } from './rss.ts';

describe('RSS', () => {
  it('reads RSS 2.0 with CDATA, entities and HTML teasers', () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Feed</title>
      <item><title><![CDATA[Chipwerte &amp; Nvidia unter Druck]]></title>
        <link>https://example.com/a?utm_source=rss&amp;id=7</link>
        <description>&lt;p&gt;Die &lt;b&gt;Halbleiter&lt;/b&gt; fallen.&lt;/p&gt;</description>
        <pubDate>Mon, 12 Oct 2026 08:15:00 +0200</pubDate></item>
      <item><title>Ohne Link</title></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Chipwerte & Nvidia unter Druck', url: 'https://example.com/a?id=7', teaser: 'Die Halbleiter fallen.' });
    expect(items[0].publishedAt?.toISOString()).toBe('2026-10-12T06:15:00.000Z');
  });
  it('reads Atom entries', () => {
    const xml = `<feed><entry><title>EZB belässt Zinsen</title><link rel="alternate" href="https://example.org/ezb"/>
      <updated>2026-10-29T12:15:00Z</updated><summary>Kurz.</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ title: 'EZB belässt Zinsen', url: 'https://example.org/ezb', teaser: 'Kurz.' });
  });
  it('strips markup and rejects non-http links', () => {
    expect(plainText('<![CDATA[<a href="x">A</a> &amp; B]]>')).toBe('A & B');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });
  it('reads GDELT results and keeps only German and English', () => {
    const items = parseGdelt({
      articles: [
        { url: 'https://www.example.de/x', title: 'Titel', seendate: '20261012T061500Z', domain: 'www.example.de', language: 'German' },
        { url: 'https://example.fr/y', title: 'Titre', seendate: '20261012T061500Z', domain: 'example.fr', language: 'French' },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ lang: 'de', source: 'example.de' });
    expect(items[0].publishedAt?.toISOString()).toBe('2026-10-12T06:15:00.000Z');
  });
});

describe('topics', () => {
  const topics = ['Halbleiter', 'USA', 'Zinsen', 'KI und Robotik', 'Gold'];
  it('matches whole words incl. synonyms', () => {
    expect(matchTopics('Nvidia-Aktie steigt kräftig', topics)).toEqual(['Halbleiter']);
    expect(matchTopics('Fed signals rate cut as Wall Street rallies', topics).sort()).toEqual(['USA', 'Zinsen']);
    expect(matchTopics('Die EZB lässt den Leitzins unverändert', topics)).toEqual(['Zinsen']);
  });
  it('does not match parts of words or lower-case short words', () => {
    expect(matchTopics('Goldman Sachs erhöht Prognose', topics)).toEqual([]);
    expect(matchTopics('Diskussion über Kinderbetreuung', topics)).toEqual([]);
    expect(matchTopics('the paint is gold-coloured and fed up', ['Gold', 'Zinsen'])).toEqual([]);
  });
  it('indexes positions per topic and ranks topics', () => {
    const idx = topicIndex([
      { id: 'a', topics: ['USA', 'Welt'] },
      { id: 'b', topics: ['USA'] },
      { id: 'c', topics: ['Halbleiter'] },
    ]);
    expect(idx.get('USA')).toEqual(['a', 'b']);
    expect(topTopics(idx, 2)).toEqual(['USA', 'Halbleiter']);
    expect(gdeltQuery('Halbleiter')).toContain('sourcelang:german');
  });
});

describe('briefing', () => {
  const now = new Date('2026-10-28T05:30:00Z'); // 06:30 Berlin (CET)
  const news = (over: Partial<NewsInput>): NewsInput => ({
    id: 1,
    title: 'Meldung',
    url: 'https://example.com/n',
    source: 'Quelle',
    importance: 3,
    summary: null,
    positions: 1,
    publishedAt: '2026-10-28T05:00:00Z',
    official: false,
    ...over,
  });

  it('collects events, important news and deadlines (max 3)', () => {
    const items = importantItems(
      now,
      [
        { startsAt: '2026-10-28T18:00:00Z', title: 'Fed-Zinsentscheid', importance: 5, sourceUrl: 'https://www.federalreserve.gov/' },
        { startsAt: '2026-10-29T13:15:00Z', title: 'EZB-Zinsentscheid', importance: 5, sourceUrl: null },
      ],
      [news({ id: 2, title: 'Chipwerte unter Druck', importance: 5, positions: 2 }), news({ id: 3, importance: 2 })],
      [{ title: 'Deutsch-Klausur', date: '2026-10-31' }, { title: 'Alte Klausur', date: '2026-10-20' }],
    );
    expect(items.map((i) => i.text)).toEqual(['Fed-Zinsentscheid um 19:00 Uhr', 'Chipwerte unter Druck', 'Deutsch-Klausur in 3 Tagen']);
  });

  it('formats day distances', () => {
    expect([inDays(0), inDays(1), inDays(3)]).toEqual(['heute', 'morgen', 'in 3 Tagen']);
    expect(daysBetween('2026-10-28', '2026-10-31')).toBe(3);
  });

  it('ranks by importance, positions, recency and falls back to headlines', () => {
    const r = rankNews([news({ id: 1, importance: 3 }), news({ id: 2, importance: 5 }), news({ id: 3, importance: 3, positions: 4 })]);
    expect(r.map((n) => n.id)).toEqual([2, 3, 1]);
    expect(headlineDrivers([])).toBeNull();
    expect(headlineDrivers([news({ title: 'A', source: 'S' })])?.items).toEqual(['A (S)']);
  });

  it('uses Berlin time across DST', () => {
    expect(hhmm(new Date('2026-10-12T12:30:00Z'))).toBe('14:30');
    expect(hhmm(new Date('2026-12-02T12:30:00Z'))).toBe('13:30');
    expect(parts(new Date('2026-10-25T00:30:00Z')).hour).toBe(2);
  });
});
