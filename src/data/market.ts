// Real market data for the "Heute" views: the depot's value, groups, curves and the indices, read from the
// price tables the Edge Function "daily-prices" fills (RLS: owner only). The app never calls a price provider.
// What is missing stays missing: a block turns "empty" with the reason, a position without price is left out and counted.
import { useEffect, useState } from 'preact/hooks';
import { getSettings } from '../lib/settings';
import { storage } from '../lib/storage';
import { AFTERNOON_STRIP, ALL_INDEX_SYMBOLS, IDX, MORNING_STRIP } from '../lib/indices';
import { formatNumber } from '../lib/format';
import { computeDepot, periodChanges, type DepotResult, type PositionInput } from '../lib/portfolio';
import { daily } from '../lib/supabase';
import {
  depotHistory,
  depotIntraday,
  group,
  indexCurve,
  priceInfo,
  type DailyRow,
  type PriceInfo,
  type SnapRow,
} from '../lib/series';
import { usSessionInZone } from '../lib/time';
import { empty, failed, ok, type AfternoonData, type AlertItem, type Block, type EveningData, type GroupMove, type IndexQuote, type MorningData } from './types';
import type { Group, Position } from './depot';

const DAY = 86400000;
const NO_PRICES = 'Für deine Positionen liegen noch keine Kurse vor. Sie werden zu Handelszeiten alle 30 Minuten abgerufen.';

type Row = Record<string, unknown>;

// Whether real positions (and so real market data) exist. Remembered across starts so the
// "Beispieldaten" banner does not flash for a moment on every launch.
let live = storage.get('market-live') === '1';
const liveListeners = new Set<() => void>();

function setLive(next: boolean) {
  if (next === live) return;
  live = next;
  storage.set('market-live', next ? '1' : '0');
  liveListeners.forEach((l) => l());
}

export function useMarketLive(): boolean {
  const [value, setValue] = useState(live);
  useEffect(() => {
    const l = () => setValue(live);
    liveListeners.add(l);
    return () => void liveListeners.delete(l);
  }, []);
  return value;
}

/** All rows of a query, 1000 at a time (the API returns at most 1000 per request). */
async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < 1000) return out;
  }
  return out;
}

interface Bundle {
  groups: Group[];
  positions: Position[];
  snaps: SnapRow[];
  closes: DailyRow[];
}

const toPos = (r: Row): Position => ({
  id: r.id as string,
  name: r.name as string,
  isin: (r.isin as string | null) ?? null,
  wkn: (r.wkn as string | null) ?? null,
  quantity: Number(r.quantity),
  costPerUnit: Number(r.cost_per_unit),
  currency: (r.currency as string) ?? 'EUR',
  groupId: (r.group_id as string | null) ?? null,
  lossThresholdPct: r.loss_threshold_pct == null ? null : Number(r.loss_threshold_pct),
  topics: (r.topics as string[]) ?? [],
  manualPrice: r.manual_price == null ? null : Number(r.manual_price),
  savingsAmount: r.savings_amount == null ? null : Number(r.savings_amount),
  savingsDay: r.savings_day == null ? null : Number(r.savings_day),
  providerSymbol: (r.provider_symbol as string | null) ?? null,
  archived: Boolean(r.archived),
});

