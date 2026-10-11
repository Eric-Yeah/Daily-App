// Daily App – Edge Function "daily-briefing" (Deno).
// - cron (x-daily-cron, every 15 minutes): creates the morning / afternoon / evening briefing once per day at
//   the push time (or a default time) and sends the push ("Dein Morgenbriefing ist fertig", never numbers).
// - { op: "key" }: public VAPID key for the app (creates the key pair on first use).
// - { op: "test" } with the owner's login: sends a test notification to the owner's devices.
// Deploy: npx supabase functions deploy daily-briefing --no-verify-jwt --use-api --project-ref <ref>
import { admin, adminPublic, isCron, json, CORS, ownerFromRequest, ownerId, ownerSettings } from '../_shared/admin.ts';
import { askJson, RULES } from '../_shared/ai.ts';
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
import { indexMoves, parseWrap, WRAP_SCHEMA, wrapSystem, wrapUser } from '../_shared/wrap.ts';

const KINDS: BriefingKind[] = ['morning', 'afternoon', 'evening'];
const INDEX_NAMES: Record<string, string> = { '^GDAXI': 'DAX', '^STOXX50E': 'Euro Stoxx 50', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100' };
const KIND_LABEL: Record<BriefingKind, string> = { morning: 'Morgen', afternoon: 'Mittag', evening: 'Abend' };
const APP_URL = 'https://eric-yeah.github.io/Daily-App/#/heute';

type Db = ReturnType<typeof admin>;

async function loadNews(db: Db, sinceIso: string): Promise<NewsInput[]> {
  const { data } = await db
    .from('news_items')
    .select('id, title, url, source, published_at, official, news_summaries(summary, importance), news_links(position_id)')
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(150);
  return (data ?? []).map((n: Record<string, unknown>) => {
    const s = (n.news_summaries as { summary: string; importance: number }[] | null)?.[0];
    return {
      id: n.id as number,
      title: n.title as string,
      url: n.url as string,
      source: n.source as string,
      importance: s?.importance ?? null,
      summary: s?.summary ?? null,
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
async function makeWrap(db: Db, kind: BriefingKind, now: Date, budget: number, tz: string, news: NewsInput[], events: Record<string, unknown>[]) {
  const pool = rankNews(news).slice(0, 30);
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
  const res = await askJson<unknown>(db, budget, {
    system: wrapSystem(kind, RULES),
    user: wrapUser({
      dayLabel: `${weekday}, ${today}, ${KIND_LABEL[kind]}`,
      indices: indexMoves((rows ?? []) as { symbol: string; day: string; close: number }[], INDEX_NAMES),
      events: upcoming,
      news: pool,
    }),
    maxTokens: 1800,
    schema: WRAP_SCHEMA as unknown as Record<string, unknown>,
  });
  return res.ok ? parseWrap(res.data, pool) : null;
}

async function generate(db: Db, kind: BriefingKind, now: Date, userId: string, budget: number, tz: string): Promise<BriefingContent> {
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
  content.wrap = await makeWrap(db, kind, now, budget, tz, news, (events ?? []) as Record<string, unknown>[]);
  if (kind === 'afternoon' && top.length) {
    const res = await askJson<{ text: string; source_id: number }>(db, budget, {
      system: `Schreibe auf Deutsch 1 bis 2 kurze Sätze (höchstens 300 Zeichen): Was bewegt die Märkte heute gerade, laut den gelieferten Meldungen?
source_id = id der Meldung, die das am besten belegt.
${RULES}
Ausnahme zur Sprache: Dieser Überblick ist immer auf Deutsch.`,
      user: aiInput(top),
      maxTokens: 800,
      schema: { type: 'object', additionalProperties: false, required: ['text', 'source_id'], properties: { text: { type: 'string' }, source_id: { type: 'integer' } } },
    });
    const src = res.ok ? top.find((n) => n.id === res.data.source_id) : undefined;
    content.marketNow = res.ok && src ? { text: res.data.text.slice(0, 400), url: src.url, ai: true } : headlineMarketNow(top);
  }
  if (kind === 'evening' && top.length) {
    const res = await askJson<{ items: string[] }>(db, budget, {
      system: `Schreibe auf Deutsch genau 3 kurze Sätze (je höchstens 160 Zeichen): die Treiber des heutigen Börsentags laut den gelieferten Meldungen, wichtigster zuerst.
${RULES}
Ausnahme zur Sprache: Dieser Überblick ist immer auf Deutsch.`,
      user: aiInput(top),
      maxTokens: 900,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: { items: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } },
      },
    });
    content.drivers = res.ok && res.data.items.length ? { items: res.data.items.slice(0, 3).map((t) => t.slice(0, 200)), sourcesUrl: '#/news', ai: true } : headlineDrivers(top);
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
      const content = await generate(db, kind, now, owner, settings.aiBudgetUsdMonth, settings.timeZone);
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
