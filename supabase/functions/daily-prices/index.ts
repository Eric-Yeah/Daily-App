// Daily App – Edge Function "daily-prices" (Deno).
// Stores intraday snapshots (Yahoo chart, about 15 minutes delayed) and daily closes for the depot
// positions and a few public indices. The app reads only these tables, never the providers.
// EODHD (free key) is the licensed source of the Xetra closes; Yahoo supplies the intraday curves, the indices and a
// provisional close for the day. A missing price stays missing: nothing is estimated.
//
// Called by pg_cron every 30 minutes with the secret header x-daily-cron (see migration 0007).
// Deploy: npx supabase functions deploy daily-prices --no-verify-jwt --use-api --project-ref <ref>
// Optional secret: DAILY_EODHD_API_KEY (entered by the owner in the Supabase dashboard, never in code).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { admin, isCron, json, CORS, ownerId } from '../_shared/admin.ts';
import { hhmmToMinutes, isoDay, minuteOfDay, parts } from '../_shared/berlin.ts';
import {
  addDays,
  chartUrl,
  dailyCloses,
  eodhdFrom,
  eodhdSearchUrl,
  eodhdSymbolOf,
  eodhdUrl,
  figiBody,
  FIGI_URL,
  INDEX_SYMBOLS,
  openSessions,
  parseChart,
  parseEodhd,
  parseEodhdSearch,
  pickEodhdListing,
  pickFigiListing,
  parseSearch,
  pickListing,
  searchUrl,
  symbolOpen,
  type DailyClose,
} from '../_shared/prices.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const GAP_MS = 800; // be gentle with Yahoo: it answers 429 when asked too fast
const MAX_LOOKUPS = 5;
const MAX_BOOTSTRAP = 8;
const MAX_EODHD = 15;
const SNAPSHOT_DAYS = 14;
const DAILY_DAYS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// After one 429 ("Too Many Requests") Yahoo is left alone for the rest of the run; the next run tries again.
let rateLimited = false;
let lastStatus = 0; // HTTP status of the last request (0 = network error or none); only the number is ever logged

async function fetchJson(url: string, post?: string): Promise<unknown | null> {
  const yahoo = url.includes('finance.yahoo.com');
  if (yahoo && rateLimited) return null;
  try {
    const res = await fetch(url, {
      method: post ? 'POST' : 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(post ? { 'Content-Type': 'application/json' } : {}) },
      body: post,
      signal: AbortSignal.timeout(12_000),
    });
    lastStatus = res.status;
    if (res.status === 429 && yahoo) rateLimited = true;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    lastStatus = 0;
    return null;
  }
}

