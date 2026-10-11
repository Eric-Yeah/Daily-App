// Builds the briefing content (pure). The AI sentences are added by the Edge Function.
import { daysBetween, hhmm, isoDay, parts } from './berlin.ts';
import type { MarketWrap } from './wrap.ts';

export type BriefingKind = 'morning' | 'afternoon' | 'evening';

export interface EventInput {
  startsAt: string; // ISO
  title: string;
  importance: number;
  sourceUrl: string | null;
}

export interface NewsInput {
  id: number;
  title: string;
  url: string;
  source: string;
  importance: number | null; // null = not summarised yet
  summary: string | null;
  positions: number;
  publishedAt: string; // ISO
  official: boolean;
}

export interface ExamInput {
  title: string;
  date: string; // YYYY-MM-DD
}

export interface ImportantItem {
  text: string;
  kind: 'event' | 'news' | 'deadline';
  url?: string;
}

export interface BriefingContent {
  version: 1;
  kind: BriefingKind;
  day: string;
  generatedAt: string;
  important: ImportantItem[];
  marketNow: { text: string; url: string; ai: boolean } | null;
  drivers: { items: string[]; sourcesUrl: string; ai: boolean } | null;
  /** AI market overview (added later; absent in older briefings and when the AI was unavailable). */
  wrap?: MarketWrap | null;
}

/** "in 3 Tagen", "morgen", "heute" */
export function inDays(n: number): string {
  if (n <= 0) return 'heute';
  if (n === 1) return 'morgen';
  return `in ${n} Tagen`;
}

/** Relevant news first: importance, then how many positions it concerns, then recency. */
export function rankNews(news: NewsInput[]): NewsInput[] {
  return [...news].sort(
    (a, b) =>
      (b.importance ?? 2) - (a.importance ?? 2) ||
      b.positions - a.positions ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/**
 * "Heute wichtig": up to 3 points. Finance first (important events today, important news about
 * the depot), plus deadlines from the Study App (the only non-finance items allowed here).
 */
export function importantItems(now: Date, events: EventInput[], news: NewsInput[], exams: ExamInput[], timeZone = 'Europe/Berlin'): ImportantItem[] {
  const today = isoDay(parts(now, timeZone));
  const finance: ImportantItem[] = [
    ...events
      .filter((e) => isoDay(parts(new Date(e.startsAt), timeZone)) === today && e.importance >= 4)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((e): ImportantItem => ({ text: `${e.title} um ${hhmm(new Date(e.startsAt), timeZone)} Uhr`, kind: 'event', url: e.sourceUrl ?? undefined })),
    ...rankNews(news.filter((n) => (n.importance ?? 0) >= 4 && (n.positions > 0 || n.official)))
      .slice(0, 2)
      .map((n): ImportantItem => ({ text: n.title, kind: 'news', url: n.url })),
  ];
  const deadlines: ImportantItem[] = exams
    .map((e) => ({ e, d: daysBetween(today, e.date) }))
    .filter(({ d }) => d >= 0 && d <= 3)
    .sort((a, b) => a.d - b.d)
    .map(({ e, d }) => ({ text: `${e.title} ${inDays(d)}`, kind: 'deadline' as const }));

  // Keep at least one deadline if there is one; finance fills the rest.
  const slotsForFinance = deadlines.length ? 2 : 3;
  const pick = [...finance.slice(0, slotsForFinance), ...deadlines];
  return pick.slice(0, 3);
}

/** Fallback without AI: the headlines themselves, clearly not a summary. */
export function headlineDrivers(news: NewsInput[]): { items: string[]; sourcesUrl: string; ai: boolean } | null {
  const top = rankNews(news).slice(0, 3);
  if (!top.length) return null;
  return { items: top.map((n) => `${n.title} (${n.source})`), sourcesUrl: '#/news', ai: false };
}

export function headlineMarketNow(news: NewsInput[]): { text: string; url: string; ai: boolean } | null {
  const top = rankNews(news)[0];
  return top ? { text: `${top.title} (${top.source})`, url: top.url, ai: false } : null;
}

export const PUSH_TEXT: Record<BriefingKind, string> = {
  morning: 'Dein Morgenbriefing ist fertig',
  afternoon: 'Dein Nachmittagsbriefing ist fertig',
  evening: 'Dein Abendbriefing ist fertig',
};

/** Generation time if no push time is set (the app still wants fresh content). */
export const DEFAULT_TIMES: Record<BriefingKind, string> = { morning: '06:30', afternoon: '13:00', evening: '17:40' };
