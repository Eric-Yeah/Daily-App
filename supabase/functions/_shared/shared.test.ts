import { describe, expect, it } from 'vitest';
import { daysBetween, hhmm, parts } from './berlin.ts';
import { headlineDrivers, importantItems, inDays, rankNews, type NewsInput } from './briefing.ts';
import { gdeltQuery, matchTopics, topicIndex, topTopics } from './newsTopics.ts';
import { canonicalUrl, parseFeed, parseGdelt, plainText } from './rss.ts';
import { liveBlogActive, liveCandidates, parseLive } from './liveblog.ts';
import { classifyArticle, detailSystem, detailUser, extractArticle, isFetchableUrl, MAX_ARTICLE_CHARS, parseConclusion, parseDetail } from './article.ts';
import { indexMoves, isLong, parsePlan, parseWrap, sectionSources } from './wrap.ts';
import { isNoise } from './newsNoise.ts';
import { buildOpen, newsAbout, parseOpen, pickMovers, quoteOf } from './marketopen.ts';
import { cleanName, MAX_TOPICS, parseTopics, topicsSystem, topicsUser } from './topicSuggest.ts';
import { KNOWN_TOPICS } from './newsTopics.ts';
import type { ChartData } from './prices.ts';

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
    expect(matchTopics('Nvidia-Aktie steigt kräftig', topics)).toEqual(['Halbleiter', 'KI und Robotik']);
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

