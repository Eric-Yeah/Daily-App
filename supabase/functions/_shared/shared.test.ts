import { describe, expect, it } from 'vitest';
import { daysBetween, hhmm, parts } from './berlin.ts';
import { headlineDrivers, importantItems, inDays, rankNews, type NewsInput } from './briefing.ts';
import { gdeltQuery, matchTopics, topicIndex, topTopics } from './newsTopics.ts';
import { canonicalUrl, parseFeed, parseGdelt, plainText } from './rss.ts';
import { liveCandidates, parseLive } from './liveblog.ts';
import { indexMoves, isLong, parsePlan, parseWrap, sectionSources } from './wrap.ts';

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

describe('market wrap', () => {
  const news = [
    { id: 1, title: 'A', url: 'https://a.example/1', source: 'Quelle A', importance: 3, summary: null, positions: 0, publishedAt: '2026-10-12T05:00:00Z', official: false },
    { id: 2, title: 'B', url: 'https://b.example/2', source: 'Quelle B', importance: 4, summary: null, positions: 1, publishedAt: '2026-10-12T05:30:00Z', official: false },
  ];
  it('computes the latest close and the change to the close before', () => {
    const moves = indexMoves(
      [
        { symbol: '^GDAXI', day: '2026-10-09', close: 100 },
        { symbol: '^GDAXI', day: '2026-10-08', close: 98 },
        { symbol: '^GSPC', day: '2026-10-09', close: 50 },
      ],
      { '^GDAXI': 'DAX', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100' },
    );
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ name: 'DAX', day: '2026-10-09', close: 100 });
    expect(moves[0].changePct).toBeCloseTo(2.0408, 3);
    expect(moves[1].changePct).toBeNull();
  });
  it('resolves source ids to links and drops unknown ones and empty sections', () => {
    const wrap = parseWrap(
      {
        headline: ' Märkte warten auf die Fed ',
        sections: [
          { title: 'Über Nacht', text: 'Text eins.', source_ids: [2, 2, 99, 1] },
          { title: 'Leer', text: '  ', source_ids: [1] },
        ],
      },
      news,
    );
    expect(wrap?.headline).toBe('Märkte warten auf die Fed');
    expect(wrap?.points).toEqual([]);
    expect(wrap?.sections).toHaveLength(1);
    expect(wrap?.sections[0].sources).toEqual([
      { name: 'Quelle B', url: 'https://b.example/2' },
      { name: 'Quelle A', url: 'https://a.example/1' },
    ]);
  });
  it('keeps at most three points and trims them', () => {
    const wrap = parseWrap({ headline: 'H', sections: [{ title: 'T', text: 'x', source_ids: [] }], points: [' a ', 'b', '', 'c', 'd'] }, news);
    expect(wrap?.points).toEqual(['a', 'b', 'c']);
  });
  it('rejects unusable answers', () => {
    expect(parseWrap(null, news)).toBeNull();
    expect(parseWrap({ headline: '', sections: [] }, news)).toBeNull();
    expect(parseWrap({ headline: 'x', sections: [{ title: '', text: 'y', source_ids: [] }] }, news)).toBeNull();
  });
});

describe('long overview', () => {
  const news = [{ id: 1, title: 'A', url: 'https://a.example/1', source: 'Quelle A', importance: 3, summary: null, positions: 0, publishedAt: '2026-10-12T05:00:00Z', official: false }];
  it('is long in the morning and evening, short at midday', () => {
    expect(isLong('morning')).toBe(true);
    expect(isLong('evening')).toBe(true);
    expect(isLong('afternoon')).toBe(false);
  });
  it('keeps up to 8 long sections only in long mode', () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, text: 'x'.repeat(1200), source_ids: [1] }));
    expect(parseWrap({ headline: 'H', sections }, news, true)?.sections).toHaveLength(8);
    expect(parseWrap({ headline: 'H', sections }, news, true)?.sections[0].text).toHaveLength(1200);
    expect(parseWrap({ headline: 'H', sections }, news, false)?.sections).toHaveLength(5);
    expect(parseWrap({ headline: 'H', sections }, news, false)?.sections[0].text).toHaveLength(800);
  });
});

describe('live blog', () => {
  const item = (id: number, over: Partial<NewsInput> = {}): NewsInput => ({
    id,
    title: `Titel ${id}`,
    url: `https://example.com/${id}`,
    source: 'Quelle',
    importance: 3,
    summary: 'Text',
    positions: 0,
    publishedAt: `2026-10-12T1${id}:00:00Z`,
    official: false,
    ...over,
  });
  it('offers new news that is not rated unimportant and not covered yet, central banks first', () => {
    const list = [item(1, { importance: 5 }), item(2, { importance: 2 }), item(3, { importance: 3, positions: 1 }), item(4, { importance: null, official: true }), item(5, { importance: 4 }), item(6, { importance: null })];
    const ids = liveCandidates(list, new Set([5])).map((n) => n.id);
    expect(ids).toEqual([4, 1, 3, 6]);
    expect(ids).not.toContain(2); // rated unimportant
    expect(ids).not.toContain(5); // already covered
  });
  it('turns the AI answer into entries with real sources only', () => {
    const offered = [item(1), item(2)];
    const out = parseLive(
      {
        entries: [
          { headline: ' Fed hält Zinsen ', text: ' Text. ', importance: 9, item_ids: [2, 2, 99] },
          { headline: 'Ohne Quelle', text: 'x', importance: 3, item_ids: [99] },
          { headline: '', text: 'x', importance: 3, item_ids: [1] },
        ],
      },
      offered,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ headline: 'Fed hält Zinsen', body: 'Text.', importance: 5, itemIds: [2] });
    expect(out[0].sources).toEqual([{ name: 'Quelle', url: 'https://example.com/2' }]);
  });
  it('accepts an empty answer and rejects garbage', () => {
    expect(parseLive({ entries: [] }, [item(1)])).toEqual([]);
    expect(parseLive(null, [item(1)])).toEqual([]);
  });
});

describe('long overview plan', () => {
  const mk = (id: number, url = `https://example.com/${id}`): NewsInput => ({ id, title: `T${id}`, url, source: `Q${id}`, importance: 3, summary: null, positions: 0, publishedAt: '2026-10-12T05:00:00Z', official: false });
  const pool = [mk(1), mk(2), mk(3), mk(4)];
  it('keeps real ids only and assigns each news item to one topic', () => {
    const plan = parsePlan(
      {
        headline: ' Start ',
        points: ['a', 'b', 'c', 'd'],
        topics: [
          { title: 'Eins', item_ids: [1, 2, 99] },
          { title: 'Zwei', item_ids: [2, 3] },
          { title: 'Leer', item_ids: [99] },
        ],
      },
      pool,
    );
    expect(plan?.headline).toBe('Start');
    expect(plan?.points).toEqual(['a', 'b', 'c']);
    expect(plan?.topics.map((t) => [t.title, t.items.map((n) => n.id)])).toEqual([
      ['Eins', [1, 2]],
      ['Zwei', [3]],
    ]);
  });
  it('rejects plans without usable topics', () => {
    expect(parsePlan({ headline: 'x', points: [], topics: [] }, pool)).toBeNull();
    expect(parsePlan(null, pool)).toBeNull();
  });
  it('lists distinct sources, at most four', () => {
    const items = [mk(1), mk(2), mk(3, 'https://example.com/1'), mk(4), mk(5), mk(6)];
    expect(sectionSources(items).map((s) => s.url)).toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/4', 'https://example.com/5']);
  });
});
