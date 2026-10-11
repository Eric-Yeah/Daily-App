// Daily App – Edge Function "daily-briefing" (Deno).
// - cron (x-daily-cron, every 15 minutes): creates the morning / afternoon / evening briefing once per day at
//   the push time (or a default time) and sends the push ("Dein Morgenbriefing ist fertig", never numbers).
// - { op: "key" }: public VAPID key for the app (creates the key pair on first use).
// - { op: "test" } with the owner's login: sends a test notification to the owner's devices.
// Deploy: npx supabase functions deploy daily-briefing --no-verify-jwt --use-api --project-ref <ref>
import { admin, adminPublic, isCron, json, CORS, ownerFromRequest, ownerId, ownerSettings } from '../_shared/admin.ts';
import { askJson, RULES, searchWeb } from '../_shared/ai.ts';
import { hhmm, hhmmToMinutes, isoDay, minuteOfDay, parts } from '../_shared/berlin.ts';
import {
  DEFAULT_TIMES,
  PUSH_TEXT,
  headlineDrivers,
  headlineMarketNow,
  importantItems,
  rankNews,
  type BriefingContent,
  type BriefingKind,
  type ExamInput,
  type NewsInput,
} from '../_shared/briefing.ts';
import { sendPush, vapidKeys } from '../_shared/push.ts';
import {
  indexMoves,
  isLong,
  parsePlan,
  parseWrap,
  PLAN_SCHEMA,
  planSystem,
  SECTION_SCHEMA,
  sectionSources,
  sectionSystem,
  sectionUser,
  WRAP_SCHEMA,
  wrapSystem,
  wrapUser,
  type MarketWrap,
} from '../_shared/wrap.ts';

