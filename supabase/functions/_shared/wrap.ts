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
  /** The three main drivers as short sentences (also used for "Was bewegt den Markt" and "Treiber des Tages"). */
  points: string[];
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

/** Morning and evening are the long read (about 5 to 7 minutes); the midday overview stays short. */
export const isLong = (kind: BriefingKind) => kind !== 'afternoon';

const SCOPE: Record<BriefingKind, string> = {
  morning: `Das ist der Morgenüberblick (wie ein "Guten Morgen"-Marktbericht einer Nachrichtenagentur):
1. Was ist seit gestern Abend passiert (US-Börsen, Asien, Notenbanken, Unternehmen)?
2. Wie sind die letzten Schlusskurse der Indizes?
3. Was steht heute an (Termine, Zahlen) und worauf achten die Märkte laut den Meldungen?`,
  afternoon: `Das ist der Mittagsüberblick: Was bewegt die Märkte seit dem Morgen, was kam neu dazu und was steht bis zum US-Handelsstart an?`,
  evening: `Das ist der Abendüberblick: Wie lief der Börsentag (Indizes), welche Meldungen haben ihn geprägt und was steht morgen an?`,
};

export function wrapSystem(kind: BriefingKind, rules: string): string {
  const size = isLong(kind)
    ? `Länge: Der Überblick soll in etwa 5 bis 7 Minuten zu lesen sein (rund 1.000 bis 1.300 Wörter insgesamt). Behandle die 6 bis 8 wirklich wichtigsten Themen ausführlich, das wichtigste zuerst, und lasse Unwichtiges weg.
Jeder Abschnitt: title (2 bis 4 Wörter, z. B. "Über Nacht", "Aktienmärkte", "Zinsen und Notenbanken", "Unternehmen", "Politik und Konjunktur", "Heute im Blick"), text (120 bis 180 Wörter, also 7 bis 10 Sätze in zusammenhängenden Absätzen: Was ist passiert, welche Einzelheiten und Zusammenhänge nennen die Meldungen, was bedeutet es für die Märkte; verbinde mehrere Meldungen zum selben Thema und nenne die Quellen im Text), source_ids (1 bis 4 ids der Meldungen, auf die sich der Abschnitt stützt).
Die Länge ist wichtig: Der Leser will wirklich 5 bis 7 Minuten lesen. Nutze dafür alle gelieferten Meldungen und Kurzfassungen und gehe auf Einzelheiten ein. Nur wenn der Stoff dafür wirklich nicht reicht, schreibe kürzer, ohne Füllwörter und ohne Dinge zu erfinden oder dich zu wiederholen.`
    : `Aufbau: 3 bis 5 Abschnitte.
Jeder Abschnitt: title (2 bis 4 Wörter), text (3 bis 4 Sätze, höchstens 600 Zeichen), source_ids (1 bis 3 ids der Meldungen, auf die sich der Abschnitt stützt).`;
  return `Du schreibst für einen privaten Tagesüberblick einen Marktüberblick auf Deutsch.
${SCOPE[kind]}

headline: ein Satz, höchstens 100 Zeichen, der wichtigste Punkt.
${size}
points: genau 3 kurze Sätze (je höchstens 200 Zeichen), die wichtigsten Treiber des Marktes, wichtigster zuerst.
Meldungen mit betrifft_positionen größer 0 betreffen die Positionen des Lesers und haben bei der Auswahl Vorrang; "wichtigkeit" (1 bis 5) zeigt, wie wichtig eine Meldung eingestuft wurde.
Indexstände und Veränderungen nennst du nur aus "indizes" und nennst dann den Tag des Schlusskurses (z. B. "DAX zum Freitagsschluss"). Am Wochenende oder bei geschlossener Börse sagst du das ausdrücklich.
Gibt es zu einem Thema keine Meldung, lässt du es weg. Du ergänzt keine Zahlen und keine Hintergründe, die nicht geliefert wurden.
${rules}
Ausnahme zur Sprache: Dieser Überblick ist immer auf Deutsch.`;
}

