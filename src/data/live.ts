// Real data for the "Heute" views, read with the owner's login (RLS):
// news, market events and briefings from the "daily" schema; training and "Dein Tag" from the Study App tables.
import { getSettings } from '../lib/settings';
import { buildStudyDay, type Exam } from '../lib/studyday';
import { daily, supabase } from '../lib/supabase';
import { formatTime } from '../lib/format';
import { buildTraining, type FitnessDay } from '../lib/training';
import { isoDate, zonedParts } from '../lib/time';
import { empty, failed, ok, type Block, type DayEntry, type MarketEvent, type NewsItem, type Training } from './types';

const DAY = 86400000;

function todayIso(now: Date): string {
  return isoDate(zonedParts(now, getSettings().timeZone));
}

/** Start of the given day in the user's time zone (± an hour around DST is fine for these queries). */
function dayStart(now: Date, offsetDays = 0): Date {
  const p = zonedParts(now, getSettings().timeZone);
  return new Date(now.getTime() - (p.hour * 60 + p.minute) * 60000 - now.getUTCSeconds() * 1000 + offsetDays * DAY);
}

interface NewsRow {
  id: number;
  title: string;
  url: string;
  source: string;
  teaser: string | null;
  published_at: string;
  topics: string[];
  official: boolean;
  news_summaries: { summary: string; importance: number; headline_only: boolean }[] | null;
  news_links: { position_id: string }[] | null;
}

export interface LiveNews extends NewsItem {
  importance: number | null;
  official: boolean;
  topics: string[];
}

export async function loadNews(sinceIso: string, limit = 200): Promise<Block<LiveNews[]>> {
  const { data, error } = await daily()
    .from('news_items')
    .select('id,title,url,source,teaser,published_at,topics,official,news_summaries(summary,importance,headline_only),news_links(position_id)')
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) return failed('Meldungen gerade nicht verfügbar.');
  return ok(
    (data as NewsRow[]).map((r) => {
      const s = r.news_summaries?.[0];
      return {
        id: String(r.id),
        topic: r.topics[0] ?? (r.official ? 'Notenbanken' : 'Markt'),
        topics: r.topics,
        positions: r.news_links?.length ?? 0,
        title: r.title,
        summary: s?.summary ?? r.teaser ?? '',
        headlineOnly: s?.headline_only ?? !r.teaser,
        source: r.source,
        publishedAt: new Date(r.published_at),
        url: r.url,
        importance: s?.importance ?? null,
        official: r.official,
      };
    }),
  );
}

export type WrapKind = 'morning' | 'afternoon' | 'evening';

export interface LiveWrap {
  kind: WrapKind;
  day: string; // YYYY-MM-DD
  createdAt: Date;
  headline: string;
  sections: { title: string; text: string; sources: { name: string; url: string }[] }[];
}

/**
 * The AI market overview ("Marktüberblick") of a briefing: of the given kind today, or the newest one there is.
 * Empty (and the card stays hidden) if none was written yet or the AI was unavailable.
 */
export async function loadWrap(now: Date, kind?: WrapKind): Promise<Block<LiveWrap>> {
  let q = daily().from('briefings').select('kind,day,created_at,content').order('created_at', { ascending: false }).limit(kind ? 1 : 6);
  if (kind) q = q.eq('kind', kind).eq('day', todayIso(now));
  const { data, error } = await q;
  if (error) return failed('Marktüberblick gerade nicht verfügbar.');
  for (const row of (data ?? []) as { kind: WrapKind; day: string; created_at: string; content: { wrap?: { headline: string; sections: LiveWrap['sections'] } | null } }[]) {
    const w = row.content?.wrap;
    if (!w?.headline || !Array.isArray(w.sections) || !w.sections.length) continue;
    return ok({ kind: row.kind, day: row.day, createdAt: new Date(row.created_at), headline: w.headline, sections: w.sections });
  }
  return empty('Noch kein Marktüberblick.');
}

