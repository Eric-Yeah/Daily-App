// "Marktstart": the short update shortly after Xetra opens (about 09:30 Berlin time).
// Index moves and the biggest winners and losers come from our own price fetch (numbers never come from the AI);
// the AI only writes two or three sentences and, where a news item names the company, a short reason.
// Pure (no network, no Deno APIs), also used in tests.
import { isoDay, parts } from './berlin.ts';
import type { NewsInput } from './briefing.ts';
import type { ChartData } from './prices.ts';

export interface OpenSymbol {
  symbol: string;
  name: string;
  /** Words that identify the company in a news text (default: the name). */
  terms?: string[];
}

/** Indices and futures shown in the update (Xetra is open, US trading is not yet: the futures show the mood). */
export const OPEN_INDICES: OpenSymbol[] = [
  { symbol: '^GDAXI', name: 'DAX' },
  { symbol: '^MDAXI', name: 'MDAX' },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  { symbol: 'ES=F', name: 'S&P-500-Future' },
  { symbol: 'NQ=F', name: 'Nasdaq-100-Future' },
];

/**
 * Large German shares (Yahoo symbols, Xetra) checked for the biggest moves. A fixed list of public market data;
 * a symbol that no longer exists is simply skipped, a changed index membership only needs a new line here.
 */
export const OPEN_STOCKS: OpenSymbol[] = [
  { symbol: 'ADS.DE', name: 'Adidas' },
  { symbol: 'AIR.DE', name: 'Airbus' },
  { symbol: 'ALV.DE', name: 'Allianz' },
  { symbol: 'BAS.DE', name: 'BASF' },
  { symbol: 'BAYN.DE', name: 'Bayer' },
  { symbol: 'BEI.DE', name: 'Beiersdorf' },
  { symbol: 'BMW.DE', name: 'BMW' },
  { symbol: 'BNR.DE', name: 'Brenntag' },
  { symbol: 'CBK.DE', name: 'Commerzbank' },
  { symbol: 'CON.DE', name: 'Continental' },
  { symbol: 'DTG.DE', name: 'Daimler Truck' },
  { symbol: 'DBK.DE', name: 'Deutsche Bank' },
  { symbol: 'DB1.DE', name: 'Deutsche Börse' },
  { symbol: 'DHL.DE', name: 'Deutsche Post', terms: ['Deutsche Post', 'DHL'] },
  { symbol: 'DTE.DE', name: 'Deutsche Telekom', terms: ['Deutsche Telekom', 'Telekom'] },
  { symbol: 'EOAN.DE', name: 'E.ON' },
  { symbol: 'FRE.DE', name: 'Fresenius' },
  { symbol: 'FME.DE', name: 'Fresenius Medical Care' },
  { symbol: 'G1A.DE', name: 'GEA' },
  { symbol: 'G24.DE', name: 'Scout24' },
  { symbol: 'HNR1.DE', name: 'Hannover Rück' },
  { symbol: 'HEI.DE', name: 'Heidelberg Materials' },
  { symbol: 'HEN3.DE', name: 'Henkel' },
  { symbol: 'IFX.DE', name: 'Infineon' },
  { symbol: 'MBG.DE', name: 'Mercedes-Benz', terms: ['Mercedes-Benz', 'Mercedes'] },
  { symbol: 'MRK.DE', name: 'Merck' },
  { symbol: 'MTX.DE', name: 'MTU Aero Engines', terms: ['MTU'] },
  { symbol: 'MUV2.DE', name: 'Münchener Rück', terms: ['Münchener Rück', 'Munich Re'] },
  { symbol: 'P911.DE', name: 'Porsche AG' },
  { symbol: 'PAH3.DE', name: 'Porsche SE' },
  { symbol: 'QIA.DE', name: 'Qiagen' },
  { symbol: 'RHM.DE', name: 'Rheinmetall' },
  { symbol: 'RWE.DE', name: 'RWE' },
  { symbol: 'SAP.DE', name: 'SAP' },
  { symbol: 'SRT3.DE', name: 'Sartorius' },
  { symbol: 'SHL.DE', name: 'Siemens Healthineers' },
  { symbol: 'ENR.DE', name: 'Siemens Energy' },
  { symbol: 'SIE.DE', name: 'Siemens' },
  { symbol: 'SY1.DE', name: 'Symrise' },
  { symbol: 'VNA.DE', name: 'Vonovia' },
  { symbol: 'VOW3.DE', name: 'Volkswagen', terms: ['Volkswagen', 'VW'] },
  { symbol: 'ZAL.DE', name: 'Zalando' },
];