export function wrapUser(opts: { dayLabel: string; indices: IndexMove[]; events: { time: string; title: string }[]; news: NewsInput[] }): string {
  const lines = [
    JSON.stringify({ heute: opts.dayLabel }),
    ...opts.indices.map((i) => JSON.stringify({ indizes: i.name, schlusskurs_tag: i.day, veraenderung_prozent: i.changePct === null ? null : Number(i.changePct.toFixed(2)) })),
    ...opts.events.map((e) => JSON.stringify({ termin: e.title, wann: e.time })),
    ...opts.news.map((n) => JSON.stringify({ id: n.id, quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null, wichtigkeit: n.importance, betrifft_positionen: n.positions })),
  ];
  return `Daten (eine JSON-Zeile pro Eintrag):\n${lines.join('\n')}`;
}

export const WRAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'sections', 'points'],
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
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
  points?: unknown;
  sections?: { title?: unknown; text?: unknown; source_ids?: unknown }[];
}

/** Validates the AI answer: trims lengths, resolves source ids to real links, drops empty sections. Null if unusable. */
export function parseWrap(raw: unknown, news: NewsInput[], long = false): MarketWrap | null {
  const r = raw as RawWrap | null;
  const headline = typeof r?.headline === 'string' ? r.headline.trim().slice(0, 140) : '';
  if (!headline || !Array.isArray(r?.sections)) return null;
  const byId = new Map(news.map((n) => [n.id, n]));
  const sections: WrapSection[] = [];
  for (const s of r.sections.slice(0, long ? 9 : 5)) {
    const title = typeof s.title === 'string' ? s.title.trim().slice(0, 40) : '';
    const text = typeof s.text === 'string' ? s.text.trim().slice(0, long ? 1800 : 800) : '';
    if (!title || !text) continue;
    const ids = Array.isArray(s.source_ids) ? s.source_ids : [];
    const seen = new Set<string>();
    const sources = ids
      .map((id) => byId.get(Number(id)))
      .filter((n): n is NewsInput => !!n && !seen.has(n.url) && seen.add(n.url))
      .slice(0, long ? 4 : 3)
      .map((n) => ({ name: n.source, url: n.url }));
    sections.push({ title, text, sources });
  }
  const points = (Array.isArray(r.points) ? r.points : [])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .slice(0, 3)
    .map((p) => p.trim().slice(0, 260));
  return sections.length ? { headline, sections, points, ai: true } : null;
}

// ---------------------------------------------------------------------------
// Long overview (morning / evening): first a plan (headline, three points, 6 to 8 topics with their news),
// then one short call per topic that writes about 150 words from just that topic's news. One call for the
// whole text came out far too short; focused calls reliably reach the 5 to 7 minute reading time.
// ---------------------------------------------------------------------------

export interface WrapPlan {
  headline: string;
  points: string[];
  topics: { title: string; items: NewsInput[] }[];
}

export function planSystem(kind: BriefingKind, rules: string): string {
  return `Du planst für einen privaten Tagesüberblick auf Deutsch einen Marktüberblick, der später in 5 bis 7 Minuten lesbar sein soll.
${SCOPE[kind]}

Wähle 7 bis 9 Themen aus den Meldungen (mindestens 6, sofern die Meldungen dafür reichen), das wichtigste zuerst, und lasse Unwichtiges weg. Ein Thema bündelt mehrere Meldungen zum selben Sachverhalt; auch Wirtschaftspolitik, Unternehmen, Rohstoffe und Konjunktur sind eigene Themen. Ein Thema "Heute im Blick" mit den anstehenden Terminen gehört dazu, wenn Termine geliefert wurden.
Gib zurück:
- headline: ein Satz, höchstens 100 Zeichen, der wichtigste Punkt.
- points: genau 3 kurze Sätze (je höchstens 200 Zeichen), die wichtigsten Treiber des Marktes, wichtigster zuerst.
- topics: pro Thema title (2 bis 4 Wörter, z. B. "Über Nacht", "Aktienmärkte", "Zinsen und Notenbanken", "Unternehmen", "Politik und Konjunktur", "Heute im Blick") und item_ids (3 bis 8 ids der Meldungen, die dazu gehören; jede Meldung höchstens einem Thema zuordnen).
Meldungen mit betrifft_positionen größer 0 betreffen die Positionen des Lesers und haben bei der Auswahl Vorrang; "wichtigkeit" (1 bis 5) zeigt, wie wichtig eine Meldung eingestuft wurde.
Indexstände und Veränderungen nennst du nur aus "indizes" und nennst dann den Tag des Schlusskurses. Am Wochenende oder bei geschlossener Börse sagst du das ausdrücklich.
Du ergänzt nichts, was nicht geliefert wurde.
${rules}
Ausnahme zur Sprache: Dieser Überblick ist immer auf Deutsch.`;
}

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'points', 'topics'],
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'item_ids'],
        properties: { title: { type: 'string' }, item_ids: { type: 'array', items: { type: 'integer' } } },
      },
    },
  },
} as const;

