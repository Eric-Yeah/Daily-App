// Price data helpers for the Edge Function "daily-prices". Pure (no network, no Deno APIs), so Vitest can test them.
// Yahoo's chart endpoint is unofficial: every parser tolerates missing fields and returns null/empty instead of throwing.

export interface PricePointT {
  ts: string; // ISO instant (UTC)
  price: number;
}

export interface ChartData {
  symbol: string;
  currency: string | null;
  gmtOffsetSec: number; // exchange offset from UTC at the time of the response
  prevClose: number | null;
  points: PricePointT[]; // only bars with a price
}

export interface DailyClose {
  day: string; // YYYY-MM-DD, exchange-local date
  close: number;
}

/**
 * Public index and future symbols (market data, not personal). `name` is what the app shows.
 * `session` says in which window they are fetched; futures trade almost around the clock and are recorded
 * during the Xetra window so the afternoon "US-Start" can show their move before the US open.
 */
export const INDEX_SYMBOLS = [
  { symbol: '^GDAXI', name: 'DAX', session: 'xetra' },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', session: 'xetra' },
  { symbol: '^GSPC', name: 'S&P 500', session: 'us' },
  { symbol: '^NDX', name: 'Nasdaq 100', session: 'us' },
  { symbol: 'ES=F', name: 'S&P-500-Future', session: 'xetra' },
  { symbol: 'NQ=F', name: 'Nasdaq-100-Future', session: 'xetra' },
] as const;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const chartUrl = (symbol: string, range: '1d' | '5d' | '1y', interval: '15m' | '1d') =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

export const searchUrl = (query: string) =>
  `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;

/** Parses a Yahoo chart response; null if it has no usable result. */
export function parseChart(raw: unknown): ChartData | null {
  const result = (raw as { chart?: { result?: unknown[] } } | null)?.chart?.result?.[0] as
    | {
        meta?: Record<string, unknown>;
        timestamp?: unknown[];
        indicators?: { quote?: { close?: unknown[] }[] };
      }
    | undefined;
  if (!result?.meta) return null;
  const meta = result.meta;
  const symbol = typeof meta.symbol === 'string' ? meta.symbol : '';
  if (!symbol) return null;
  const stamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: PricePointT[] = [];
  stamps.forEach((t, i) => {
    const price = closes[i];
    if (isNum(t) && isNum(price) && price > 0) points.push({ ts: new Date(t * 1000).toISOString(), price });
  });
  const prev = isNum(meta.chartPreviousClose) ? meta.chartPreviousClose : isNum(meta.previousClose) ? meta.previousClose : null;
  return {
    symbol,
    currency: typeof meta.currency === 'string' ? meta.currency : null,
    gmtOffsetSec: isNum(meta.gmtoffset) ? meta.gmtoffset : 0,
    prevClose: prev && prev > 0 ? prev : null,
    points,
  };
}

/** Exchange-local calendar day of an instant. */
export function localDay(ts: string, gmtOffsetSec: number): string {
  return new Date(Date.parse(ts) + gmtOffsetSec * 1000).toISOString().slice(0, 10);
}

/**
 * Daily closes from a 1-day-interval chart. A bar for the current local day is only a close once the
 * session is over (`includeToday`); during the session it is a partial value and is dropped.
 */
export function dailyCloses(chart: ChartData, todayLocal: string, includeToday: boolean): DailyClose[] {
  const byDay = new Map<string, number>();
  for (const p of chart.points) byDay.set(localDay(p.ts, chart.gmtOffsetSec), p.price);
  return [...byDay.entries()]
    .filter(([day]) => day < todayLocal || (includeToday && day === todayLocal))
    .map(([day, close]) => ({ day, close }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export interface SearchHit {
  symbol: string;
  exchange: string | null;
  name: string | null;
  type: string | null;
}

export function parseSearch(raw: unknown): SearchHit[] {
  const quotes = (raw as { quotes?: unknown[] } | null)?.quotes;
  if (!Array.isArray(quotes)) return [];
  const hits: SearchHit[] = [];
  for (const q of quotes as Record<string, unknown>[]) {
    if (typeof q?.symbol !== 'string' || !q.symbol) continue;
    hits.push({
      symbol: q.symbol,
      exchange: typeof q.exchange === 'string' ? q.exchange : null,
      name: typeof q.shortname === 'string' ? q.shortname : typeof q.longname === 'string' ? q.longname : null,
      type: typeof q.quoteType === 'string' ? q.quoteType : null,
    });
  }
  return hits;
}

/** Picks the Xetra listing (`.DE`) among search hits for an ISIN; falls back to the first ETF/fund hit. */
export function pickListing(hits: SearchHit[]): SearchHit | null {
  const funds = hits.filter((h) => !h.type || h.type === 'ETF' || h.type === 'MUTUALFUND' || h.type === 'EQUITY');
  return funds.find((h) => h.symbol.endsWith('.DE')) ?? funds[0] ?? null;
}

// Yahoo exchange suffix → EODHD exchange code (euro-denominated listings only).
const EODHD_EXCHANGE: Record<string, string> = { DE: 'XETRA', MI: 'MI', PA: 'PA', AS: 'AS' };

/** Yahoo symbol (`ABC.DE`) → EODHD symbol (`ABC.XETRA`); null for exchanges not mapped (and for indices). */
export function toEodhdSymbol(yahooSymbol: string): string | null {
  const dot = yahooSymbol.lastIndexOf('.');
  if (dot <= 0) return null;
  const code = EODHD_EXCHANGE[yahooSymbol.slice(dot + 1)];
  return code ? `${yahooSymbol.slice(0, dot)}.${code}` : null;
}

// EODHD exchange code → Yahoo suffix, in order of preference (Xetra first, like the broker).
const LISTING_ORDER = ['XETRA', 'MI', 'PA', 'AS'] as const;
const YAHOO_SUFFIX: Record<string, string> = { XETRA: 'DE', MI: 'MI', PA: 'PA', AS: 'AS' };

export interface EodhdListing {
  code: string;
  exchange: string;
  currency: string | null;
  type: string | null;
}

export const eodhdSearchUrl = (query: string, key: string) =>
  `https://eodhd.com/api/search/${encodeURIComponent(query)}?api_token=${encodeURIComponent(key)}&limit=15&fmt=json`;

