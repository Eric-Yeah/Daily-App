// Training card from the daily summaries Overload already sends to the Study App (public.fitness_daily).
// Only completed training; Overload's plan is not shared.
import type { Training } from '../data/types';

export interface FitnessDay {
  date: string; // YYYY-MM-DD
  sessions: number;
  minutes: number;
  kinds: string[];
}

const KIND_LABEL: Record<string, string> = { gym: 'Gym', run: 'Lauf', other: 'Sport' };
const WEEKDAY_SHORT = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const DAY = 86400000;
const toMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday */
const weekdayOf = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;
const mondayOf = (iso: string) => toIso(toMs(iso) - weekdayOf(iso) * DAY);

export function kindLabel(kinds: string[]): string {
  const labels = [...new Set(kinds.map((k) => KIND_LABEL[k] ?? 'Sport'))];
  return labels.length ? labels.join(' + ') : 'Training';
}

export const OVERLOAD_URL = 'https://eric-yeah.github.io/overload/';

export function buildTraining(rows: FitnessDay[], today: string): Training {
  const byDate = new Map(rows.filter((r) => r.sessions > 0).map((r) => [r.date, r]));
  const monday = mondayOf(today);
  const sessionsBetween = (from: string, to: string) =>
    [...byDate.values()].filter((r) => r.date >= from && r.date <= to).reduce((s, r) => s + r.sessions, 0);

  const thisWeek = sessionsBetween(monday, today);
  const lastMonday = toIso(toMs(monday) - 7 * DAY);
  const lastWeek = sessionsBetween(lastMonday, toIso(toMs(monday) - DAY));

  // Streak: whole weeks in a row with at least one session (the current week counts once it has one).
  let streak = 0;
  let wk = thisWeek > 0 ? monday : lastMonday;
  for (let i = 0; i < 104; i++) {
    if (sessionsBetween(wk, toIso(toMs(wk) + 6 * DAY)) === 0) break;
    streak++;
    wk = toIso(toMs(wk) - 7 * DAY);
  }

  const last = [...byDate.values()].filter((r) => r.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const todayRow = byDate.get(today);

  const week = WEEKDAY_SHORT.map((label, i) => {
    const date = toIso(toMs(monday) + i * DAY);
    const row = byDate.get(date);
    const state = row ? 'today' : date === today ? 'planned' : 'free';
    return { label, plan: row ? kindLabel(row.kinds) : '', state } as Training['week'][number];
  });

  const lastDay = last ? (last.date === today ? 'heute' : last.date === toIso(toMs(today) - DAY) ? 'gestern' : WEEKDAY_LONG[weekdayOf(last.date)]) : '';
  return {
    dayTitle: todayRow ? 'Heute trainiert' : rows.length ? 'Heute noch frei' : 'Noch keine Daten',
    weekLabel: todayRow
      ? `${kindLabel(todayRow.kinds)} · ${todayRow.minutes} Min.`
      : last
        ? `zuletzt ${kindLabel(last.kinds)} · ${lastDay}`
        : 'Verbinde Overload mit der Study App',
    lastWeekValue: `${lastWeek} ${lastWeek === 1 ? 'Einheit' : 'Einheiten'}`,
    lastWeekLabel: 'letzte Woche',
    week,
    streakWeeks: streak,
    thisWeek: { done: thisWeek, planned: null },
    last: last ? { name: kindLabel(last.kinds), day: lastDay } : null,
    url: OVERLOAD_URL,
  };
}
