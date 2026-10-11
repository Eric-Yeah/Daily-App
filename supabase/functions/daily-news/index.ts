// Daily App – Edge Function "daily-news" (Deno).
// Fetches news from fixed, publicly offered feeds plus a GDELT search per depot topic, stores only
// title, teaser, link, source and time, links them to the positions by topic and summarises new ones
// with Claude Haiku 5.5 (within the monthly budget).
//
// Called by pg_cron every 30 minutes with the secret header x-daily-cron (see migration 0005).
// Deploy: npx supabase functions deploy daily-news --no-verify-jwt --use-api --project-ref <ref>
import { admin, isCron, json, CORS, ownerId, ownerSettings } from '../_shared/admin.ts';
import { askJson, RULES } from '../_shared/ai.ts';
import { parts } from '../_shared/berlin.ts';
import { gdeltQuery, matchTopics, topicIndex, topTopics } from '../_shared/newsTopics.ts';
import { parseFeed, parseGdelt, type FeedItem } from '../_shared/rss.ts';

interface Feed {
  id: string;
  url: string;
  source: string;
  lang: 'de' | 'en';
  official: boolean;
}

// Publicly offered RSS feeds. Only headline, teaser and link are used; the article stays at the source.
const FEEDS: Feed[] = [
  { id: 'rss:tagesschau-wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:tagesschau-finanzen', url: 'https://www.tagesschau.de/wirtschaft/finanzen/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:cnbc-markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  { id: 'rss:cnbc-economy', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  // Reuters and dpa offer no free feeds. Zeit Online carries dpa reports; the others cover German and international markets.
  { id: 'rss:zeit-wirtschaft', url: 'https://newsfeed.zeit.de/wirtschaft/index', source: 'ZEIT ONLINE', lang: 'de', official: false },
  { id: 'rss:handelsblatt', url: 'https://www.handelsblatt.com/contentexport/feed/schlagzeilen', source: 'Handelsblatt', lang: 'de', official: false },
  { id: 'rss:spiegel-wirtschaft', url: 'https://www.spiegel.de/wirtschaft/index.rss', source: 'SPIEGEL', lang: 'de', official: false },
  { id: 'rss:faz-finanzen', url: 'https://www.faz.net/rss/aktuell/finanzen/', source: 'FAZ', lang: 'de', official: false },
  { id: 'rss:bbc-business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC News', lang: 'en', official: false },
  { id: 'rss:marketwatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', lang: 'en', official: false },
  { id: 'rss:ecb', url: 'https://www.ecb.europa.eu/rss/press.html', source: 'EZB', lang: 'en', official: true },
  { id: 'rss:fed', url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Federal Reserve', lang: 'en', official: true },
  { id: 'rss:bundesbank', url: 'https://www.bundesbank.de/service/rss/de/633286/feed.rss', source: 'Bundesbank', lang: 'de', official: true },
];

const UA = 'DailyApp/1.0 (+https://eric-yeah.github.io/Daily-App/)';
const MAX_AGE_H = 48;
const GDELT_TOPICS = 4;
const SUMMARY_BATCH = 10;
const SUMMARY_MAX_PER_RUN = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
  } catch {
    return null;
  }
}