/** EODHD search response (by ISIN): [{ Code, Exchange, Currency, Type }, …]. */
export function parseEodhdSearch(raw: unknown): EodhdListing[] {
  if (!Array.isArray(raw)) return [];
  const out: EodhdListing[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.Code === 'string' && typeof r.Exchange === 'string') {
      out.push({ code: r.Code, exchange: r.Exchange, currency: typeof r.Currency === 'string' ? r.Currency : null, type: typeof r.Type === 'string' ? r.Type : null });
    }
  }
  return out;
}

export interface Resolved {
  ticker: string; // EODHD code
  exchange: string; // EODHD exchange code
  yahooSymbol: string; // the same listing at Yahoo
}

/** The euro listing to track: Xetra first, then Milan, Paris, Amsterdam. Null if there is none. */
export function pickEodhdListing(list: EodhdListing[]): Resolved | null {
  for (const exchange of LISTING_ORDER) {
    const hit = list.find((l) => l.exchange === exchange && l.currency === 'EUR');
    if (hit) return { ticker: hit.code, exchange, yahooSymbol: `${hit.code}.${YAHOO_SUFFIX[exchange]}` };
  }
  return null;
}

/** The EODHD symbol of a position: the stored EODHD listing, else derived from the Yahoo symbol. */
export function eodhdSymbolOf(p: { ticker: string | null; exchange: string | null; provider_symbol: string | null }): string | null {
  if (p.ticker && p.exchange && p.exchange in YAHOO_SUFFIX) return `${p.ticker}.${p.exchange}`;
  return p.provider_symbol ? toEodhdSymbol(p.provider_symbol) : null;
}

export const eodhdUrl = (symbol: string, from: string, key: string) =>
  `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}?api_token=${encodeURIComponent(key)}&fmt=json&period=d&from=${from}`;

/** EODHD end-of-day response: [{ date, close }, …]. */
export function parseEodhd(raw: unknown): DailyClose[] {
  if (!Array.isArray(raw)) return [];
  const out: DailyClose[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && isNum(r.close) && r.close > 0) {
      out.push({ day: r.date, close: r.close });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Which sessions are open at a Berlin wall-clock time (minutes since midnight, weekday 1–7). */
export function openSessions(weekday: number, minute: number, tradingEndMinute: number): { xetra: boolean; us: boolean } {
  if (weekday > 5) return { xetra: false, us: false };
  // The jobs run at :02 and :32; a small buffer after the close captures the closing auction.
  return {
    xetra: minute >= 9 * 60 && minute <= tradingEndMinute + 5,
    us: minute >= 15 * 60 + 30 && minute <= 22 * 60 + 5,
  };
}

/** ISO day shifted by whole days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/**
 * From which day an EODHD call must run for one symbol, or null if nothing is needed. EODHD is the licensed
 * source of the closes; Yahoo only writes a provisional close for the day. So: no history at all → the whole
 * year; otherwise from the oldest day of the last `lookbackDays` that is still a Yahoo value.
 */
export function eodhdFrom(rows: { day: string; source: string }[], today: string, yearAgo: string, lookbackDays = 7): string | null {
  if (!rows.length) return yearAgo;
  const since = addDays(today, -lookbackDays);
  const open = rows.filter((r) => r.day >= since && r.source !== 'eodhd').map((r) => r.day);
  return open.length ? open.sort()[0] : null;
}