/** Validates the plan: real news ids only, each news item in one topic, 3 points at most; null if unusable. */
export function parsePlan(raw: unknown, news: NewsInput[]): WrapPlan | null {
  const r = raw as { headline?: unknown; points?: unknown; topics?: { title?: unknown; item_ids?: unknown }[] } | null;
  const headline = typeof r?.headline === 'string' ? r.headline.trim().slice(0, 140) : '';
  if (!headline || !Array.isArray(r?.topics)) return null;
  const byId = new Map(news.map((n) => [n.id, n]));
  const used = new Set<number>();
  const topics: WrapPlan['topics'] = [];
  for (const t of r.topics.slice(0, 8)) {
    const title = typeof t.title === 'string' ? t.title.trim().slice(0, 40) : '';
    const items = (Array.isArray(t.item_ids) ? t.item_ids : [])
      .map((id) => byId.get(Number(id)))
      .filter((n): n is NewsInput => !!n && !used.has(n.id) && used.add(n.id))
      .slice(0, 8);
    if (title && items.length) topics.push({ title, items });
  }
  const points = (Array.isArray(r.points) ? r.points : [])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .slice(0, 3)
    .map((p) => p.trim().slice(0, 260));
  return topics.length ? { headline, points, topics } : null;
}

export function sectionSystem(rules: string): string {
  return `Du schreibst einen Abschnitt eines Marktüberblicks auf Deutsch für einen privaten Tagesüberblick.
Schreibe 130 bis 180 Wörter (7 bis 10 Sätze) in zusammenhängenden Absätzen zum genannten Thema, nur aus den gelieferten Meldungen: Was ist passiert, welche Einzelheiten und Zusammenhänge nennen die Meldungen, was bedeutet es laut den Quellen für die Märkte. Verbinde die Meldungen zum Thema, nenne die Quellen im Text (z. B. "laut Handelsblatt") und beginne nicht mit dem Titel des Abschnitts.
Indexstände nennst du nur aus "indizes" und nennst dann den Tag des Schlusskurses. Du ergänzt keine Zahlen und keine Hintergründe, die nicht geliefert wurden. Reicht der Stoff für die Länge nicht, schreibe kürzer statt etwas zu erfinden.
${rules}
Ausnahme zur Sprache: Dieser Abschnitt ist immer auf Deutsch.`;
}

export function sectionUser(opts: { dayLabel: string; title: string; indices: IndexMove[]; items: NewsInput[] }): string {
  const lines = [
    JSON.stringify({ heute: opts.dayLabel, thema: opts.title }),
    ...opts.indices.map((i) => JSON.stringify({ indizes: i.name, schlusskurs_tag: i.day, veraenderung_prozent: i.changePct === null ? null : Number(i.changePct.toFixed(2)) })),
    ...opts.items.map((n) => JSON.stringify({ quelle: n.source, titel: n.title, kurzfassung: n.summary ?? null })),
  ];
  return `Daten (eine JSON-Zeile pro Eintrag):\n${lines.join('\n')}`;
}

export const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string' } },
} as const;

/** Sources of a long section: distinct links of its news, up to 4. */
export function sectionSources(items: NewsInput[]): WrapSource[] {
  const seen = new Set<string>();
  return items.filter((n) => !seen.has(n.url) && seen.add(n.url)).slice(0, 4).map((n) => ({ name: n.source, url: n.url }));
}
