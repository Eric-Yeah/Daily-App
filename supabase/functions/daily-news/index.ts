// Daily App – Edge Function "daily-news" (Deno).
// Fetches news from fixed, publicly offered feeds, stores only
// title, teaser, link, source and time, links them to the positions by topic and summarises new ones
// with Claude Haiku 5.5 (within the monthly budget). Depot-related and official items are summarised
// first; general market news gets only a few summaries per run so the budget lasts.
// From 10:30 until 23:00 (Berlin) it also writes the live blog from new, important items.
//
// Called by pg_cron every 30 minutes with the secret header x-daily-cron (see migration 0005).
// Deploy: npx supabase functions deploy daily-news --no-verify-jwt --use-api --project-ref <ref>
import { admin, isCron, json, CORS, ownerId, ownerSettings } from '../_shared/admin.ts';
import { askJson, RULES } from '../_shared/ai.ts';
import type { NewsInput } from '../_shared/briefing.ts';
import { isoDay, parts } from '../_shared/berlin.ts';
import { LIVE_BLOG_ENABLED, LIVE_SCHEMA, liveBlogActive, liveCandidates, liveSystem, liveUser, parseLive } from '../_shared/liveblog.ts';
import { isNoise } from '../_shared/newsNoise.ts';
import { matchTopics, topicIndex } from '../_shared/newsTopics.ts';
import { indexMoves } from '../_shared/wrap.ts';
import { parseFeed, type FeedItem } from '../_shared/rss.ts';
import { pickForSummary } from '../_shared/summaryPick.ts';

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
const MAX_PER_FEED = 25;
const SUMMARY_BATCH = 15;
const SUMMARY_MAX_PER_RUN = 45;
// Items without a depot topic (general market news) get fewer summaries per run than related ones. Every rated item
// can be judged unimportant and hidden in the app, so most items should get a rating (a batch costs a tenth of a cent).
const SUMMARY_GENERAL_PER_RUN = 24;

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