describe('Artikel für die ausführliche Zusammenfassung', () => {
  const para = (n: number) => `Absatz ${n}: Die Notenbank hat ihre Prognose für das Wachstum im kommenden Jahr leicht angehoben und verweist auf robuste Konsumausgaben.`;
  const page = (inner: string, head = '') =>
    `<html><head>${head}<script>var ad = "<p>Werbung im Skript, das nie Text sein darf, weil es Code ist.</p>";</script></head><body>
      <nav><p>Startseite Wirtschaft Politik Sport und viele weitere Menüpunkte der Seite</p></nav>${inner}<footer><p>Impressum und Datenschutz und Nutzungsbedingungen der Seite</p></footer></body></html>`;

  it('liest die Absätze des Artikels und lässt Menü, Fuß und Skripte weg', () => {
    const html = page(`<article><header><p>Überschrift-Teaser im Kopf des Artikels, der doppelt wäre</p></header>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<p>${para(n)}</p>`).join('')}<p>Anzeige: Jetzt Depot eröffnen und profitieren</p></article>`);
    const a = extractArticle(html);
    expect(a.paywall).toBe(false);
    expect(a.text).toContain('Absatz 1');
    expect(a.text).toContain('Absatz 10');
    expect(a.text).not.toMatch(/Startseite|Impressum|Werbung im Skript|Anzeige|Teaser im Kopf/);
    expect(classifyArticle(a)).toBe('ok');
  });
  it('erkennt eine Bezahlschranke an der Angabe der Seite und fasst dann nichts zusammen', () => {
    const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","isAccessibleForFree":"False","articleBody":"${'Anreißer '.repeat(20)}"}</script>`;
    const html = page(`<article>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<p>${para(n)}</p>`).join('')}</article>`, ld);
    const a = extractArticle(html);
    expect(a.paywall).toBe(true);
    expect(classifyArticle(a)).toBe('no_text');
  });
  it('erkennt die Bezahlschranke auch in @graph und bei isAccessibleForFree: false', () => {
    const ld = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["Article","NewsArticle"],"isAccessibleForFree":false}]}</script>`;
    expect(extractArticle(page('<article><p>x</p></article>', ld)).paywall).toBe(true);
    const free = `<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":true}</script>`;
    expect(extractArticle(page('<article><p>x</p></article>', free)).paywall).toBe(false);
  });
  it('nur Anreißer, Skript-Seiten und leere Seiten: kein lesbarer Text', () => {
    expect(classifyArticle(extractArticle(page('<article><p>Nur ein kurzer Anreißer ohne den eigentlichen Artikel dahinter.</p></article>')))).toBe('no_text');
    expect(classifyArticle(extractArticle('<html><body><div id="app"></div></body></html>'))).toBe('no_text');
  });
  it('kurze Artikel bekommen keine lange Fassung', () => {
    const html = page(`<article>${[1, 2, 3, 4, 5].map((n) => `<p>${para(n)}</p>`).join('')}</article>`);
    expect(classifyArticle(extractArticle(html))).toBe('short');
  });
  it('nutzt den Artikeltext aus JSON-LD, wenn er länger ist, und begrenzt die Länge für die KI', () => {
    const body = 'Ein langer Satz über die Märkte und die Zinsen. '.repeat(600);
    const ld = `<script type="application/ld+json">{"@type":"NewsArticle","articleBody":"${body}"}</script>`;
    const a = extractArticle(page('<article><p>Kurzer Absatz mit genug Zeichen, um mitzuzählen, aber viel kürzer.</p></article>', ld));
    expect(a.text.length).toBeLessThanOrEqual(MAX_ARTICLE_CHARS);
    expect(a.text.length).toBeGreaterThan(10_000);
  });
  it('ruft nur öffentliche https-Seiten ab', () => {
    expect(isFetchableUrl('https://www.tagesschau.de/wirtschaft/a.html')).toBe(true);
    for (const bad of ['http://www.tagesschau.de/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://intern.internal/a', 'https://example.com:8443/a', 'ftp://example.com/a', 'kein link'])
      expect(isFetchableUrl(bad)).toBe(false);
  });
  it('der Prompt nennt 1 bis 2 Minuten, die Regeln und trennt den Artikel als Daten ab', () => {
    expect(detailSystem('Regeln (immer einhalten): …')).toMatch(/höchstens 300 Wörter/);
    expect(detailSystem('Regeln (immer einhalten): …')).toContain('Regeln (immer einhalten)');
    expect(detailUser({ title: 'T', source: 'S', lang: 'de' }, 'Text')).toContain('<artikel>\nText\n</artikel>');
  });
  it('prüft die Antwort der KI: zu kurz oder falsch geformt wird verworfen, zu lang auf ganze Sätze gekürzt', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `Wort${i}`).join(' ') + '.';
    expect(parseDetail(null)).toBeNull();
    expect(parseDetail({ summary: 5 })).toBeNull();
    expect(parseDetail({ summary: 'Zu kurz.' })).toBeNull();
    expect(parseDetail({ summary: `${words(60)}\n\n\n  ${words(60)}` })).toBe(`${words(60)}\n\n${words(60)}`);
    const long = parseDetail({ summary: Array.from({ length: 400 }, (_, i) => `Das ist Satz Nummer ${i} mit etwas Text.`).join(' ') })!;
    expect(long.length).toBeLessThanOrEqual(2800);
    expect(long.endsWith('.')).toBe(true);
  });
  it('das Fazit hat höchstens 3 ganze Sätze', () => {
    expect(parseConclusion({ conclusion: 'Eins ist klar. Zwei folgt daraus. Drei ist offen. Vier ist zu viel.' })).toBe('Eins ist klar. Zwei folgt daraus. Drei ist offen.');
    expect(parseConclusion({ conclusion: '  Ein einzelner Satz über das Thema USA  ohne Punkt  ' })).toBe('Ein einzelner Satz über das Thema USA ohne Punkt');
    expect(parseConclusion({ conclusion: 'Ja.' })).toBeNull();
    expect(parseConclusion({ conclusion: 5 })).toBeNull();
    expect(parseConclusion({})).toBeNull();
    expect(parseConclusion({ conclusion: `${'Sehr lang '.repeat(80)}.` })).toBeNull();
  });
  it('der Prompt verlangt ein kurzes Fazit ohne Prognose und gibt nur Themen, nie Positionen weiter', () => {
    const sys = detailSystem('Regeln');
    expect(sys).toMatch(/höchstens 3 Sätze/);
    expect(sys).toMatch(/keine Kursrichtung/);
    expect(sys).toMatch(/nur die Themen/);
    const user = detailUser({ title: 'T', source: 'S', lang: 'de' }, 'Text', { topics: ['USA', 'Technologie'], positions: 3 });
    expect(user).toContain('Themen deines Depots, die im Artikel vorkommen: USA, Technologie (betrifft 3 Positionen)');
    expect(detailUser({ title: 'T', source: 'S', lang: 'de' }, 'Text')).toContain('vorkommen: keine');
  });
});