interface Candidate extends FeedItem {
  source: string;
  lang: 'de' | 'en' | null;
  feed: string;
  official: boolean;
  topics: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  if (!(await isCron(req, db))) return json(401, { error: 'unauthorized' });
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };

  const now = new Date();
  const hour = parts(now).hour;
  if (!body.force && (hour < 6 || hour > 22)) return json(200, { skipped: 'night' });

  const owner = await ownerId(db);
  if (!owner) return json(200, { skipped: 'no owner' });
  const settings = await ownerSettings(db, owner);

  const { data: positions } = await db.from('positions').select('id, topics').eq('user_id', owner).eq('archived', false);
  const idx = topicIndex((positions ?? []) as { id: string; topics: string[] }[]);
  const topics = [...idx.keys()];
  const minDate = now.getTime() - MAX_AGE_H * 3600_000;

  // 1. Feeds
  const candidates: Candidate[] = [];
  const feedTexts = await Promise.all(FEEDS.map((f) => fetchText(f.url)));
  // Per feed: items read / kept, or "failed" if it could not be fetched (shows up in the response)
  const feedStats: Record<string, string> = {};
  FEEDS.forEach((f, i) => {
    const text = feedTexts[i];
    if (text === null) {
      feedStats[f.id] = 'failed';
      return;
    }
    const items = parseFeed(text);
    let kept = 0;
    for (const item of items) {
      if (!item.publishedAt || item.publishedAt.getTime() < minDate) continue;
      const found = matchTopics(`${item.title} ${item.teaser ?? ''}`, topics);
      // General feeds: only news about the depot's topics. Central banks: always (rates matter for everything).
      if (!found.length && !f.official) continue;
      candidates.push({ ...item, source: f.source, lang: f.lang, feed: f.id, official: f.official, topics: found });
      kept++;
    }
    feedStats[f.id] = `${kept}/${items.length}`;
  });

  // 2. GDELT search for the most widely held topics (rate limit: one request every 5 seconds)
  for (const [i, topic] of topTopics(idx, GDELT_TOPICS).entries()) {
    if (i > 0) await sleep(5500);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gdeltQuery(topic))}&mode=artlist&maxrecords=8&timespan=24h&sort=datedesc&format=json`;
    const text = await fetchText(url);
    if (!text) continue;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    for (const a of parseGdelt(parsed)) {
      if (!a.publishedAt || a.publishedAt.getTime() < minDate) continue;
      const found = matchTopics(a.title, topics);
      candidates.push({ ...a, feed: 'gdelt', official: false, topics: found.length ? found : [topic] });
    }
  }

  // 3. Store (first source wins for a URL)
  const seen = new Set<string>();
  const rows = candidates
    .filter((c) => !seen.has(c.url) && seen.add(c.url))
    .map((c) => ({
      url: c.url,
      title: c.title,
      teaser: c.teaser,
      source: c.source.slice(0, 100),
      lang: c.lang,
      published_at: c.publishedAt!.toISOString(),
      feed: c.feed,
      topics: c.topics,
      official: c.official,
    }));
  if (rows.length) await db.from('news_items').upsert(rows, { onConflict: 'url', ignoreDuplicates: true });

  // 4. Link recent news to positions (recomputed, so changed topics are picked up too)
  const { data: recent } = await db
    .from('news_items')
    .select('id, title, teaser, topics')
    .gte('published_at', new Date(minDate).toISOString())
    .limit(500);
  const links = (recent ?? []).flatMap((s: { id: number; title: string; teaser: string | null; topics: string[] }) => {
    const found = new Set([...s.topics, ...matchTopics(`${s.title} ${s.teaser ?? ''}`, topics)]);
    const ids = new Set([...found].flatMap((t) => idx.get(t) ?? []));
    return [...ids].map((position_id) => ({ item_id: s.id, position_id }));
  });
  if (links.length) await db.from('news_links').upsert(links, { onConflict: 'item_id,position_id', ignoreDuplicates: true });

  // 5. Summaries for new items (most relevant first), within the budget
  const { data: open } = await db
    .from('news_items')
    .select('id, title, teaser, source, lang, published_at, official, news_summaries(item_id), news_links(position_id)')
    .gte('published_at', new Date(minDate).toISOString())
    .order('published_at', { ascending: false })
    .limit(200);
  const todo = (open ?? [])
    .filter((n: { news_summaries: unknown[] }) => !n.news_summaries?.length)
    .sort((a: { news_links: unknown[] }, b: { news_links: unknown[] }) => (b.news_links?.length ?? 0) - (a.news_links?.length ?? 0))
    .slice(0, SUMMARY_MAX_PER_RUN);

  let summarised = 0;
  let aiStop: string | null = null;
  for (let i = 0; i < todo.length && !aiStop; i += SUMMARY_BATCH) {
    const batch = todo.slice(i, i + SUMMARY_BATCH);
    const user = batch
      .map((n: { id: number; title: string; teaser: string | null; source: string; lang: string | null }) =>
        JSON.stringify({ id: n.id, sprache: n.lang ?? 'unbekannt', quelle: n.source, titel: n.title, anreisser: n.teaser ?? null }),
      )
      .join('\n');
    const res = await askJson<{ items: { id: number; summary: string; importance: number; headline_only: boolean }[] }>(db, settings.aiBudgetUsdMonth, {
      system: `Du fasst Wirtschafts- und Börsenmeldungen für einen privaten Tagesüberblick zusammen.
Für jede Meldung: summary = 1 bis 2 kurze Sätze (höchstens 280 Zeichen), importance = 1 bis 5
(5: Zinsentscheide, wichtige Konjunkturdaten, Quartalszahlen großer Unternehmen, Übernahmen, Regulierung;
1: Meinungsstücke, Werbung, Wiederholungen, Ratgeber).
${RULES}`,
      user: `Meldungen (eine JSON-Zeile pro Meldung):\n${user}`,
      maxTokens: 3000,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'summary', 'importance', 'headline_only'],
              properties: {
                id: { type: 'integer' },
                summary: { type: 'string' },
                importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
                headline_only: { type: 'boolean' },
              },
            },
          },
        },
      },
    });
    if (!res.ok) {
      aiStop = res.reason;
      break;
    }
    const valid = new Set(batch.map((n: { id: number }) => n.id));
    const summaries = res.data.items
      .filter((s) => valid.has(s.id) && s.summary.trim())
      .map((s) => ({
        item_id: s.id,
        summary: s.summary.trim().slice(0, 700),
        importance: Math.min(5, Math.max(1, Math.round(s.importance))),
        headline_only: Boolean(s.headline_only),
        model: 'claude-haiku-5-5',
      }));
    if (summaries.length) await db.from('news_summaries').upsert(summaries, { onConflict: 'item_id', ignoreDuplicates: true });
    summarised += summaries.length;
  }

  // 6. Keep the table small: nothing older than 14 days
  await db.from('news_items').delete().lt('published_at', new Date(now.getTime() - 14 * 86400_000).toISOString());

  return json(200, { candidates: candidates.length, stored: rows.length, summarised, ai: aiStop ?? 'ok', feeds: feedStats });
});