/** null = no positions yet (the caller keeps the base source); 'error' = the tables could not be read. */
async function load(now: Date): Promise<Bundle | null | 'error'> {
  const [g, p] = await Promise.all([
    daily().from('groups').select('id,name,color,sort').order('sort').order('name'),
    daily().from('positions').select('*').eq('archived', false).order('name'),
  ]);
  if (g.error || p.error) return 'error';
  const positions = (p.data as Row[]).map(toPos).filter((x) => x.quantity > 0);
  setLive(positions.length > 0);
  if (!positions.length) return null;

  const symbols = [...new Set([...positions.map((x) => x.providerSymbol).filter((s): s is string => !!s), ...ALL_INDEX_SYMBOLS])];
  const sinceDay = new Date(now.getTime() - 400 * DAY).toISOString().slice(0, 10);
  const sinceTs = new Date(now.getTime() - 6 * DAY).toISOString();
  const [closes, snaps] = await Promise.all([
    fetchAll((a, b) => daily().from('price_daily').select('symbol,day,close').in('symbol', symbols).gte('day', sinceDay).order('symbol').order('day').range(a, b)),
    fetchAll((a, b) =>
      daily().from('price_snapshots').select('symbol,ts,price').in('symbol', symbols).gte('ts', sinceTs).lte('ts', now.toISOString()).order('symbol').order('ts').range(a, b),
    ),
  ]);
  if (!closes || !snaps) return 'error';
  return {
    groups: g.data as Group[],
    positions,
    closes: closes.map((r) => ({ symbol: r.symbol as string, day: r.day as string, close: Number(r.close) })),
    snaps: snaps.map((r) => ({ symbol: r.symbol as string, ts: r.ts as string, price: Number(r.price) })),
  };
}

// The tables change every 30 minutes at most, the views reload every minute: reuse one read for 5 minutes.
let cache: { key: number; at: number; value: ReturnType<typeof load> } | null = null;

/** Forget the cached read (e.g. after the depot changed). */
export function invalidateMarket() {
  cache = null;
}

function loadCached(now: Date): ReturnType<typeof load> {
  const key = Math.floor(now.getTime() / 300_000);
  if (cache && cache.key === key && Date.now() - cache.at < 300_000) return cache.value;
  const value = load(now);
  cache = { key, at: Date.now(), value };
  void value.then((v) => {
    if (v === 'error' && cache?.value === value) cache = null; // retry the next minute
  });
  return value;
}

const dateOf = (isoDay: string) => new Date(`${isoDay}T12:00:00Z`);

interface Computed {
  inputs: PositionInput[];
  result: DepotResult;
  infos: Map<string, PriceInfo>; // by symbol (positions and indices)
  lastDay: string | null;
}

function compute(b: Bundle, now: Date): Computed {
  const { timeZone, lossThresholdPct } = getSettings();
  const snapsBy = group(b.snaps);
  const closesBy = group(b.closes);
  const infos = new Map<string, PriceInfo>();
  for (const s of new Set([...b.positions.map((p) => p.providerSymbol ?? ''), ...ALL_INDEX_SYMBOLS])) {
    if (!s) continue;
    const info = priceInfo(snapsBy.get(s) ?? [], closesBy.get(s) ?? [], timeZone, now);
    if (info) infos.set(s, info);
  }
  const inputs: PositionInput[] = b.positions.map((p) => {
    // Only EUR prices are used; other currencies are not converted (no invented exchange rates).
    const info = p.providerSymbol && p.currency === 'EUR' ? infos.get(p.providerSymbol) : undefined;
    const manual = p.manualPrice ? { last: p.manualPrice, prevClose: p.manualPrice } : null;
    return {
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      costPerUnit: p.costPerUnit,
      groupId: p.groupId,
      lossThresholdPct: p.lossThresholdPct,
      price: info?.price ?? manual,
    };
  });
  const result = computeDepot(inputs, b.groups, lossThresholdPct);
  const days = b.positions.map((p) => (p.providerSymbol ? infos.get(p.providerSymbol)?.lastDay : undefined)).filter((d): d is string => !!d);
  return { inputs, result, infos, lastDay: days.sort().at(-1) ?? null };
}

const groupMoves = (r: DepotResult): GroupMove[] => r.groups.map((g) => ({ name: g.name, sharePct: g.sharePct, changePct: g.changePct }));

function quote(c: Computed, ix: { symbol: string; name: string; unit?: string }): IndexQuote {
  const p = c.infos.get(ix.symbol)?.price;
  const out: IndexQuote = { name: ix.name, changePct: p ? ((p.last - p.prevClose) / p.prevClose) * 100 : null };
  if (p && ix.unit) out.price = `${formatNumber(p.last, 2)} ${ix.unit}`;
  return out;
}