export interface Quote {
  symbol: string;
  name: string;
  changePct: number;
  ts: string; // ISO time of the latest price
}

/** Change of the latest price vs. the previous close. Null unless the price is from today (Berlin) and the previous close is known. */
export function quoteOf(sym: OpenSymbol, chart: ChartData | null, today: string, timeZone = 'Europe/Berlin'): Quote | null {
  if (!chart?.prevClose || !chart.points.length) return null;
  const last = chart.points[chart.points.length - 1];
  if (isoDay(parts(new Date(last.ts), timeZone)) !== today) return null;
  return { symbol: sym.symbol, name: sym.name, changePct: ((last.price - chart.prevClose) / chart.prevClose) * 100, ts: last.ts };
}

/** The biggest winners and losers (at most `n` each), only moves of at least `min` percent. */
export function pickMovers(quotes: Quote[], n = 3, min = 0.5): { gainers: Quote[]; losers: Quote[] } {
  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: sorted.filter((q) => q.changePct >= min).slice(0, n),
    losers: sorted.filter((q) => q.changePct <= -min).reverse().slice(0, n),
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word pattern for the names a company goes by in news texts. */
function nameRegex(symbol: string, name: string): RegExp {
  const list = OPEN_STOCKS.find((s) => s.symbol === symbol)?.terms ?? [name];
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'u');
}

/** "Keine Meldung liegt vor"-style sentences are not reasons. */
const NO_REASON = /nicht vor|keine (?:konkrete|passende|entsprechende)?\s*(?:meldung|information|angabe)|unbekannt|nicht bekannt|kein grund|nicht erkennbar/i;

/** News that name one of the movers (whole words in title or summary), so the reason can be found even if the item is not among the top ones. */
export function newsAbout(movers: Quote[], all: NewsInput[], perMover = 3): NewsInput[] {
  const out: NewsInput[] = [];
  const seen = new Set<number>();
  for (const m of movers) {
    const re = nameRegex(m.symbol, m.name);
    let n = 0;
    for (const item of all) {
      if (n >= perMover) break;
      if (seen.has(item.id) || !re.test(`${item.title} ${item.summary ?? ''}`)) continue;
      seen.add(item.id);
      out.push(item);
      n++;
    }
  }
  return out;
}

export interface OpenMover {
  name: string;
  changePct: number;
  reason: string | null;
  source: { name: string; url: string } | null;
}

export interface MarketOpenContent {
  version: 1;
  day: string;
  generatedAt: string;
  asOf: string; // time of the newest price
  headline: string | null;
  text: string | null;
  indices: { name: string; changePct: number }[];
  gainers: OpenMover[];
  losers: OpenMover[];
  ai: boolean;
}

export function openSystem(rules: string): string {
  return `Du schreibst für einen privaten Tagesüberblick das kurze Markt-Update kurz nach Handelsstart in Frankfurt (Xetra, etwa 30 Minuten nach der Eröffnung), auf Deutsch.
Du bekommst die aktuellen Indexstände ("indizes", Veränderung zum Vortagesschluss in Prozent, die US-Futures zeigen die Stimmung vor dem US-Handel), die größten Gewinner und Verlierer unter großen deutschen Werten ("bewegung") und aktuelle Meldungen.
Gib zurück:
- headline: ein Satz, höchstens 100 Zeichen, die Lage in Frankfurt.
- text: 2 bis 3 Sätze, höchstens 420 Zeichen: Wie stehen die Indizes, was fällt auf, was bewegt laut den Meldungen den Markt. Zahlen nennst du nur aus "indizes" und "bewegung".
- reasons: pro Gewinner oder Verlierer höchstens ein Eintrag mit symbol, reason (ein Satz, höchstens 160 Zeichen, laut Meldung) und item_id. Nur wenn eine Meldung die Firma ausdrücklich nennt und die Kursbewegung erklären kann. Gibt es keine passende Meldung, lässt du den Eintrag weg. Einen Grund erfindest du nie.
${rules}
Ausnahme zur Sprache: Dieses Update ist immer auf Deutsch.`;
}