const KINDS: BriefingKind[] = ['morning', 'afternoon', 'evening'];
const INDEX_NAMES: Record<string, string> = { '^GDAXI': 'DAX', '^STOXX50E': 'Euro Stoxx 50', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100' };
// The paid web search in the morning overview is switched off: in a test it found little the news feeds did not already
// have (Reuters, AP and others block the search crawler). Set to true to use it again (about 0.30 USD a month).
const WEB_SEARCH_ENABLED = false;
const KIND_LABEL: Record<BriefingKind, string> = { morning: 'Morgen', afternoon: 'Mittag', evening: 'Abend' };
const APP_URL = 'https://eric-yeah.github.io/Daily-App/#/heute';

type Db = ReturnType<typeof admin>;

async function loadNews(db: Db, sinceIso: string): Promise<NewsInput[]> {
  const { data } = await db
    .from('news_items')
    .select('id, title, url, source, teaser, published_at, official, news_summaries(summary, importance), news_links(position_id)')
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(300);
  return (data ?? []).map((n: Record<string, unknown>) => {
    const s = (n.news_summaries as { summary: string; importance: number }[] | null)?.[0];
    return {
      id: n.id as number,
      title: n.title as string,
      url: n.url as string,
      source: n.source as string,
      importance: s?.importance ?? null,
      // The AI summary if there is one, else the source's own teaser, so the overview has material for every item.
      summary: s?.summary ?? ((n.teaser as string | null) || null),
      positions: (n.news_links as unknown[] | null)?.length ?? 0,
      publishedAt: n.published_at as string,
      official: Boolean(n.official),
    };
  });
}

async function loadExams(userId: string, todayIso: string): Promise<ExamInput[]> {
  const pub = adminPublic();
  const until = new Date(Date.parse(`${todayIso}T12:00:00Z`) + 3 * 86400_000).toISOString().slice(0, 10);
  const { data } = await pub.from('exams').select('title, date, subjects(name)').eq('user_id', userId).gte('date', todayIso).lte('date', until);
  return (data ?? []).map((e: { title: string; date: string; subjects: { name: string } | null }) => {
    const subject = e.subjects?.name;
    const title = subject && !e.title.toLowerCase().includes(subject.toLowerCase()) ? `${subject}: ${e.title}` : e.title;
    return { title, date: e.date };
  });
}

function aiInput(news: NewsInput[]): string {
  return news
    .map((n) => JSON.stringify({ id: n.id, quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null, betrifft_positionen: n.positions }))
    .join('\n');
}

/** The AI market overview. Null (and the app shows nothing) if there is no key, no budget or too little news. */
async function makeWrap(db: Db, kind: BriefingKind, now: Date, budget: number, tz: string, news: NewsInput[], events: Record<string, unknown>[], debug: string[]) {
  const long = isLong(kind);
  let pool = rankNews(news).slice(0, long ? 70 : 30);
  if (pool.length < 3) return null;
  const from = new Date(now.getTime() - 10 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await db.from('price_daily').select('symbol, day, close').in('symbol', Object.keys(INDEX_NAMES)).gte('day', from);
  const today = isoDay(parts(now, tz));
  const upcoming = events
    .map((e) => ({ at: new Date(e.starts_at as string), title: e.title as string }))
    .filter((e) => e.at.getTime() >= now.getTime() - 3600_000 && e.at.getTime() < now.getTime() + 36 * 3600_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((e) => ({ title: e.title, time: `${isoDay(parts(e.at, tz)) === today ? 'heute' : 'morgen'} ${hhmm(e.at, tz)} Uhr` }));
  const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'long' }).format(now);

  // Morning only: one web search for what happened overnight (the one paid search per day, about 30 cents a month).
  if (kind === 'morning' && WEB_SEARCH_ENABLED) {
    const web = await searchWeb(db, budget, {
      system: `Du recherchierst für einen Morgenüberblick der Märkte. Suche genau einmal nach den wichtigsten Börsen- und Wirtschaftsmeldungen der letzten Nacht (Schluss der US-Börsen, Asien, Notenbanken, Rohstoffe), am liebsten von Nachrichtenagenturen wie Reuters, AP oder Bloomberg.
Gib danach 4 bis 6 Stichpunkte auf Deutsch mit den wichtigsten Fakten wieder, jeder Stichpunkt mit einer Quelle. Nur was in den Suchergebnissen steht, nichts ergänzen, keine Prognosen, keine Anlageempfehlung. Zahlen nur, wenn sie in den Ergebnissen stehen.`,
      user: `Heute ist ${weekday}, ${today}. Suchvorschlag: "stock markets overnight Asia Wall Street close oil Fed ${today}"`,
      maxUses: 1,
      maxTokens: 1200,
      // Only established news and finance sites, no blogs.
      // Reuters, AP, FT and others block the search crawler; the helper drops blocked domains automatically.
      allowedDomains: ['reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'marketwatch.com', 'bbc.com', 'theguardian.com', 'finance.yahoo.com', 'investing.com', 'tagesschau.de', 'handelsblatt.com'],
    });
    debug.push(web.ok ? `web: ${web.searches} searches, ${web.hits.length} hits${web.error ? `, ${web.error}` : ''}` : `web: ${web.reason}${web.error ? ` ${web.error.slice(0, 120)}` : ''}`);
    if (web.ok) {
      const items: NewsInput[] = web.hits.slice(0, 6).filter((h) => URL.canParse(h.url)).map((h, i) => ({
        id: 100_000 + i,
        title: h.title.slice(0, 300),
        url: h.url,
        source: new URL(h.url).hostname.replace(/^www\./, '').slice(0, 100),
        importance: null,
        summary: h.text.slice(0, 600),
        positions: 0,
        publishedAt: now.toISOString(),
        official: false,
      }));
      pool = [...pool, ...items];
    }
  }

  const indices = indexMoves((rows ?? []) as { symbol: string; day: string; close: number }[], INDEX_NAMES);
  const dayLabel = `${weekday}, ${today}, ${KIND_LABEL[kind]}`;
  const input = wrapUser({ dayLabel, indices, events: upcoming, news: pool });

  if (!long) {
    const res = await askJson<unknown>(db, budget, {
      system: wrapSystem(kind, RULES),
      user: input,
      maxTokens: 2800,
      schema: WRAP_SCHEMA as unknown as Record<string, unknown>,
    });
    return res.ok ? parseWrap(res.data, pool, false) : null;
  }

  // Long overview: plan the topics, then write each topic in its own short call (in parallel).
  const planRes = await askJson<unknown>(db, budget, {
    system: planSystem(kind, RULES),
    user: input,
    maxTokens: 1500,
    schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
  });
  const plan = planRes.ok ? parsePlan(planRes.data, pool) : null;
  if (!plan) return null;
  // Few topics chosen: add the best news the plan left out as one more section, so the read is not cut short.
  if (plan.topics.length < 6) {
    const used = new Set(plan.topics.flatMap((t) => t.items.map((n) => n.id)));
    const rest = pool.filter((n) => !used.has(n.id)).slice(0, 8);
    if (rest.length >= 4) plan.topics.push({ title: 'Weitere Meldungen', items: rest });
  }
  const written = await Promise.all(
    plan.topics.map((t) =>
      askJson<{ text: string }>(db, budget, {
        system: sectionSystem(RULES),
        user: sectionUser({ dayLabel, title: t.title, indices: /markt|index|börse|aktien|dax/i.test(t.title) ? indices : [], items: t.items }),
        maxTokens: 900,
        schema: SECTION_SCHEMA as unknown as Record<string, unknown>,
      }),
    ),
  );
  const sections = plan.topics.flatMap((t, i) => {
    const r = written[i];
    const text = r.ok ? r.data.text?.trim().slice(0, 1800) : '';
    return text ? [{ title: t.title, text, sources: sectionSources(t.items) }] : [];
  });
  if (!sections.length) return null;
  const wrap: MarketWrap = { headline: plan.headline, points: plan.points, sections, ai: true };
  return wrap;
}

async function generate(db: Db, kind: BriefingKind, now: Date, userId: string, budget: number, tz: string, debug: string[]): Promise<BriefingContent> {
  const today = isoDay(parts(now, tz));
  const morningStart = new Date(now.getTime() - (minuteOfDay(parts(now, tz)) - 6 * 60) * 60_000); // 06:00 today
  const since = kind === 'morning' ? new Date(now.getTime() - 16 * 3600_000) : morningStart;
  const news = await loadNews(db, since.toISOString());
  const dayStart = new Date(now.getTime() - minuteOfDay(parts(now, tz)) * 60_000 - 60 * 60_000);
  const { data: events } = await db
    .from('market_events')
    .select('starts_at, title, importance, source_url')
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', new Date(dayStart.getTime() + 2 * 86400_000).toISOString());

  const content: BriefingContent = {
    version: 1,
    kind,
    day: today,
    generatedAt: now.toISOString(),
    important: importantItems(
      now,
      (events ?? []).map((e: Record<string, unknown>) => ({ startsAt: e.starts_at as string, title: e.title as string, importance: e.importance as number, sourceUrl: e.source_url as string | null })),
      news,
      await loadExams(userId, today),
      tz,
    ),
    marketNow: null,
    drivers: null,
  };

  const top = rankNews(news).slice(0, 8);
  content.wrap = await makeWrap(db, kind, now, budget, tz, news, (events ?? []) as Record<string, unknown>[], debug);
  const wrap = content.wrap;
  // "Was bewegt den Markt gerade" and "Treiber des Tages" come from the same AI call as the overview (one call, not three).
  if (kind === 'afternoon' && top.length) {
    const url = wrap?.sections.flatMap((s) => s.sources).find((src) => src.url)?.url;
    content.marketNow = wrap?.points.length && url ? { text: wrap.points.slice(0, 2).join(' '), url, ai: true } : headlineMarketNow(top);
  }
  if (kind === 'evening' && top.length) {
    content.drivers = wrap?.points.length ? { items: wrap.points, sourcesUrl: '#/news', ai: true } : headlineDrivers(top);
  }
  return content;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  const body = (await req.json().catch(() => ({}))) as { op?: string; kind?: BriefingKind };

  if (body.op === 'key') return json(200, { publicKey: (await vapidKeys(db)).publicKey });

  if (body.op === 'test') {
    const userId = await ownerFromRequest(req, db);
    if (!userId) return json(401, { error: 'unauthorized' });
    const r = await sendPush(db, { title: 'Daily', body: 'Test: Benachrichtigungen funktionieren.', url: APP_URL, tag: 'test' }, userId);
    return json(200, r);
  }

  if (!(await isCron(req, db))) return json(401, { error: 'unauthorized' });
  const owner = await ownerId(db);
  if (!owner) return json(200, { skipped: 'no owner' });
  const settings = await ownerSettings(db, owner);
  const now = new Date();
  const p = parts(now, settings.timeZone);
  const today = isoDay(p);
  const minute = minuteOfDay(p);
  const done: string[] = [];

  for (const kind of body.op === 'generate' && body.kind ? [body.kind] : KINDS) {
    const pushAt = settings.push[kind];
    const at = hhmmToMinutes(pushAt ?? DEFAULT_TIMES[kind]);
    const force = body.op === 'generate';
    if (!force && minute < at) continue;

    const { data: existing } = await db.from('briefings').select('pushed_at').eq('kind', kind).eq('day', today).maybeSingle();
    if (!existing || force) {
      const content = await generate(db, kind, now, owner, settings.aiBudgetUsdMonth, settings.timeZone, done);
      await db.from('briefings').upsert({ kind, day: today, content, created_at: now.toISOString(), pushed_at: existing?.pushed_at ?? null });
      done.push(`${kind}:created`);
    }
    // Push once, and only close to the chosen time (not hours later after an outage).
    if (pushAt && !existing?.pushed_at && minute - at <= 45 && !force) {
      await sendPush(db, { title: 'Daily', body: PUSH_TEXT[kind], url: APP_URL, tag: kind }, owner);
      await db.from('briefings').update({ pushed_at: new Date().toISOString() }).eq('kind', kind).eq('day', today);
      done.push(`${kind}:pushed`);
    }
  }
  return json(200, { done });
});
