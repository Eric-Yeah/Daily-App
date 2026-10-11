// Daily App – Edge Function "daily-news" (Deno).
// Fetches news from fixed, publicly offered feeds plus a GDELT search per depot topic, stores only
// title, teaser, link, source and time, links them to the positions by topic and summarises new ones
// with Claude Haiku 5.5 (within the monthly budget). Depot-related and official items are summarised
// first; general market news gets only a few summaries per run so the budget lasts.
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

// Publicly offered RSS feeds (business sections). Only headline, teaser and link are used; the article stays at the source.
// All items are stored; the ones that match a depot topic are linked to the positions ("betrifft N Positionen").
const FEEDS: Feed[] = [
  { id: 'rss:tagesschau-wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:tagesschau-finanzen', url: 'https://www.tagesschau.de/wirtschaft/finanzen/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:tagesschau-unternehmen', url: 'https://www.tagesschau.de/wirtschaft/unternehmen/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:tagesschau-welt', url: 'https://www.tagesschau.de/wirtschaft/weltwirtschaft/index~rss2.xml', source: 'tagesschau.de', lang: 'de', official: false },
  { id: 'rss:handelsblatt-finanzen', url: 'https://www.handelsblatt.com/contentexport/feed/finanzen', source: 'Handelsblatt', lang: 'de', official: false },
  { id: 'rss:handelsblatt-unternehmen', url: 'https://www.handelsblatt.com/contentexport/feed/unternehmen', source: 'Handelsblatt', lang: 'de', official: false },
  { id: 'rss:faz-finanzen', url: 'https://www.faz.net/rss/aktuell/finanzen/', source: 'FAZ', lang: 'de', official: false },
  { id: 'rss:spiegel-wirtschaft', url: 'https://www.spiegel.de/wirtschaft/index.rss', source: 'DER SPIEGEL', lang: 'de', official: false },
  { id: 'rss:zeit-wirtschaft', url: 'https://newsfeed.zeit.de/wirtschaft/index', source: 'ZEIT ONLINE', lang: 'de', official: false },
  { id: 'rss:ntv-wirtschaft', url: 'https://www.n-tv.de/wirtschaft/rss', source: 'n-tv', lang: 'de', official: false },
  { id: 'rss:cnbc-markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  { id: 'rss:cnbc-economy', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  { id: 'rss:cnbc-top', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  { id: 'rss:cnbc-tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', source: 'CNBC', lang: 'en', official: false },
  { id: 'rss:marketwatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', lang: 'en', official: false },
  { id: 'rss:bbc-business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC News', lang: 'en', official: false },
  { id: 'rss:guardian-business', url: 'https://www.theguardian.com/uk/business/rss', source: 'The Guardian', lang: 'en', official: false },
  { id: 'rss:ecb', url: 'https://www.ecb.europa.eu/rss/press.html', source: 'EZB', lang: 'en', official: true },
  { id: 'rss:fed', url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Federal Reserve', lang: 'en', official: true },
  { id: 'rss:boe', url: 'https://www.bankofengland.co.uk/rss/news', source: 'Bank of England', lang: 'en', official: true },
  { id: 'rss:bundesbank', url: 'https://www.bundesbank.de/service/rss/de/633286/feed.rss', source: 'Bundesbank', lang: 'de', official: true },
];

const UA = 'DailyApp/1.0 (+https://eric-yeah.github.io/Daily-App/)';
const MAX_AGE_H = 48;
const GDELT_TOPICS = 4;
const MAX_PER_FEED = 25;
const SUMMARY_BATCH = 10;
const SUMMARY_MAX_PER_RUN = 30;
// Items without a depot topic (general market news) get only a few summaries per run to protect the budget.
const SUMMARY_GENERAL_PER_RUN = 6;

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
  const stats: Record<string, number | string> = {};
  const feedTexts = await Promise.all(FEEDS.map((f) => fetchText(f.url)));
  FEEDS.forEach((f, i) => {
    const text = feedTexts[i];
    if (!text) {
      stats[f.id] = 'unreachable';
      return;
    }
    let n = 0;
    const fresh = parseFeed(text)
      .filter((item) => item.publishedAt && item.publishedAt.getTime() >= minDate)
      .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
      .slice(0, MAX_PER_FEED);
    for (const item of fresh) {
      const found = matchTopics(`${item.title} ${item.teaser ?? ''}`, topics);
      candidates.push({ ...item, source: f.source, lang: f.lang, feed: f.id, official: f.official, topics: found });
      n++;
    }
    stats[f.id] = n;
  });

  // 2. GDELT search for the most widely held topics (rate limit: one request every 5 seconds)
  for (const [i, topic] of topTopics(idx, GDELT_TOPICS).entries()) {
    if (i > 0) await sleep(5500);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gdeltQuery(topic))}&mode=artlist&maxrecords=8&timespan=24h&sort=datedesc&format=json`;
    const text = await fetchText(url);
    if (!text) {
      stats[`gdelt:${topic}`] = 'unreachable';
      continue;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      stats[`gdelt:${topic}`] = 'no json';
      continue;
    }
    stats[`gdelt:${topic}`] = 0;
    for (const a of parseGdelt(parsed)) {
      if (!a.publishedAt || a.publishedAt.getTime() < minDate) continue;
      const found = matchTopics(a.title, topics);
      candidates.push({ ...a, feed: 'gdelt', official: false, topics: found.length ? found : [topic] });
      stats[`gdelt:${topic}`] = Number(stats[`gdelt:${topic}`]) + 1;
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
  // Insert per chunk and, if a chunk fails (e.g. one row breaks a table limit), row by row, so one bad item never blocks the rest.
  let storeErrors = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await db.from('news_items').upsert(chunk, { onConflict: 'url', ignoreDuplicates: true });
    if (!error) continue;
    console.error('news_items upsert failed', error.message);
    for (const row of chunk) {
      const one = await db.from('news_items').upsert(row, { onConflict: 'url', ignoreDuplicates: true });
      if (one.error) storeErrors++;
    }
  }

  // 4. Link recent news to positions (recomputed, so changed topics are picked up too)
  const { data: recent } = await db
    .from('news_items')
    .select('id, title, teaser, topics')
    .gte('published_at', new Date(minDate).toISOString())
    .limit(1000);
  const links = (recent ?? []).flatMap((s: { id: number; title: string; teaser: string | null; topics: string[] }) => {
    const found = new Set([...s.topics, ...matchTopics(`${s.title} ${s.teaser ?? ''}`, topics)]);
    const ids = new Set([...found].flatMap((t) => idx.get(t) ?? []));
    return [...ids].map((position_id) => ({ item_id: s.id, position_id }));
  });
  if (links.length) {
    const { error } = await db.from('news_links').upsert(links, { onConflict: 'item_id,position_id', ignoreDuplicates: true });
    if (error) console.error('news_links upsert failed', error.message);
  }

  // 5. Summaries for new items (most relevant first), within the budget
  const { data: open } = await db
    .from('news_items')
    .select('id, title, teaser, source, lang, published_at, official, news_summaries(item_id), news_links(position_id)')
    .gte('published_at', new Date(minDate).toISOString())
    .order('published_at', { ascending: false })
    .limit(500);
  type Open = { id: number; title: string; teaser: string | null; source: string; lang: string | null; official: boolean; news_summaries: unknown[]; news_links: unknown[] };
  const unsummarised = ((open ?? []) as Open[])
    .filter((n) => !n.news_summaries?.length)
    .sort((a, b) => (b.news_links?.length ?? 0) - (a.news_links?.length ?? 0) || Number(b.official) - Number(a.official));
  const related = unsummarised.filter((n) => n.official || n.news_links?.length);
  const general = unsummarised.filter((n) => !(n.official || n.news_links?.length)).slice(0, SUMMARY_GENERAL_PER_RUN);
  const todo = [...related, ...general].slice(0, SUMMARY_MAX_PER_RUN);

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

  return json(200, { candidates: candidates.length, stored: rows.length, storeErrors, summarised, ai: aiStop ?? 'ok', feeds: stats });
});