function indices(c: Computed, list: readonly { symbol: string; name: string; unit?: string }[]): Block<IndexQuote[]> {
  const quotes = list.map((ix) => quote(c, ix));
  return quotes.some((q) => q.changePct !== null) ? ok(quotes) : empty('Indexkurse sind noch nicht verfügbar.');
}

/** Held symbols for curves: EUR positions with a provider symbol. */
const held = (b: Bundle) =>
  b.positions.filter((p) => p.providerSymbol && p.currency === 'EUR').map((p) => ({ symbol: p.providerSymbol!, quantity: p.quantity }));

async function alertItem(a: DepotResult['alerts'][number]): Promise<AlertItem> {
  const since = new Date(Date.now() - 3 * DAY).toISOString();
  const { data } = await daily()
    .from('news_links')
    .select('news_items(title,url,teaser,published_at,news_summaries(summary))')
    .eq('position_id', a.positionId)
    .limit(30);
  type Linked = { title: string; url: string; teaser: string | null; published_at: string; news_summaries: { summary: string }[] | null };
  const items = ((data ?? []) as unknown as { news_items: Linked | null }[])
    .map((r) => r.news_items)
    .filter((n): n is Linked => !!n && n.published_at >= since)
    .sort((x, y) => y.published_at.localeCompare(x.published_at));
  const n = items[0];
  return {
    name: a.name,
    changePct: a.changePct,
    thresholdPct: a.thresholdPct,
    summary: n ? (n.news_summaries?.[0]?.summary ?? n.teaser ?? n.title) : 'Dazu liegt noch keine passende Meldung vor.',
    url: n?.url ?? '',
  };
}

const allFailed = <T extends object>(keys: (keyof T)[]): Partial<T> => {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = failed('Kurse gerade nicht verfügbar.') as T[keyof T];
  return out;
};

export async function marketMorning(now: Date): Promise<Partial<MorningData>> {
  const b = await loadCached(now);
  if (b === null) return {};
  const noWeather: Pick<MorningData, 'weather'> = { weather: empty('Das Wetter folgt in einer späteren Version.') };
  if (b === 'error') return { ...noWeather, ...allFailed<MorningData>(['indices', 'depot', 'kpis', 'alert']) };
  const c = compute(b, now);
  const idx = indices(c, MORNING_STRIP);

  if (!c.lastDay || c.result.value === 0) {
    const none = <T>() => empty<T>(NO_PRICES);
    return { ...noWeather, indices: idx, depot: none(), kpis: none(), alert: none() };
  }
  const r = c.result;
  const history = depotHistory(held(b), b.closes, 10, c.lastDay).map((d) => ({ day: dateOf(d.day), value: d.value }));
  const kpis: MorningData['kpis'] =
    r.ytdPct === null || r.ytdAbs === null
      ? empty('Zum Jahresbeginn fehlen Vergleichskurse.')
      : ok({ sinceBuy: { pct: r.sinceBuyPct, abs: r.sinceBuyAbs }, ytd: { pct: r.ytdPct, abs: r.ytdAbs } });
  return {
    ...noWeather,
    indices: idx,
    depot: ok({
      summary: { value: r.value, changeAbs: r.changeAbs, changePct: r.changePct },
      closeDay: dateOf(c.lastDay),
      history,
      groups: groupMoves(r),
      missing: c.result.missing.length,
    }),
    kpis,
    alert: ok(r.alerts.length ? await alertItem(r.alerts[0]) : null),
  };
}