/** Most relevant first: importance, number of positions, then recency. */
export function rankLive(items: LiveNews[]): LiveNews[] {
  return [...items].sort(
    (a, b) =>
      (b.importance ?? 2) - (a.importance ?? 2) || b.positions - a.positions || b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

/** News about the depot (or from central banks), most relevant first. */
async function depotNews(sinceIso: string, max: number): Promise<Block<NewsItem[]>> {
  const b = await loadNews(sinceIso);
  if (b.status !== 'ok') return b;
  const relevant = rankLive(b.data.filter((n) => n.positions > 0 || n.official)).slice(0, max);
  return relevant.length ? ok(relevant) : empty('Noch keine Meldungen zu deinen Themen. Sie werden alle 30 Minuten abgerufen.');
}

async function events(now: Date, offsetDays: number): Promise<Block<MarketEvent[]>> {
  const from = dayStart(now, offsetDays);
  const { data, error } = await daily()
    .from('market_events')
    .select('starts_at,title,importance')
    .gte('starts_at', from.toISOString())
    .lt('starts_at', new Date(from.getTime() + DAY).toISOString())
    .order('starts_at');
  if (error) return failed('Termine gerade nicht verfügbar.');
  const tz = getSettings().timeZone;
  return ok((data ?? []).map((e) => ({ time: formatTime(new Date(e.starts_at as string), tz), title: e.title as string })));
}

interface BriefingContent {
  important: { text: string }[];
  marketNow: { text: string; url: string; ai: boolean } | null;
  drivers: { items: string[]; sourcesUrl: string; ai: boolean } | null;
}

async function briefing(kind: 'morning' | 'afternoon' | 'evening', now: Date): Promise<Block<BriefingContent | null>> {
  const { data, error } = await daily().from('briefings').select('content').eq('kind', kind).eq('day', todayIso(now)).maybeSingle();
  if (error) return failed('Briefing gerade nicht verfügbar.');
  return ok((data?.content as BriefingContent | undefined) ?? null);
}

const NO_BRIEFING: Record<string, string> = {
  morning: 'Das Morgenbriefing wird um 7 Uhr erstellt.',
  afternoon: 'Das Nachmittagsbriefing wird um 13 Uhr erstellt.',
  evening: 'Das Abendbriefing wird nach Handelsschluss erstellt.',
};

async function training(now: Date): Promise<Block<Training>> {
  const today = todayIso(now);
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 120 * DAY).toISOString().slice(0, 10);
  const { data, error } = await supabase().from('fitness_daily').select('date,sessions,minutes,kinds').gte('date', from);
  if (error) return failed('Trainingsdaten gerade nicht verfügbar.');
  return ok(buildTraining((data ?? []) as FitnessDay[], today));
}

async function studyDay(now: Date): Promise<Block<DayEntry[]>> {
  const today = todayIso(now);
  const until = new Date(Date.parse(`${today}T12:00:00Z`) + 14 * DAY).toISOString().slice(0, 10);
  const [snap, ex] = await Promise.all([
    supabase().from('lanis_snapshots').select('kind,data'),
    supabase().from('exams').select('title,date,subjects(name)').gte('date', today).lte('date', until),
  ]);
  if (snap.error && ex.error) return failed('Daten aus der Study App gerade nicht verfügbar.');
  const tt = snap.data?.find((s) => s.kind === 'timetable')?.data ?? null;
  const subs = snap.data?.find((s) => s.kind === 'substitutions')?.data ?? null;
  const exams: Exam[] = (ex.data ?? []).map((e) => {
    const subj = (e as { subjects: { name: string } | { name: string }[] | null }).subjects;
    const name = Array.isArray(subj) ? subj[0]?.name : subj?.name;
    return { title: e.title as string, date: e.date as string, subject: name ?? null };
  });
  const entries = buildStudyDay(tt, subs, exams, today);
  return entries.length ? ok(entries) : empty('Heute nichts aus der Study App: kein Unterricht, keine Fristen in den nächsten 14 Tagen.');
}

export interface LiveMorning {
  news: Block<NewsItem[]>;
  events: Block<MarketEvent[]>;
  important: Block<string[]>;
  training: Block<Training>;
  day: Block<DayEntry[]>;
}

export async function liveMorning(now: Date): Promise<LiveMorning> {
  const [news, ev, br, tr, day] = await Promise.all([
    depotNews(new Date(now.getTime() - DAY).toISOString(), 5),
    events(now, 0),
    briefing('morning', now),
    training(now),
    studyDay(now),
  ]);
  const important: Block<string[]> =
    br.status !== 'ok'
      ? br
      : br.data && br.data.important.length
        ? ok(br.data.important.map((i) => i.text))
        : empty(br.data ? 'Heute nichts Besonderes.' : NO_BRIEFING.morning);
  return { news, events: ev, important, training: tr, day };
}

export async function liveAfternoon(now: Date): Promise<{ marketNow: Block<{ text: string; url: string }> }> {
  const br = await briefing('afternoon', now);
  if (br.status !== 'ok') return { marketNow: br };
  const m = br.data?.marketNow;
  return { marketNow: m ? ok({ text: m.text, url: m.url }) : empty(br.data ? 'Noch keine Meldungen für einen Überblick.' : NO_BRIEFING.afternoon) };
}

export async function liveEvening(now: Date): Promise<{
  news: Block<NewsItem[]>;
  outlook: Block<MarketEvent[]>;
  drivers: Block<{ items: string[]; sourcesUrl: string }>;
  trainingDone: Block<{ label: string; done: boolean }>;
}> {
  const [news, outlook, br, tr] = await Promise.all([
    depotNews(new Date(Math.max(dayStart(now).getTime() + 6 * 3600000, now.getTime() - 12 * 3600000)).toISOString(), 4),
    events(now, 1),
    briefing('evening', now),
    training(now),
  ]);
  const drivers: Block<{ items: string[]; sourcesUrl: string }> =
    br.status !== 'ok' ? br : br.data?.drivers ? ok(br.data.drivers) : empty(br.data ? 'Heute zu wenige Meldungen.' : NO_BRIEFING.evening);
  const trainingDone: Block<{ label: string; done: boolean }> =
    tr.status === 'ok' ? ok({ label: tr.data.dayTitle === 'Heute trainiert' ? `Training erledigt (${tr.data.weekLabel})` : 'Training heute', done: tr.data.dayTitle === 'Heute trainiert' }) : tr;
  return { news, outlook, drivers, trainingDone };
}
