// Live blog for the afternoon: which news to offer the AI, the prompt, and validation of its answer.
// Pure, also used in tests. The AI only sees headlines, short summaries and live index moves from our own data.
import type { NewsInput } from './briefing.ts';
import type { WrapSource } from './wrap.ts';

export interface LiveEntry {
  headline: string;
  body: string;
  importance: number;
  sources: WrapSource[];
  itemIds: number[];
}

/** Master switch: while false, daily-news writes no live-blog entries and spends nothing on them. Keep in sync with src/lib/features.ts. */
export const LIVE_BLOG_ENABLED = false;

/** The live blog is written from 10:30 until 22:59 Berlin time (hour and minute of the Berlin wall clock). */
export const LIVE_FROM_MINUTE = 10 * 60 + 30;
export const LIVE_UNTIL_MINUTE = 23 * 60 - 1;
export const liveBlogActive = (hour: number, minute: number): boolean => hour * 60 + minute >= LIVE_FROM_MINUTE && hour * 60 + minute <= LIVE_UNTIL_MINUTE;

/**
 * News to offer the AI for a live-blog entry: not covered yet and not already rated unimportant (1 or 2).
 * Items without a rating yet are offered too; the AI judges them from title and teaser.
 * Central bank news first, then the most important, depot-related and newest.
 */
export function liveCandidates(news: NewsInput[], covered: Set<number>, max = 12): NewsInput[] {
  return news
    .filter((n) => !covered.has(n.id) && (n.official || n.importance === null || n.importance >= 3))
    .sort(
      (a, b) =>
        Number(b.official) - Number(a.official) ||
        (b.importance ?? 3) - (a.importance ?? 3) ||
        b.positions - a.positions ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )
    .slice(0, max);
}

export function liveSystem(rules: string): string {
  return `Du führst einen Live-Blog zum Börsennachmittag (Ticker-Stil, auf Deutsch) für einen privaten Tagesüberblick.
Du bekommst neue Meldungen, bereits Gemeldetes und, wenn vorhanden, aktuelle Indexstände.
Schreibe 0 bis 3 neue Einträge. Nur was wirklich neu und für Anleger wichtig ist; ist nichts davon dabei, gib eine leere Liste zurück. Keine Wiederholung von bereits Gemeldetem.
Schreibe nie über fehlende Informationen (kein "Kurzfassung liegt nicht vor"). Gibt eine Meldung nur eine Überschrift her, formuliere nur einen kurzen Eintrag (ein Satz) oder lasse sie weg.
Jeder Eintrag: headline (höchstens 90 Zeichen, nachrichtlich, kein Clickbait), text (2 bis 3 Sätze, höchstens 420 Zeichen), importance (1 bis 5), item_ids (die ids der Meldungen, auf die er sich stützt; mindestens eine).
Indexstände nennst du nur aus "indizes" (aktueller Stand und Veränderung zum Vortag, Verzögerung etwa 15 Minuten) und nur, wenn sie zum Eintrag passen.
${rules}
Ausnahme zur Sprache: Der Live-Blog ist immer auf Deutsch.`;
}

export function liveUser(opts: { time: string; indices: { name: string; changePct: number }[]; reported: string[]; news: NewsInput[] }): string {
  const lines = [
    JSON.stringify({ uhrzeit: opts.time }),
    ...opts.indices.map((i) => JSON.stringify({ indizes: i.name, veraenderung_prozent: Number(i.changePct.toFixed(2)) })),
    ...opts.reported.map((h) => JSON.stringify({ bereits_gemeldet: h })),
    ...opts.news.map((n) => JSON.stringify({ id: n.id, quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null, wichtigkeit: n.importance, betrifft_positionen: n.positions })),
  ];
  return `Daten (eine JSON-Zeile pro Eintrag):\n${lines.join('\n')}`;
}

export const LIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'text', 'importance', 'item_ids'],
        properties: {
          headline: { type: 'string' },
          text: { type: 'string' },
          importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          item_ids: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
} as const;

/** Validates the AI answer against the offered news: real ids only, linked sources, trimmed lengths, at most 3 entries. */
export function parseLive(raw: unknown, offered: NewsInput[]): LiveEntry[] {
  const list = (raw as { entries?: { headline?: unknown; text?: unknown; importance?: unknown; item_ids?: unknown }[] } | null)?.entries;
  if (!Array.isArray(list)) return [];
  const byId = new Map(offered.map((n) => [n.id, n]));
  const out: LiveEntry[] = [];
  for (const e of list.slice(0, 3)) {
    const headline = typeof e.headline === 'string' ? e.headline.trim().slice(0, 160) : '';
    const body = typeof e.text === 'string' ? e.text.trim().slice(0, 800) : '';
    const items = (Array.isArray(e.item_ids) ? e.item_ids : []).map((id) => byId.get(Number(id))).filter((n): n is NewsInput => !!n);
    if (!headline || !body || !items.length) continue;
    const seen = new Set<string>();
    const sources = items.filter((n) => !seen.has(n.url) && seen.add(n.url)).slice(0, 3).map((n) => ({ name: n.source, url: n.url }));
    out.push({
      headline,
      body,
      importance: Math.min(5, Math.max(1, Math.round(Number(e.importance) || 3))),
      sources,
      itemIds: [...new Set(items.map((n) => n.id))],
    });
  }
  return out;
}