async function upsertChunks(db: SupabaseClient, table: string, rows: object[], onConflict: string, ignoreDuplicates = false) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates });
    if (error) throw new Error(error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  if (!(await isCron(req, db))) return json(401, { error: 'unauthorized' });
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  rateLimited = false;

  const owner = await ownerId(db);
  if (!owner) return json(200, { skipped: 'no owner' });

  const now = new Date();
  const p = parts(now); // Berlin wall clock; the sessions are defined in Berlin time
  const minute = minuteOfDay(p);
  const today = isoDay(p);
  const { data: settingsRow } = await db.from('settings').select('trading_end').eq('user_id', owner).maybeSingle();
  const tradingEnd = hhmmToMinutes((settingsRow?.trading_end as string) || '17:30');

  const open = body.force ? { xetra: true, us: true } : openSessions(p.weekday, minute, tradingEnd);
  const weekday = p.weekday <= 5;
  const xetraDaily = body.force || (weekday && minute >= tradingEnd && minute <= tradingEnd + 40);
  const usDaily = body.force || (weekday && minute >= 22 * 60 && minute <= 22 * 60 + 40);

  const { data: positions } = await db.from('positions').select('id, isin, wkn, ticker, exchange, provider_symbol').eq('user_id', owner).eq('archived', false);
  const log: Record<string, unknown> = { errors: [] as string[] };
  const errors = log.errors as string[];

  // 1. Find the provider symbol for positions that have none. With the EODHD key, EODHD's ISIN search decides the
  //    listing (euro, Xetra first) and the Yahoo symbol is derived from it, so both sources mean the same exchange.
  //    Without it (or if EODHD knows nothing) Yahoo's search picks one. ticker/exchange hold the EODHD listing.
  type Pos = { id: string; isin: string | null; wkn: string | null; ticker: string | null; exchange: string | null; provider_symbol: string | null };
  const key = Deno.env.get('DAILY_EODHD_API_KEY');
  let eodhd = 0; // EODHD requests in this run (search and prices), limited by MAX_EODHD
  let lookups = 0;
  for (const pos of (positions ?? []) as Pos[]) {
    // By ISIN: EODHD (with key) or Yahoo search. Yahoo and EODHD find nothing by WKN, so WKN-only positions go to OpenFIGI.
    if (pos.provider_symbol || (!pos.isin && !pos.wkn) || lookups >= MAX_LOOKUPS) continue;
    if (lookups++ > 0) await sleep(GAP_MS);
    if (!pos.isin) {
      const listing = pickFigiListing(await fetchJson(FIGI_URL, figiBody(pos.wkn!)));
      if (!listing) {
        errors.push(`symbol:wkn-not-found:${lastStatus}`);
        continue;
      }
      Object.assign(pos, { provider_symbol: listing.yahooSymbol, ticker: listing.ticker, exchange: listing.exchange });
    } else {
      const listing = key && eodhd < MAX_EODHD && ++eodhd ? pickEodhdListing(parseEodhdSearch(await fetchJson(eodhdSearchUrl(pos.isin, key)))) : null;
      if (listing) {
        Object.assign(pos, { provider_symbol: listing.yahooSymbol, ticker: listing.ticker, exchange: listing.exchange });
      } else {
        const hit = pickListing(parseSearch(await fetchJson(searchUrl(pos.isin))));
        if (!hit) {
          errors.push('symbol:not-found');
          continue;
        }
        Object.assign(pos, { provider_symbol: hit.symbol, ticker: null, exchange: null }); // EODHD symbol is derived from it
      }
    }
    await db.from('positions').update({ provider_symbol: pos.provider_symbol, ticker: pos.ticker, exchange: pos.exchange }).eq('id', pos.id);
  }
  log.lookups = lookups;

  const eodhdOf = new Map<string, { eod: string; isin: string | null }>(); // Yahoo symbol → EODHD symbol
  for (const pos of (positions ?? []) as Pos[]) {
    const eod = pos.provider_symbol ? eodhdSymbolOf(pos) : null;
    if (pos.provider_symbol && eod) eodhdOf.set(pos.provider_symbol, { eod, isin: pos.isin });
  }
  const depotSymbols = [...new Set(((positions ?? []) as { provider_symbol: string | null }[]).map((x) => x.provider_symbol).filter((s): s is string => !!s))];
  const indexSymbols = INDEX_SYMBOLS.filter((i) => symbolOpen(i.session, open)).map((i) => i.symbol as string);

  // 2. Intraday snapshots
  const intraday = [...new Set([...(open.xetra ? depotSymbols : []), ...indexSymbols])];
  let snapshots = 0;
  for (const [i, symbol] of intraday.entries()) {
    if (i > 0) await sleep(GAP_MS);
    const chart = parseChart(await fetchJson(chartUrl(symbol, '1d', '15m')));
    if (!chart || !chart.points.length) {
      errors.push(`intraday:${symbol.startsWith('^') || symbol.endsWith('=F') ? symbol : 'position'}:${lastStatus}`);
      continue;
    }
    try {
      await upsertChunks(db, 'price_snapshots', chart.points.map((pt) => ({ symbol, ts: pt.ts, price: pt.price })), 'symbol,ts');
      snapshots += chart.points.length;
    } catch (e) {
      errors.push(`db:${(e as Error).message}`);
    }
  }
  log.snapshots = snapshots;

  // 3. Daily closes. EODHD (licensed, needs the key) is the source for Xetra positions: once a morning it replaces
  //    the provisional Yahoo values of the last days and, for a new symbol, loads the whole year. Yahoo writes
  //    only today's provisional close for those symbols and never overwrites an EODHD value. Indices and
  //    symbols EODHD does not cover come from Yahoo alone.
  const known = new Map<string, number>();
  {
    // The API returns at most 1000 rows per request, so page through the table (stable order) to see every symbol.
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await db.from('price_daily').select('symbol').order('symbol').order('day').range(from, from + 999);
      for (const r of (data ?? []) as { symbol: string }[]) known.set(r.symbol, (known.get(r.symbol) ?? 0) + 1);
      if ((data ?? []).length < 1000) break;
    }
  }
  const recent = new Map<string, { day: string; source: string }[]>();
  {
    const { data } = await db.from('price_daily').select('symbol, day, source').gte('day', addDays(today, -8)).limit(5000);
    for (const r of (data ?? []) as { symbol: string; day: string; source: string }[]) {
      recent.set(r.symbol, [...(recent.get(r.symbol) ?? []), { day: r.day, source: r.source }]);
    }
  }
  const eodhdMorning = body.force || (weekday && minute >= 8 * 60 && minute < 8 * 60 + 30);
  const yearAgo = addDays(today, -380);
  const covered = new Set<string>(); // symbols whose closes EODHD supplies
  if (key) {
    for (const symbol of depotSymbols) {
      const target = eodhdOf.get(symbol);
      if (!target) continue;
      let eod = target.eod;
      const needs = !known.has(symbol) || eodhdMorning;
      const from = needs ? eodhdFrom(known.has(symbol) ? (recent.get(symbol) ?? []) : [], today, yearAgo) : null;
      if (!from || eodhd >= MAX_EODHD) {
        if (known.has(symbol)) covered.add(symbol);
        continue;
      }
      eodhd++;
      await sleep(GAP_MS);
      let rows: DailyClose[] = parseEodhd(await fetchJson(eodhdUrl(eod, from, key)));
      if (!rows.length && lastStatus === 404 && eodhd < MAX_EODHD) {
        // The stored listing is unknown at EODHD: look the ISIN up once and remember the EODHD listing (the Yahoo symbol stays).
        eodhd++;
        const listing = target.isin ? pickEodhdListing(parseEodhdSearch(await fetchJson(eodhdSearchUrl(target.isin, key)))) : null;
        if (listing) {
          eod = `${listing.ticker}.${listing.exchange}`;
          await db.from('positions').update({ ticker: listing.ticker, exchange: listing.exchange }).eq('provider_symbol', symbol);
          rows = parseEodhd(await fetchJson(eodhdUrl(eod, from, key)));
        }
      }
      if (!rows.length) {
        errors.push(`eodhd:no-data:${lastStatus}`); // Yahoo takes over below
        continue;
      }
      try {
        await upsertChunks(db, 'price_daily', rows.map((r) => ({ symbol, day: r.day, close: r.close, source: 'eodhd' })), 'symbol,day');
        covered.add(symbol);
        known.set(symbol, Math.max(known.get(symbol) ?? 0, rows.length));
      } catch (e) {
        errors.push(`db:${(e as Error).message}`);
      }
    }
  }
  log.eodhd = eodhd;

  const allSymbols = [...depotSymbols, ...INDEX_SYMBOLS.map((i) => i.symbol as string)];
  const wanted = allSymbols.filter((s) => {
    const isUs = INDEX_SYMBOLS.some((i) => i.symbol === s && i.session !== 'xetra');
    if (!known.has(s)) return true; // bootstrap (EODHD failed or does not cover it)
    return isUs ? usDaily : xetraDaily;
  });
  let bootstrap = 0;
  let dailyRows = 0;
  for (const symbol of wanted) {
    if (!known.has(symbol) && bootstrap++ >= MAX_BOOTSTRAP) continue;
    await sleep(GAP_MS);
    const chart = parseChart(await fetchJson(chartUrl(symbol, '1y', '1d')));
    if (!chart) {
      errors.push('daily:fetch');
      continue;
    }
    const isUs = INDEX_SYMBOLS.some((i) => i.symbol === symbol && i.session !== 'xetra');
    const sessionOver = isUs ? minute >= 22 * 60 : minute >= tradingEnd;
    const own = covered.has(symbol);
    const rows = dailyCloses(chart, today, weekday && sessionOver)
      .filter((c) => !own || c.day === today)
      .map((c) => ({ symbol, day: c.day, close: c.close, source: 'yahoo' }));
    try {
      await upsertChunks(db, 'price_daily', rows, 'symbol,day', own); // never overwrite an EODHD close
      dailyRows += rows.length;
    } catch (e) {
      errors.push(`db:${(e as Error).message}`);
    }
  }
  log.dailyRows = dailyRows;

  // 5. Keep the tables small
  await db.from('price_snapshots').delete().lt('ts', new Date(now.getTime() - SNAPSHOT_DAYS * 86400_000).toISOString());
  await db.from('price_daily').delete().lt('day', isoDay(parts(new Date(now.getTime() - DAILY_DAYS * 86400_000))));

  if (rateLimited) errors.push('yahoo:rate-limited');
  return json(200, { open, ...log });
});