describe('wider topic matching', () => {
  it('connects general market news with broad index topics', () => {
    expect(matchTopics('Dax startet im Plus, Anleger warten auf US-Zahlen', ['Deutschland', 'Welt'])).toEqual(['Deutschland', 'Welt']);
    expect(matchTopics('Trump kündigt neue Zölle an', ['USA', 'Welt'])).toEqual(['USA', 'Welt']);
    expect(matchTopics('Rechenzentren treiben den Strombedarf', ['KI und Robotik'])).toEqual(['KI und Robotik']);
  });
  it('does not match everything that mentions money', () => {
    expect(matchTopics('Firma zahlt 20 Millionen Euro und 5 Millionen Dollar Strafe', ['Europa', 'USA'])).toEqual([]);
  });
});

describe('news noise', () => {
  it('drops sport, lifestyle and similar items', () => {
    expect(isNoise({ title: 'Bundesliga: Bayern gewinnt klar', url: 'https://www.spiegel.de/sport/x' })).toBe(true);
    expect(isNoise({ title: 'Tagesgeld im Vergleich', url: 'https://www.theguardian.com/lifeandstyle/2026/x' })).toBe(true);
    expect(isNoise({ title: 'Horoskop für heute', url: 'https://example.com/a' })).toBe(true);
  });
  it('keeps business news and anything official', () => {
    expect(isNoise({ title: 'DAX schließt höher, Siemens Energy im Aufwind', url: 'https://www.faz.net/finanzen/x' })).toBe(false);
    expect(isNoise({ title: 'Bundesliga-Klubs und Anleihen', url: 'https://example.com/a', official: true })).toBe(false);
  });
});

