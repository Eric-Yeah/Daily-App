// Turns stored price rows (snapshots, daily closes) into what the views draw. Pure functions, no network.
// A missing price is never estimated: no bar before the first one is made up except the previous close,
// which is a real value, and a symbol without data is left out and reported by the caller.
import type { PricePoint } from './portfolio';
import { isoDate, minutesOfDay, parseHHMM, zonedParts } from './time';

export interface SnapRow {
  symbol: string;
  ts: string; // ISO instant
  price: number;
}

export interface DailyRow {
  symbol: string;
  day: string; // YYYY-MM-DD, exchange-local
  close: number;
}

export interface SeriesPoint {
  minute: number; // minutes since midnight in the display zone
  value: number;
}

export interface Held {
  symbol: string;
  quantity: number;
}

const dayOf = (iso: string, tz: string) => isoDate(zonedParts(new Date(iso), tz));
const byTs = (a: SnapRow, b: SnapRow) => a.ts.localeCompare(b.ts);

export function group<T extends { symbol: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const l = m.get(r.symbol);
    if (l) l.push(r);
    else m.set(r.symbol, [r]);
  }
  return m;
}

/** Last close strictly before `day` (rows sorted ascending by day). */
function closeBefore(rows: DailyRow[], day: string): DailyRow | undefined {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day < day) return rows[i];
  return undefined;
}

/** Monday of the week containing the ISO day. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

export interface PriceInfo {
  price: PricePoint;
  lastDay: string; // day of `last`
  prevDay: string; // day of `prevClose`
}

/**
 * Latest price of one symbol as of `now`: the newest snapshot if it is from a day without a stored close yet,
 * otherwise the latest daily close. Null if there is no previous close to compare with.
 */
export function priceInfo(snaps: SnapRow[], daily: DailyRow[], tz: string, now: Date): PriceInfo | null {
  const today = dayOf(now.toISOString(), tz);
  const closes = daily.filter((r) => r.day <= today).sort((a, b) => a.day.localeCompare(b.day));
  const live = snaps.filter((s) => Date.parse(s.ts) <= now.getTime()).sort(byTs);
  const lastSnap = live.at(-1);
  const lastClose = closes.at(-1);

  let last: number;
  let lastDay: string;
  if (lastSnap && (!lastClose || dayOf(lastSnap.ts, tz) > lastClose.day)) {
    last = lastSnap.price;
    lastDay = dayOf(lastSnap.ts, tz);
  } else if (lastClose) {
    last = lastClose.close;
    lastDay = lastClose.day;
  } else {
    return null;
  }

  const prev = closeBefore(closes, lastDay);
  if (!prev) return null;
  const year = closeBefore(closes, `${lastDay.slice(0, 4)}-01-01`);
  const week = closeBefore(closes, mondayOf(lastDay));
  const month = closeBefore(closes, `${lastDay.slice(0, 7)}-01`);
  return {
    price: {
      last,
      prevClose: prev.close,
      yearStart: year?.close,
      weekStart: week?.close,
      monthStart: month?.close,
    },
    lastDay,
    prevDay: prev.day,
  };
}

interface DayWindow {
  tz: string;
  now: Date;
  start: string; // "09:00"
  end: string; // "17:30"
}

/** Snapshots of the newest session (up to `now`) inside the window, with the local minute. */
function latestSession(snaps: SnapRow[], w: DayWindow): { day: string; rows: (SnapRow & { minute: number })[] } | null {
  const upTo = snaps.filter((s) => Date.parse(s.ts) <= w.now.getTime());
  if (!upTo.length) return null;
  const day = upTo.map((s) => dayOf(s.ts, w.tz)).sort().at(-1)!;
  const from = parseHHMM(w.start);
  const to = parseHHMM(w.end);
  const rows = upTo
    .filter((s) => dayOf(s.ts, w.tz) === day)
    .map((s) => ({ ...s, minute: minutesOfDay(zonedParts(new Date(s.ts), w.tz)) }))
    .filter((s) => s.minute >= from && s.minute <= to)
    .sort(byTs);
  return rows.length ? { day, rows } : null;
}

