// Daily App – Edge Function "daily-prices" (Deno).
// Stores intraday snapshots (Yahoo chart, about 15 minutes delayed) and daily closes for the depot
// positions and a few public indices. The app reads only these tables, never the providers.
// EODHD (free key, optional) fills in a missing Xetra close. A missing price stays missing: nothing is estimated.
//
// Called by pg_cron every 30 minutes with the secret header x-daily-cron (see migration 0007).
// Deploy: npx supabase functions deploy daily-prices --no-verify-jwt --use-api --project-ref <ref>
// Optional secret: DAILY_EODHD_API_KEY (entered by the owner in the Supabase dashboard, never in code).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { admin, isCron, json, CORS, ownerId } from '../_shared/admin.ts';
import { hhmmToMinutes, isoDay, minuteOfDay, parts } from '../_shared/berlin.ts';
import {
  chartUrl,
  dailyCloses,
  eodhdUrl,
  INDEX_SYMBOLS,
  openSessions,
  parseChart,
  parseEodhd,
  parseSearch,
  pickListing,
  searchUrl,
  toEodhdSymbol,
  type DailyClose,
} from '../_shared/prices.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const GAP_MS = 400;
const MAX_LOOKUPS = 5;
const MAX_BOOTSTRAP = 8;
const MAX_EODHD = 15;
const SNAPSHOT_DAYS = 14;
const DAILY_DAYS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
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

  const { data: positions } = await db.from('positions').select('id, isin, ticker, provider_symbol').eq('user_id', owner).eq('archived', false);
  const log: Record<string, unknown> = { errors: [] as string[] };
  const errors = log.errors as string[];

  // 1. Find the provider symbol for positions that have none (Xetra listing preferred)
  let lookups = 0;
  for (const pos of (positions ?? []) as { id: string; isin: string; provider_symbol: string | null }[]) {
    if (pos.provider_symbol || lookups >= MAX_LOOKUPS) continue;
    if (lookups++ > 0) await sleep(GAP_MS);
    const hit = pickListing(parseSearch(await fetchJson(searchUrl(pos.isin))));
    if (!hit) {
      errors.push('symbol:not-found');
      continue;
    }
    pos.provider_symbol = hit.symbol;
    await db
      .from('positions')
      .update({ provider_symbol: hit.symbol, ticker: hit.symbol.split('.')[0].slice(0, 20), exchange: hit.symbol.endsWith('.DE') ? 'XETRA' : (hit.exchange ?? '').slice(0, 20) || null })
      .eq('id', pos.id);
  }
  log.lookups = lookups;

  const depotSymbols = [...new Set(((positions ?? []) as { provider_symbol: string | null }[]).map((x) => x.provider_symbol).filter((s): s is string => !!s))];
  const indexSymbols = INDEX_SYMBOLS.filter((i) => (i.session === 'xetra' ? open.xetra : open.us)).map((i) => i.symbol as string);

  // 2. Intraday snapshots
  const intraday = [...new Set([...(open.xetra ? depotSymbols : []), ...indexSymbols])];
  let snapshots = 0;
  for (const [i, symbol] of intraday.entries()) {
    if (i > 0) await sleep(GAP_MS);
    const chart = parseChart(await fetchJson(chartUrl(symbol, '1d', '15m')));
    if (!chart || !chart.points.length) {
      errors.push(`intraday:${symbol.startsWith('^') || symbol.endsWith('=F') ? symbol : 'position'}`);
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

  // 3. Daily closes: after the session, and once for a symbol that has no history yet
  const known = new Map<string, number>();
  {
    const { data } = await db.from('price_daily').select('symbol').limit(10000);
    for (const r of (data ?? []) as { symbol: string }[]) known.set(r.symbol, (known.get(r.symbol) ?? 0) + 1);
  }
  const allSymbols = [...depotSymbols, ...INDEX_SYMBOLS.map((i) => i.symbol as string)];
  const wanted = allSymbols.filter((s) => {
    const isUs = INDEX_SYMBOLS.some((i) => i.symbol === s && i.session === 'us');
    if (!known.has(s)) return true; // bootstrap
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
    const isUs = INDEX_SYMBOLS.some((i) => i.symbol === symbol && i.session === 'us');
    const sessionOver = isUs ? minute >= 22 * 60 : minute >= tradingEnd;
    const rows = dailyCloses(chart, today, weekday && sessionOver).map((c) => ({ symbol, day: c.day, close: c.close, source: 'yahoo' }));
    try {
      await upsertChunks(db, 'price_daily', rows, 'symbol,day');
      dailyRows += rows.length;
    } catch (e) {
      errors.push(`db:${(e as Error).message}`);
    }
  }
  log.dailyRows = dailyRows;

  // 4. EODHD fallback: a Xetra position still without today's close after the session
  const key = Deno.env.get('DAILY_EODHD_API_KEY');
  let eodhd = 0;
  if (key && weekday && minute >= tradingEnd + 20 && minute <= tradingEnd + 40) {
    const { data: have } = await db.from('price_daily').select('symbol').eq('day', today).in('symbol', depotSymbols);
    const haveSet = new Set(((have ?? []) as { symbol: string }[]).map((r) => r.symbol));
    const from = isoDay(parts(new Date(now.getTime() - 7 * 86400_000)));
    for (const symbol of depotSymbols) {
      const eod = toEodhdSymbol(symbol);
      if (haveSet.has(symbol) || !eod || eodhd >= MAX_EODHD) continue;
      eodhd++;
      const rows: DailyClose[] = parseEodhd(await fetchJson(eodhdUrl(eod, from, key)));
      if (rows.length) await upsertChunks(db, 'price_daily', rows.map((r) => ({ symbol, day: r.day, close: r.close, source: 'eodhd' })), 'symbol,day', true);
      await sleep(GAP_MS);
    }
  }
  log.eodhd = eodhd;

  // 5. Keep the tables small
  await db.from('price_snapshots').delete().lt('ts', new Date(now.getTime() - SNAPSHOT_DAYS * 86400_000).toISOString());
  await db.from('price_daily').delete().lt('day', isoDay(parts(new Date(now.getTime() - DAILY_DAYS * 86400_000))));

  return json(200, { open, ...log });
});