export async function marketAfternoon(now: Date): Promise<Partial<AfternoonData>> {
  const b = await loadCached(now);
  if (b === null) return {};
  if (b === 'error') return allFailed<AfternoonData>(['depot', 'indices', 'groups', 'usStart', 'morningEvents']);
  const c = compute(b, now);
  const { timeZone, tradingEnd } = getSettings();
  const morningEvents: AfternoonData['morningEvents'] = empty('Ergebnisse der Termine werden noch nicht ausgewertet.');
  const futures: IndexQuote[] = [
    { ...quote(c, IDX.spFuture), name: 'S&P 500' },
    { ...quote(c, IDX.ndxFuture), name: 'Nasdaq 100' },
  ];
  const usStart: AfternoonData['usStart'] = futures.some((f) => f.changePct !== null) ? ok({ futures }) : empty('Future-Kurse sind noch nicht verfügbar.');
  const idx = indices(c, AFTERNOON_STRIP);

  const cur = depotIntraday(held(b), b.snaps, b.closes, { tz: timeZone, now, start: '09:00', end: tradingEnd });
  const last = cur?.points.at(-1);
  if (!cur || !last) {
    const none = <T>() => empty<T>('Noch keine Tageskurve. Die Kurse kommen zu Handelszeiten alle 30 Minuten.');
    return { depot: none(), indices: idx, groups: none(), usStart, morningEvents };
  }
  return {
    depot: ok({
      summary: { value: last.value, changeAbs: last.value - cur.prevClose, changePct: ((last.value - cur.prevClose) / cur.prevClose) * 100 },
      prevCloseDay: dateOf(cur.prevDay),
      intraday: { prevClose: cur.prevClose, points: cur.points, sessionStart: '09:00', sessionEnd: tradingEnd },
      missing: b.positions.length - cur.used,
    }),
    indices: idx,
    groups: c.result.groups.length ? ok(groupMoves(c.result)) : empty(NO_PRICES),
    usStart,
    morningEvents,
  };
}

export async function marketEvening(now: Date): Promise<Partial<EveningData>> {
  const b = await loadCached(now);
  if (b === null) return {};
  if (b === 'error') return allFailed<EveningData>(['balance', 'us', 'periods']);
  const c = compute(b, now);
  const { timeZone, tradingEnd } = getSettings();

  const us = usSessionInZone(now, timeZone);
  const snapsBy = group(b.snaps);
  const closesBy = group(b.closes);
  const curves = [IDX.sp500, IDX.ndx].flatMap((ix) => {
    const cv = indexCurve(snapsBy.get(ix.symbol) ?? [], closesBy.get(ix.symbol) ?? [], { tz: timeZone, now, start: us.open, end: us.close });
    return cv ? [{ name: ix.name, ...cv }] : [];
  });
  const usBlock: EveningData['us'] = curves.length ? ok({ indices: curves, sessionStart: us.open, sessionEnd: us.close }) : empty('Die US-Kurse sind noch nicht verfügbar.');

  const pc = periodChanges(c.inputs);
  const month = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone }).format(now);
  const periods = [
    pc.week && { label: 'Woche', pct: pc.week.pct, sub: 'seit Montag' },
    pc.month && { label: 'Monat', pct: pc.month.pct, sub: month },
    pc.year && { label: 'Jahr', pct: pc.year.pct, sub: 'seit Januar' },
  ].filter((x): x is { label: string; pct: number; sub: string } => !!x);
  const periodsBlock: EveningData['periods'] = periods.length ? ok(periods) : empty('Für Woche, Monat und Jahr fehlen noch Vergleichskurse.');

  const cur = depotIntraday(held(b), b.snaps, b.closes, { tz: timeZone, now, start: '09:00', end: tradingEnd });
  const last = cur?.points.at(-1);
  const balance: EveningData['balance'] =
    cur && last
      ? ok({
          summary: { value: last.value, changeAbs: last.value - cur.prevClose, changePct: ((last.value - cur.prevClose) / cur.prevClose) * 100 },
          prevCloseDay: dateOf(cur.prevDay),
          intraday: { prevClose: cur.prevClose, points: cur.points, sessionStart: '09:00', sessionEnd: tradingEnd },
          groups: groupMoves(c.result),
          missing: b.positions.length - cur.used,
        })
      : empty(NO_PRICES);
  return { balance, us: usBlock, periods: periodsBlock };
}