export interface DepotIntraday {
  day: string;
  prevDay: string;
  prevClose: number;
  points: SeriesPoint[];
  used: number; // positions in the curve
  skipped: number; // positions without data (left out)
}

/**
 * Depot curve of the newest session: sum of quantity × price at each snapshot minute, carrying the last known
 * price forward; before a symbol's first snapshot its previous close counts. Positions without snapshots or
 * without a previous close are left out (and counted in `skipped`).
 */
export function depotIntraday(held: Held[], snaps: SnapRow[], daily: DailyRow[], w: DayWindow): DepotIntraday | null {
  const snapsBy = group(snaps);
  const dailyBy = group(daily);
  const all = held.flatMap((h) => snapsBy.get(h.symbol) ?? []);
  const session = latestSession(all, w);
  if (!session) return null;

  const parts: { quantity: number; prev: number; bars: { minute: number; price: number }[] }[] = [];
  let prevDay = '';
  for (const h of held) {
    const bars = session.rows.filter((r) => r.symbol === h.symbol);
    const closes = (dailyBy.get(h.symbol) ?? []).sort((a, b) => a.day.localeCompare(b.day));
    const prev = closeBefore(closes, session.day);
    if (!bars.length || !prev) continue;
    prevDay = prevDay < prev.day ? prev.day : prevDay;
    parts.push({ quantity: h.quantity, prev: prev.close, bars: bars.map((b) => ({ minute: b.minute, price: b.price })) });
  }
  if (!parts.length) return null;

  const minutes = [...new Set(parts.flatMap((p) => p.bars.map((b) => b.minute)))].sort((a, b) => a - b);
  const points = minutes.map((minute) => ({
    minute,
    value: parts.reduce((sum, p) => {
      const known = p.bars.filter((b) => b.minute <= minute).at(-1);
      return sum + p.quantity * (known?.price ?? p.prev);
    }, 0),
  }));
  return {
    day: session.day,
    prevDay,
    prevClose: parts.reduce((s, p) => s + p.quantity * p.prev, 0),
    points,
    used: parts.length,
    skipped: held.length - parts.length,
  };
}

export interface IndexCurve {
  prevClose: number; // always 100
  changePct: number;
  points: SeriesPoint[]; // rebased to 100
}

/** Curve of one index for the newest session in the window, rebased so the previous close is 100. */
export function indexCurve(snaps: SnapRow[], daily: DailyRow[], w: DayWindow): IndexCurve | null {
  const session = latestSession(snaps, w);
  if (!session) return null;
  const prev = closeBefore([...daily].sort((a, b) => a.day.localeCompare(b.day)), session.day);
  if (!prev) return null;
  const points = session.rows.map((r) => ({ minute: r.minute, value: (r.price / prev.close) * 100 }));
  return { prevClose: 100, changePct: (points.at(-1)?.value ?? 100) - 100, points };
}

export interface DepotDay {
  day: string;
  value: number;
}

/** Daily depot values (closes, carried forward over gaps) for the last `n` days on which every symbol has a close. */
export function depotHistory(held: Held[], daily: DailyRow[], n: number, upToDay: string): DepotDay[] {
  if (!held.length) return [];
  const dailyBy = group(daily.filter((r) => r.day <= upToDay));
  const lists = held.map((h) => ({ h, rows: (dailyBy.get(h.symbol) ?? []).sort((a, b) => a.day.localeCompare(b.day)) }));
  if (lists.some((l) => !l.rows.length)) return [];
  const days = [...new Set(lists.flatMap((l) => l.rows.map((r) => r.day)))].sort();
  const firstAll = lists.map((l) => l.rows[0].day).sort().at(-1)!;
  return days
    .filter((d) => d >= firstAll)
    .map((day) => ({
      day,
      value: lists.reduce((sum, l) => sum + l.h.quantity * l.rows.filter((r) => r.day <= day).at(-1)!.close, 0),
    }))
    .slice(-n);
}
