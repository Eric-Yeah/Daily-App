// Market overview ("Marktüberblick"): input and output handling for the AI-written morning / midday / evening wrap.
// Pure, also used in tests. The AI only sees headlines, short summaries, index moves and dates from our own data.
import type { BriefingKind, NewsInput } from './briefing.ts';

export interface WrapSource {
  name: string;
  url: string;
}

export interface WrapSection {
  title: string;
  text: string;
  sources: WrapSource[];
}

export interface MarketWrap {
  headline: string;
  sections: WrapSection[];
  ai: true;
}

export interface IndexMove {
  name: string;
  day: string; // YYYY-MM-DD of the latest close
  close: number;
  changePct: number | null; // vs. the close before; null if there is none
}

/** Latest close and change vs. the previous close per index, from daily close rows. */
export function indexMoves(rows: { symbol: string; day: string; close: number | string }[], names: Record<string, string>): IndexMove[] {
  const out: IndexMove[] = [];
  for (const [symbol, name] of Object.entries(names)) {
    const mine = rows
      .filter((r) => r.symbol === symbol)
      .map((r) => ({ day: r.day, close: Number(r.close) }))
      .filter((r) => r.close > 0)
      .sort((a, b) => b.day.localeCompare(a.day));
    if (!mine.length) continue;
    const [last, prev] = mine;
    out.push({ name, day: last.day, close: last.close, changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null });
  }
  return out;
}

const SCOPE: Record<BriefingKind, string> = {
  morning: `Das ist der Morgenüberblick (wie ein "Guten Morgen"-Marktbericht einer Nachrichtenagentur):
1. Was ist seit gestern Abend passiert (US-Börsen, Asien, Notenbanken, Unternehmen)?
2. Wie sind die letzten Schlusskurse der Indizes?
3. Was steht heute an (Termine, Zahlen) und worauf achten die Märkte laut den Meldungen?`,
  afternoon: `Das ist der Mittagsüberblick: Was bewegt die Märkte seit dem Morgen, was kam neu dazu und was steht bis zum US-Handelsstart an?`,
  evening: `Das ist der Abendüberblick: Wie lief der Börsentag (Indizes), welche Meldungen haben ihn geprägt und was steht morgen an?`,
};

export function wrapSystem(kind: BriefingKind, rules: string): string {
  return `Du schreibst für einen privaten Tagesüberblick einen kompakten Marktüberblick auf Deutsch.
${SCOPE[kind]}

Aufbau: headline (ein Satz, höchstens 100 Zeichen, der wichtigste Punkt) und 3 bis 5 Abschnitte.
Jeder Abschnitt: title (2 bis 4 Wörter, z. B. "Über Nacht", "Aktienmärkte", "Zinsen und Notenbanken", "Unternehmen", "Heute im Blick"), text (2 bis 3 Sätze, höchstens 380 Zeichen), source_ids (1 bis 3 ids der Meldungen, auf die sich der Abschnitt stützt).
Meldungen mit betrifft_positionen größer 0 betreffen die Positionen des Lesers und haben bei der Auswahl Vorrang.
Indexstände und Veränderungen nennst du nur aus "indizes" und nennst dann den Tag des Schlusskurses (z. B. "DAX zum Freitagsschluss"). Am Wochenende oder bei geschlossener Börse sagst du das ausdrücklich.
Gibt es zu einem Thema keine Meldung, lässt du den Abschnitt weg. Du ergänzt keine Zahlen und keine Hintergründe, die nicht geliefert wurden.
${rules}
Ausnahme zur Sprache: Dieser Überblick ist immer auf Deutsch.`;
}

export function wrapUser(opts: { dayLabel: string; indices: IndexMove[]; events: { time: string; title: string }[]; news: NewsInput[] }): string {
  const lines = [
    JSON.stringify({ heute: opts.dayLabel }),
    ...opts.indices.map((i) => JSON.stringify({ indizes: i.name, schlusskurs_tag: i.day, veraenderung_prozent: i.changePct === null ? null : Number(i.changePct.toFixed(2)) })),
    ...opts.events.map((e) => JSON.stringify({ termin: e.title, wann: e.time })),
    ...opts.news.map((n) => JSON.stringify({ id: n.id, quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null, betrifft_positionen: n.positions })),
  ];
  return `Daten (eine JSON-Zeile pro Eintrag):\n${lines.join('\n')}`;
}

export const WRAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'sections'],
  properties: {
    headline: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text', 'source_ids'],
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          source_ids: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
} as const;

interface RawWrap {
  headline?: unknown;
  sections?: { title?: unknown; text?: unknown; source_ids?: unknown }[];
}

/** Validates the AI answer: trims lengths, resolves source ids to real links, drops empty sections. Null if unusable. */
export function parseWrap(raw: unknown, news: NewsInput[]): MarketWrap | null {
  const r = raw as RawWrap | null;
  const headline = typeof r?.headline === 'string' ? r.headline.trim().slice(0, 140) : '';
  if (!headline || !Array.isArray(r?.sections)) return null;
  const byId = new Map(news.map((n) => [n.id, n]));
  const sections: WrapSection[] = [];
  for (const s of r.sections.slice(0, 5)) {
    const title = typeof s.title === 'string' ? s.title.trim().slice(0, 40) : '';
    const text = typeof s.text === 'string' ? s.text.trim().slice(0, 500) : '';
    if (!title || !text) continue;
    const ids = Array.isArray(s.source_ids) ? s.source_ids : [];
    const seen = new Set<string>();
    const sources = ids
      .map((id) => byId.get(Number(id)))
      .filter((n): n is NewsInput => !!n && !seen.has(n.url) && seen.add(n.url))
      .slice(0, 3)
      .map((n) => ({ name: n.source, url: n.url }));
    sections.push({ title, text, sources });
  }
  return sections.length ? { headline, sections, ai: true } : null;
}