const LIVE_INDEX = { '^GDAXI': 'DAX', '^STOXX50E': 'Euro Stoxx 50', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100' } as const;

/** Current index moves (latest snapshot vs. the close before), only if the snapshot is fresh (during trading). */
async function liveIndices(db: ReturnType<typeof admin>, now: Date, today: string): Promise<{ name: string; changePct: number }[]> {
  const symbols = Object.keys(LIVE_INDEX);
  const [snaps, closes] = await Promise.all([
    db.from('price_snapshots').select('symbol, ts, price').in('symbol', symbols).gte('ts', new Date(now.getTime() - 45 * 60_000).toISOString()).order('ts', { ascending: false }).limit(40),
    db.from('price_daily').select('symbol, day, close').in('symbol', symbols).lt('day', today).gte('day', new Date(now.getTime() - 10 * 86400_000).toISOString().slice(0, 10)),
  ]);
  const prev = indexMoves((closes.data ?? []) as { symbol: string; day: string; close: number }[], LIVE_INDEX);
  const out: { name: string; changePct: number }[] = [];
  for (const [symbol, name] of Object.entries(LIVE_INDEX)) {
    const last = (snaps.data ?? []).find((r: { symbol: string }) => r.symbol === symbol) as { price: number | string } | undefined;
    const base = prev.find((p) => p.name === name);
    if (last && base) out.push({ name, changePct: ((Number(last.price) - base.close) / base.close) * 100 });
  }
  return out;
}

/** Writes new live-blog entries for important news not covered yet. Returns a short status for the response. */
async function liveBlog(db: ReturnType<typeof admin>, now: Date, budget: number, windowHours: number): Promise<string> {
  const today = isoDay(parts(now));
  const { data: entries } = await db.from('liveblog_entries').select('headline, item_ids').eq('day', today).order('created_at', { ascending: false }).limit(60);
  const covered = new Set<number>((entries ?? []).flatMap((e: { item_ids: number[] }) => e.item_ids));
  const reported = (entries ?? []).slice(0, 6).map((e: { headline: string }) => e.headline);

  const { data } = await db
    .from('news_items')
    .select('id, title, url, source, teaser, published_at, official, news_summaries(summary, importance), news_links(position_id)')
    // Items this run (or the run before) stored; forced test runs can look further back via published_at.
    .or(`fetched_at.gte.${new Date(now.getTime() - 40 * 60_000).toISOString()},published_at.gte.${new Date(now.getTime() - windowHours * 3600_000).toISOString()}`)
    .order('published_at', { ascending: false })
    .limit(300);
  const news: NewsInput[] = (data ?? []).map((n: Record<string, unknown>) => {
    const sum = (n.news_summaries as { summary: string; importance: number }[] | null)?.[0];
    return {
      id: n.id as number,
      title: n.title as string,
      url: n.url as string,
      source: n.source as string,
      importance: sum?.importance ?? null,
      summary: sum?.summary ?? ((n.teaser as string | null) || null),
      positions: (n.news_links as unknown[] | null)?.length ?? 0,
      publishedAt: n.published_at as string,
      official: Boolean(n.official),
    };
  });
  const offered = liveCandidates(news, covered);
  if (!offered.length) return 'nothing new';

  const res = await askJson<unknown>(db, budget, {
    purpose: 'live',
    system: liveSystem(RULES),
    user: liveUser({
      time: `${String(parts(now).hour).padStart(2, '0')}:${String(parts(now).minute).padStart(2, '0')}`,
      indices: await liveIndices(db, now, today),
      reported,
      news: offered,
    }),
    maxTokens: 1500,
    schema: LIVE_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!res.ok) return `ai ${res.reason}`;
  const fresh = parseLive(res.data, offered);
  if (fresh.length) {
    const { error } = await db.from('liveblog_entries').insert(
      fresh.map((e) => ({ day: today, headline: e.headline, body: e.body, importance: e.importance, sources: e.sources, item_ids: e.itemIds })),
    );
    if (error) {
      console.error('liveblog insert failed', error.message);
      return 'insert failed';
    }
  }
  return `${fresh.length} entries`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  if (!(await isCron(req, db))) return json(401, { error: 'unauthorized' });
  const body = (await req.json().catch(() => ({}))) as { force?: boolean; liveHours?: number };

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
      if (isNoise({ title: item.title, url: item.url, official: f.official })) continue;
      const found = matchTopics(`${item.title} ${item.teaser ?? ''}`, topics);
      candidates.push({ ...item, source: f.source, lang: f.lang, feed: f.id, official: f.official, topics: found });
      n++;
    }
    stats[f.id] = n;
  });

  // 2. Store (first source wins for a URL)
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

  // 3. Link recent news to positions (recomputed, so changed topics are picked up too)
  const { data: recent } = await db
    .from('news_items')
    .select('id, title, teaser, topics, news_summaries(summary)')
    .gte('published_at', new Date(minDate).toISOString())
    .limit(1000);
  type Recent = { id: number; title: string; teaser: string | null; topics: string[]; news_summaries: { summary: string }[] | null };
  const links = ((recent ?? []) as Recent[]).flatMap((s) => {
    // Title, teaser and (once there is one) the AI summary: the summary often names the topic the headline only hints at.
    const found = new Set([...s.topics, ...matchTopics(`${s.title} ${s.teaser ?? ''} ${s.news_summaries?.[0]?.summary ?? ''}`, topics)]);
    const ids = new Set([...found].flatMap((t) => idx.get(t) ?? []));
    return [...ids].map((position_id) => ({ item_id: s.id, position_id }));
  });
  if (links.length) {
    const { error } = await db.from('news_links').upsert(links, { onConflict: 'item_id,position_id', ignoreDuplicates: true });
    if (error) console.error('news_links upsert failed', error.message);
  }

  // 4. Summaries for new items (most relevant first), within the budget
  const { data: open } = await db
    .from('news_items')
    .select('id, title, teaser, source, lang, topics, published_at, official, news_links(position_id)')
    .gte('published_at', new Date(minDate).toISOString())
    .order('published_at', { ascending: false })
    .limit(500);
  type Open = { id: number; title: string; teaser: string | null; source: string; lang: string | null; topics: string[]; official: boolean; news_links: unknown[] };
  const openItems = (open ?? []) as Open[];
  // Which of them already have a summary is asked directly. The embedded news_summaries(...) of the query above did
  // not tell reliably: items that were summarised long ago kept coming back and were paid for in every run.
  const { data: done } = openItems.length ? await db.from('news_summaries').select('item_id').in('item_id', openItems.map((n) => n.id)) : { data: [] };
  const haveSummary = new Set<number>(((done ?? []) as { item_id: number }[]).map((r) => r.item_id));
  const todo = pickForSummary(openItems, haveSummary, SUMMARY_GENERAL_PER_RUN, SUMMARY_MAX_PER_RUN);

  let summarised = 0;
  let aiStop: string | null = null;
  const themes = topics.slice(0, 40);
  for (let i = 0; i < todo.length && !aiStop; i += SUMMARY_BATCH) {
    const batch = todo.slice(i, i + SUMMARY_BATCH);
    const user = batch
      .map((n: { id: number; title: string; teaser: string | null; source: string; lang: string | null }) =>
        JSON.stringify({ id: n.id, sprache: n.lang ?? 'unbekannt', quelle: n.source, titel: n.title, anreisser: n.teaser ?? null }),
      )
      .join('\n');
    const res = await askJson<{ items: { id: number; summary: string; importance: number; headline_only: boolean; topics?: string[] }[] }>(db, settings.aiBudgetUsdMonth, {
      purpose: 'summary',
      system: `Du fasst Wirtschafts- und Börsenmeldungen für einen privaten Tagesüberblick zusammen.
Für jede Meldung: summary = 2 bis 3 Sätze (höchstens 450 Zeichen), so ausführlich, wie der gelieferte Text es hergibt, importance = 1 bis 5:
5: Zinsentscheide, wichtige Konjunkturdaten, Quartalszahlen großer Unternehmen, Übernahmen, Regulierung, große Marktbewegungen;
4: klar marktrelevant (Branchen, Rohstoffe, Notenbankreden, Handelspolitik);
3: normale Wirtschaftsmeldung mit Bezug zu Märkten oder Unternehmen;
2: nur am Rand für Anleger interessant (Lokales, Einzelfälle, Verbraucherthemen);
1: kein Nutzen für Anleger (Meinungsstücke, Ratgeber, Werbung, Wiederholungen, Sport, Promis, Vermischtes).
Im Zweifel eher niedriger bewerten: Der Leser will wenig Unwichtiges sehen.
topics = die Themen aus "meine_themen", die in der Meldung wirklich vorkommen oder von ihr deutlich berührt werden (höchstens 3, auch sinngemäß: "Fed senkt Leitzins" gehört zu "Zinsen" und "USA"). Passt keines, eine leere Liste.
${RULES}`,
      user: `${themes.length ? `meine_themen: ${JSON.stringify(themes)}\n` : ''}Meldungen (eine JSON-Zeile pro Meldung):\n${user}`,
      maxTokens: 5500,
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
              required: ['id', 'summary', 'importance', 'headline_only', 'topics'],
              properties: {
                id: { type: 'integer' },
                summary: { type: 'string' },
                importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
                headline_only: { type: 'boolean' },
                topics: { type: 'array', items: themes.length ? { type: 'string', enum: themes } : { type: 'string' } },
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
    if (summaries.length) {
      const { error } = await db.from('news_summaries').upsert(summaries, { onConflict: 'item_id', ignoreDuplicates: true });
      if (error) {
        // Stop here: a failed save means the same items would be sent (and paid for) again in the next batch and run.
        console.error('news_summaries upsert failed', error.message);
        aiStop = 'store failed';
        break;
      }
    }
    summarised += summaries.length;

    // Topics the AI saw in the item (meaning, not only words): store them with the item and link the positions right away.
    for (const s of res.data.items) {
      const item = batch.find((n: { id: number }) => n.id === s.id) as Open | undefined;
      const found = (s.topics ?? []).filter((t) => idx.has(t));
      if (!item || !found.length || !valid.has(s.id)) continue;
      const merged = [...new Set([...item.topics, ...found])];
      if (merged.length === item.topics.length) continue;
      await db.from('news_items').update({ topics: merged }).eq('id', s.id);
      const positionIds = new Set(found.flatMap((t) => idx.get(t) ?? []));
      const { error } = await db.from('news_links').upsert([...positionIds].map((position_id) => ({ item_id: s.id, position_id })), { onConflict: 'item_id,position_id', ignoreDuplicates: true });
      if (error) console.error('news_links (ai topics) upsert failed', error.message);
    }
  }

  // 5. Live blog (from 10:30, Berlin time)
  let live = 'off';
  if (LIVE_BLOG_ENABLED && (body.force || liveBlogActive(hour, parts(now).minute))) live = await liveBlog(db, now, settings.aiBudgetUsdMonth, body.force && body.liveHours ? Math.min(72, body.liveHours) : 0);

  // 6. Keep the tables small: news 14 days, live blog 30 days
  await db.from('news_items').delete().lt('published_at', new Date(now.getTime() - 14 * 86400_000).toISOString());
  await db.from('liveblog_entries').delete().lt('created_at', new Date(now.getTime() - 30 * 86400_000).toISOString());

  return json(200, { candidates: candidates.length, stored: rows.length, storeErrors, withoutSummary: openItems.length - haveSummary.size, summarised, ai: aiStop ?? 'ok', live, feeds: stats });
});