export function openUser(opts: {
  time: string;
  indices: { name: string; changePct: number }[];
  gainers: Quote[];
  losers: Quote[];
  news: NewsInput[];
}): string {
  const r = (v: number) => Number(v.toFixed(2));
  const lines = [
    JSON.stringify({ uhrzeit: opts.time }),
    ...opts.indices.map((i) => JSON.stringify({ indizes: i.name, veraenderung_prozent: r(i.changePct) })),
    ...opts.gainers.map((q) => JSON.stringify({ bewegung: 'Gewinner', symbol: q.symbol, name: q.name, veraenderung_prozent: r(q.changePct) })),
    ...opts.losers.map((q) => JSON.stringify({ bewegung: 'Verlierer', symbol: q.symbol, name: q.name, veraenderung_prozent: r(q.changePct) })),
    ...opts.news.map((n) => JSON.stringify({ id: n.id, quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null, wichtigkeit: n.importance })),
  ];
  return `Daten (eine JSON-Zeile pro Eintrag):\n${lines.join('\n')}`;
}

export const OPEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'text', 'reasons'],
  properties: {
    headline: { type: 'string' },
    text: { type: 'string' },
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'reason', 'item_id'],
        properties: { symbol: { type: 'string' }, reason: { type: 'string' }, item_id: { type: 'integer' } },
      },
    },
  },
} as const;

export interface ParsedOpen {
  headline: string;
  text: string;
  reasons: Map<string, { reason: string; source: { name: string; url: string } }>;
}

/** Validates the AI answer: headline and text must exist; a reason counts only for a real mover and a real news item. Null if unusable. */
export function parseOpen(raw: unknown, movers: Quote[], offered: NewsInput[]): ParsedOpen | null {
  const r = raw as { headline?: unknown; text?: unknown; reasons?: { symbol?: unknown; reason?: unknown; item_id?: unknown }[] } | null;
  const headline = typeof r?.headline === 'string' ? r.headline.trim().slice(0, 140) : '';
  const text = typeof r?.text === 'string' ? r.text.trim().slice(0, 600) : '';
  if (!headline || !text) return null;
  const known = new Map(movers.map((m) => [m.symbol, m]));
  const byId = new Map(offered.map((n) => [n.id, n]));
  const reasons: ParsedOpen['reasons'] = new Map();
  for (const x of Array.isArray(r?.reasons) ? r.reasons : []) {
    const symbol = typeof x.symbol === 'string' ? x.symbol : '';
    const reason = typeof x.reason === 'string' ? x.reason.trim().slice(0, 200) : '';
    const item = byId.get(Number(x.item_id));
    const mover = known.get(symbol);
    if (!mover || !reason || !item || reasons.has(symbol) || NO_REASON.test(reason)) continue;
    // The linked news must name the company itself, otherwise it explains nothing about this share.
    if (!nameRegex(symbol, mover.name).test(`${item.title} ${item.summary ?? ''}`)) continue;
    reasons.set(symbol, { reason, source: { name: item.source, url: item.url } });
  }
  return { headline, text, reasons };
}

/** Builds the stored content from the numbers and, if there is one, the parsed AI answer. */
export function buildOpen(opts: {
  day: string;
  now: Date;
  asOf: string;
  indices: { name: string; changePct: number }[];
  gainers: Quote[];
  losers: Quote[];
  ai: ParsedOpen | null;
}): MarketOpenContent {
  const mover = (q: Quote): OpenMover => {
    const r = opts.ai?.reasons.get(q.symbol);
    return { name: q.name, changePct: Number(q.changePct.toFixed(2)), reason: r?.reason ?? null, source: r?.source ?? null };
  };
  return {
    version: 1,
    day: opts.day,
    generatedAt: opts.now.toISOString(),
    asOf: opts.asOf,
    headline: opts.ai?.headline ?? null,
    text: opts.ai?.text ?? null,
    indices: opts.indices.map((i) => ({ name: i.name, changePct: Number(i.changePct.toFixed(2)) })),
    gainers: opts.gainers.map(mover),
    losers: opts.losers.map(mover),
    ai: !!opts.ai,
  };
}
