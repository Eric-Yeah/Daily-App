// Time-zone aware helpers: which view to show, market status, countdowns.
// Everything works on "wall clock" parts in the configured time zone (default Europe/Berlin),
// so daylight saving time is handled by Intl, not by us.

export type ViewKey = 'morning' | 'afternoon' | 'evening';

export const DEFAULT_TIME_ZONE = 'Europe/Berlin';
export const XETRA_OPEN = '09:00';
export const DEFAULT_TRADING_END = '17:30';
export const US_OPEN_TZ = 'America/New_York';
export const US_OPEN = '09:30';
export const US_CLOSE = '16:00';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 1 = Monday … 7 = Sunday
  hour: number;
  minute: number;
}

const partFormats = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  let f = partFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partFormats.set(timeZone, f);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => f!.formatToParts(date).find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS[get('weekday')] ?? 1,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

/** "17:30" → 1050 */
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesOfDay(p: ZonedParts): number {
  return p.hour * 60 + p.minute;
}

/** "2026-10-12" in the given zone. */
export function isoDate(p: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Days Xetra is closed on weekdays (official trading calendar). Add the next year around autumn.
 * Easter dates: 2026-04-05 and 2027-03-28; 1 May 2027 and 25/26 Dec 2026 and 2027 fall on weekends.
 */
export const XETRA_HOLIDAYS: readonly string[] = [
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-05-01',
  '2026-12-24',
  '2026-12-25',
  '2026-12-31',
  '2027-01-01',
  '2027-03-26',
  '2027-03-29',
  '2027-12-24',
  '2027-12-31',
];

export interface MarketOptions {
  timeZone: string;
  tradingEnd: string; // "17:30"
  holidays?: readonly string[]; // ISO dates in the market's zone
}

export function isTradingDay(p: ZonedParts, holidays: readonly string[] = XETRA_HOLIDAYS): boolean {
  return p.weekday <= 5 && !holidays.includes(isoDate(p));
}

/** Before 12:00 → morning, 12:00 until trading end → afternoon, afterwards evening. */
export function pickView(date: Date, opts: Pick<MarketOptions, 'timeZone' | 'tradingEnd'>): ViewKey {
  const m = minutesOfDay(zonedParts(date, opts.timeZone));
  if (m < 12 * 60) return 'morning';
  if (m < parseHHMM(opts.tradingEnd)) return 'afternoon';
  return 'evening';
}

export type MarketStatus = 'pre' | 'open' | 'closed' | 'holiday';

/** Xetra status, judged in Europe/Berlin regardless of the user's display zone. */
export function xetraStatus(date: Date, opts: Pick<MarketOptions, 'tradingEnd' | 'holidays'>): MarketStatus {
  const p = zonedParts(date, DEFAULT_TIME_ZONE);
  if (!isTradingDay(p, opts.holidays)) return 'holiday';
  const m = minutesOfDay(p);
  if (m < parseHHMM(XETRA_OPEN)) return 'pre';
  if (m < parseHHMM(opts.tradingEnd)) return 'open';
  return 'closed';
}

/** Minutes from `date` until the wall-clock time `hhmm` today in `timeZone` (negative if passed). */
export function minutesUntil(date: Date, hhmm: string, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return parseHHMM(hhmm) - minutesOfDay(p) - date.getUTCSeconds() / 60;
}

/** Wall-clock time of the US open/close (New York) expressed in `timeZone`, e.g. "15:30" in Berlin. */
export function usSessionInZone(date: Date, timeZone: string): { open: string; close: string } {
  const ny = zonedParts(date, US_OPEN_TZ);
  const local = zonedParts(date, timeZone);
  // Offset between the two zones in minutes, derived from the same instant.
  const offset =
    (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) -
      Date.UTC(ny.year, ny.month - 1, ny.day, ny.hour, ny.minute)) /
    60000;
  const shift = (hhmm: string) => {
    const m = (((parseHHMM(hhmm) + offset) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  return { open: shift(US_OPEN), close: shift(US_CLOSE) };
}

/** Calendar date (noon UTC) for ISO parts, handy for weekday names. */
export function dateFromParts(p: Pick<ZonedParts, 'year' | 'month' | 'day'>): Date {
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
}

/**
 * Last trading day whose close is complete at `date`:
 * today if the session has ended, otherwise the previous trading day.
 */
export function lastClosedTradingDay(date: Date, opts: Pick<MarketOptions, 'tradingEnd' | 'holidays'>): Date {
  const p = zonedParts(date, DEFAULT_TIME_ZONE);
  let d = dateFromParts(p);
  const todayDone = isTradingDay(p, opts.holidays) && minutesOfDay(p) >= parseHHMM(opts.tradingEnd);
  if (todayDone) return d;
  for (let i = 0; i < 14; i++) {
    d = new Date(d.getTime() - 86400000);
    const dp = zonedParts(d, 'UTC');
    if (isTradingDay(dp, opts.holidays)) return d;
  }
  return d;
}

/** Position of a wall-clock time inside a session as 0…1 (clamped). */
export function sessionFraction(minute: number, start: string, end: string): number {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  return Math.min(1, Math.max(0, (minute - s) / (e - s)));
}

/** The trading day before today (e.g. Friday when it is Monday). */
export function previousTradingDay(date: Date, holidays: readonly string[] = []): Date {
  let d = dateFromParts(zonedParts(date, DEFAULT_TIME_ZONE));
  for (let i = 0; i < 14; i++) {
    d = new Date(d.getTime() - 86400000);
    if (isTradingDay(zonedParts(d, 'UTC'), holidays)) return d;
  }
  return d;
}

/** Instant of a wall-clock time in `timeZone` ("2026-10-12T14:32" in Berlin → Date). */
export function fromZonedWallTime(iso: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    guess += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}