describe('market start update', () => {
  const day = '2026-10-12';
  const chart = (prev: number, price: number, ts: string): ChartData => ({ symbol: 'X', currency: 'EUR', gmtOffsetSec: 7200, prevClose: prev, points: [{ ts, price }] });
  const sym = { symbol: 'SAP.DE', name: 'SAP' };

  it('computes the change only for a price from today', () => {
    expect(quoteOf(sym, chart(100, 103, '2026-10-12T07:15:00Z'), day)?.changePct).toBeCloseTo(3);
    expect(quoteOf(sym, chart(100, 103, '2026-10-09T15:15:00Z'), day)).toBeNull();
    expect(quoteOf(sym, { ...chart(100, 103, '2026-10-12T07:15:00Z'), prevClose: null }, day)).toBeNull();
    expect(quoteOf(sym, null, day)).toBeNull();
  });

  const q = (symbol: string, name: string, changePct: number) => ({ symbol, name, changePct, ts: '2026-10-12T07:15:00Z' });
  const quotes = [q('A', 'A', 4), q('B', 'B', 2.2), q('C', 'C', 0.2), q('D', 'D', -0.3), q('E', 'E', -1.5), q('F', 'F', -6), q('G', 'G', 1), q('H', 'H', 0.9)];

  it('picks the biggest winners and losers above the minimum', () => {
    const m = pickMovers(quotes);
    expect(m.gainers.map((x) => x.symbol)).toEqual(['A', 'B', 'G']);
    expect(m.losers.map((x) => x.symbol)).toEqual(['F', 'E']);
  });

  const news = [
    { id: 1, title: 'SAP hebt Prognose an', url: 'https://example.com/1', source: 'Handelsblatt', importance: 4, summary: 'SAP erwartet mehr Cloud-Umsatz.', positions: 0, publishedAt: '2026-10-12T06:00:00Z', official: false },
    { id: 2, title: 'Ölpreis fällt', url: 'https://example.com/2', source: 'CNBC', importance: 3, summary: null, positions: 0, publishedAt: '2026-10-12T06:10:00Z', official: false },
  ];

  it('finds news that name a mover (whole words)', () => {
    expect(newsAbout([q('SAP.DE', 'SAP', 3)], news).map((n) => n.id)).toEqual([1]);
    expect(newsAbout([q('SAP.DE', 'SAP', 3)], [{ ...news[1], title: 'Sapphire Ventures investiert' }])).toEqual([]);
  });

  it('accepts a reason only for a real mover and a real news item', () => {
    const movers = [q('SAP.DE', 'SAP', 3), q('BMW.DE', 'BMW', -2)];
    const parsed = parseOpen(
      {
        headline: 'DAX startet freundlich',
        text: 'Der DAX liegt im Plus.',
        reasons: [
          { symbol: 'SAP.DE', reason: 'Laut Handelsblatt hebt SAP die Prognose an.', item_id: 1 },
          { symbol: 'BMW.DE', reason: 'Erfunden', item_id: 99 },
          { symbol: 'XYZ', reason: 'Unbekannt', item_id: 1 },
          { symbol: 'BMW.DE', reason: 'Eine konkrete Meldung liegt nicht vor.', item_id: 1 },
          { symbol: 'BMW.DE', reason: 'Laut CNBC fällt der Ölpreis.', item_id: 2 },
        ],
      },
      movers,
      news,
    );
    expect([...(parsed?.reasons.keys() ?? [])]).toEqual(['SAP.DE']);
    expect(parsed?.reasons.get('SAP.DE')?.source).toEqual({ name: 'Handelsblatt', url: 'https://example.com/1' });
    expect(parseOpen({ headline: '', text: 'x', reasons: [] }, movers, news)).toBeNull();
    expect(parseOpen(null, movers, news)).toBeNull();
  });

  it('builds the content with and without the AI text', () => {
    const base = { day, now: new Date('2026-10-12T07:40:00Z'), asOf: '2026-10-12T07:15:00Z', indices: [{ name: 'DAX', changePct: 0.456 }], gainers: [q('SAP.DE', 'SAP', 3.456)], losers: [] };
    const plain = buildOpen({ ...base, ai: null });
    expect(plain).toMatchObject({ ai: false, headline: null, text: null, indices: [{ name: 'DAX', changePct: 0.46 }], gainers: [{ name: 'SAP', changePct: 3.46, reason: null, source: null }] });
    const withAi = buildOpen({ ...base, ai: parseOpen({ headline: 'H', text: 'T', reasons: [{ symbol: 'SAP.DE', reason: 'Grund', item_id: 1 }] }, [q('SAP.DE', 'SAP', 3.456)], news) });
    expect(withAi).toMatchObject({ ai: true, headline: 'H', text: 'T', gainers: [{ reason: 'Grund' }] });
  });
});

describe('topic suggestions', () => {
  it('sends only cleaned names and lists the known topics', () => {
    expect(cleanName('  iShares <b>Core</b>   MSCI World ')).toBe('iShares bCore/b MSCI World');
    expect(cleanName(42)).toBe('');
    expect(topicsUser(['A', 'B'])).toContain('1: B');
    expect(topicsSystem(KNOWN_TOPICS)).toContain('Halbleiter');
  });
  it('reads the answer per position and never throws on bad data', () => {
    const data = {
      items: [
        { index: 1, topics: ['USA', ' usa ', 'Nasdaq 100', '<script>', 7, ''] },
        { index: 0, topics: ['Welt'] },
        { index: 5, topics: ['Weg'] },
        { index: 'x', topics: ['Weg'] },
        { index: 2, topics: 'Welt' },
      ],
    };
    expect(parseTopics(data, 3)).toEqual([['Welt'], ['USA', 'Nasdaq 100', 'script'], []]);
    expect(parseTopics(null, 2)).toEqual([[], []]);
    expect(parseTopics({ items: [{ index: 0, topics: Array.from({ length: 12 }, (_, i) => `Thema ${i}`) }] }, 1)[0]).toHaveLength(MAX_TOPICS);
  });
});

describe('liveBlogActive', () => {
  it('starts at 10:30 and ends before 23:00', () => {
    expect(liveBlogActive(10, 2)).toBe(false);
    expect(liveBlogActive(10, 29)).toBe(false);
    expect(liveBlogActive(10, 30)).toBe(true);
    expect(liveBlogActive(12, 0)).toBe(true);
    expect(liveBlogActive(22, 59)).toBe(true);
    expect(liveBlogActive(23, 0)).toBe(false);
  });
});
