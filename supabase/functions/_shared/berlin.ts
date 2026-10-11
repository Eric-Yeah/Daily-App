// Wall-clock helpers for a time zone (default Europe/Berlin). Pure; Intl handles DST.

export interface Parts {
  year: number;
  month: number;
  day: number;
  weekday: number; // 1 = Monday … 7 = Sunday
  hour: number;
  minute: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function parts(date: Date, timeZone = 'Europe/Berlin'): Parts {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return {
    year: +get('year'),
    month: +get('month'),
    day: +get('day'),
    weekday: WEEKDAYS[get('weekday')] ?? 1,
    hour: +get('hour'),
    minute: +get('minute'),
  };
}

export const isoDay = (p: Pick<Parts, 'year' | 'month' | 'day'>) =>
  `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;

export const minuteOfDay = (p: Pick<Parts, 'hour' | 'minute'>) => p.hour * 60 + p.minute;

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "14:30" for an instant in the time zone. */
export function hhmm(date: Date, timeZone = 'Europe/Berlin'): string {
  const p = parts(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Whole days from `fromIso` to `toIso` (calendar days). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);
}
