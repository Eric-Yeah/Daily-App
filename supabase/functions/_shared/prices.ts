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

/** Yahoo's Xetra suffix `.DE` is `.XETRA` at EODHD; other symbols are not supported there. */
export function toEodhdSymbol(yahooSymbol: string): string | null {
  return yahooSymbol.endsWith('.DE') ? `${yahooSymbol.slice(0, -3)}.XETRA` : null;
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
