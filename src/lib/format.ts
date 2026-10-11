// Number, currency and date formatting (de-DE). All UI strings with numbers go through here.

export const MINUS = '−';
const HIDDEN = '••••';

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  const key = String(decimals);
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormats.set(key, f);
  }
  return f;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const r = Math.round(value * factor) / factor;
  return Object.is(r, -0) ? 0 : r;
}

export type Trend = 'pos' | 'neg' | 'flat';

/** Trend of a value after rounding to the displayed precision, so "−0,0 %" never happens. */
export function trend(value: number, decimals = 2): Trend {
  const r = round(value, decimals);
  return r > 0 ? 'pos' : r < 0 ? 'neg' : 'flat';
}

function sign(value: number, decimals: number): string {
  const t = trend(value, decimals);
  return t === 'pos' ? '+' : t === 'neg' ? MINUS : '';
}

/** 48215 → "48.215", -3.14 (2) → "−3,14" */
export function formatNumber(value: number, decimals = 0, signed = false): string {
  const r = round(value, decimals);
  const body = nf(decimals).format(Math.abs(r));
  if (signed) return sign(r, decimals) + body;
  return (r < 0 ? MINUS : '') + body;
}

export interface EuroOptions {
  decimals?: number;
  signed?: boolean;
  hidden?: boolean;
}

/** 48215 → "48.215 €", signed 201 → "+201 €" */
export function formatEuro(value: number, { decimals = 0, signed = false, hidden = false }: EuroOptions = {}): string {
  if (hidden) return `${HIDDEN} €`;
  return `${formatNumber(value, decimals, signed)} €`;
}

/** Value is already in percent units: 0.42 → "+0,42 %" (always with sign unless zero). */
export function formatPct(value: number, decimals = 1, signed = true): string {
  return `${formatNumber(value, decimals, signed)} %`;
}

export function arrow(value: number, decimals = 2): string {
  const t = trend(value, decimals);
  return t === 'pos' ? '▲' : t === 'neg' ? '▼' : '';
}

/** "▲ +0,42 %" */
export function formatPctArrow(value: number, decimals = 2): string {
  const a = arrow(value, decimals);
  return `${a ? a + ' ' : ''}${formatPct(value, decimals)}`;
}

/** Placeholder for a missing number (never estimate). */
export const MISSING = '—';

// ---------- Dates and times ----------

const dateFormats = new Map<string, Intl.DateTimeFormat>();
function df(timeZone: string, kind: 'time' | 'long' | 'weekday' | 'month'): Intl.DateTimeFormat {
  const key = `${timeZone}|${kind}`;
  let f = dateFormats.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === 'time'
        ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : kind === 'long'
          ? { weekday: 'long', day: 'numeric', month: 'long' }
          : kind === 'weekday'
            ? { weekday: 'long' }
            : { month: 'long' };
    f = new Intl.DateTimeFormat('de-DE', { ...opts, timeZone });
    dateFormats.set(key, f);
  }
  return f;
}

/** "14:30" */
export function formatTime(date: Date, timeZone: string): string {
  return df(timeZone, 'time').format(date);
}

/** "Montag, 12. Oktober" */
export function formatDateLong(date: Date, timeZone: string): string {
  return df(timeZone, 'long').format(date);
}

/** "Freitag" */
export function formatWeekday(date: Date, timeZone: string): string {
  return df(timeZone, 'weekday').format(date);
}

/** "Oktober" */
export function formatMonth(date: Date, timeZone: string): string {
  return df(timeZone, 'month').format(date);
}

/** 178 → "2 Std. 58 Min.", 58 → "58 Min.", 120 → "2 Std." */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} Min.`;
  if (rest === 0) return `${h} Std.`;
  return `${h} Std. ${rest} Min.`;
}

/** Age of a news item: "vor 5 Min.", "vor 2 Std.", "vor 1 Tag", "vor 3 Tagen" */
export function formatAge(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

/** "1 Position", "5 Positionen" */
export function formatPositions(n: number): string {
  return n === 1 ? '1 Position' : `${n} Positionen`;
}

/** Number for an input field: German comma, no thousands separator, up to 6 decimals. */
export function formatInputNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6, useGrouping: false }).format(value);
}

/** Parses what someone types: "80,5", "80.5", "1.234,5" and "−3" all work. */
export function parseInputNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s|€|%/g, '').replace(/−/g, '-');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Share count: "12,5", "3", "0,123456" (German, grouped, no trailing zeros). */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 }).format(value);
}
