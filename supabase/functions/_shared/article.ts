// Reading an article page for the longer AI summary ("Ausführlich"). Pure functions, also used in tests.
// Daily never works around a paywall: if the page marks the article as not free, or only a teaser is readable,
// there is no longer version (instead of padding a headline with guesses).
import { plainText } from './rss.ts';

export interface Extracted {
  text: string;
  /** The page itself says the article is not freely accessible (schema.org isAccessibleForFree = false). */
  paywall: boolean;
}

export type DetailStatus = 'ok' | 'no_text' | 'short';

/** Below this many characters there is no readable article (paywall teaser, page built by script, blocked). */
export const MIN_READABLE = 400;
/** Below this the article is short enough that the normal short summary covers it. */
export const MIN_LONG = 1200;
/** At most this much of the article goes to the AI (about 3,000 tokens) to keep the cost per article tiny. */
export const MAX_ARTICLE_CHARS = 12_000;
/** Longest summary we keep: about 300 words, 2 minutes of reading. */
export const MAX_SUMMARY_CHARS = 2_800;
export const MIN_SUMMARY_WORDS = 30;

/** Only public https pages by name; no IP addresses, no local or internal hosts. */
export function isFetchableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.port) return false;
    const h = u.hostname.toLowerCase();
    if (h.includes(':') || /^[\d.]+$/.test(h)) return false; // IPv6 / IPv4 literal
    return h.includes('.') && !/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(h);
  } catch {
    return false;
  }
}

function notFree(v: unknown): boolean {
  return v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'false');
}

function isArticleType(t: unknown): boolean {
  return (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && /Article|Posting/i.test(x));
}

/** Walks JSON-LD: the article body (if the page ships one) and whether any article part is marked as not free. */
function fromJsonLd(html: string): { body: string; paywall: boolean } {
  let body = '';
  let paywall = false;
  const walk = (node: unknown, inArticle: boolean) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inArticle));
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const article = inArticle || isArticleType(o['@type']);
    if (article && notFree(o.isAccessibleForFree)) paywall = true;
    if (article && typeof o.articleBody === 'string' && o.articleBody.length > body.length) body = o.articleBody;
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, article);
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()), false);
    } catch {
      // not valid JSON: ignore this block
    }
  }
  return { body: plainText(body), paywall };
}

const BOILERPLATE = /^(Anzeige|Werbung|Mehr zum Thema|Lesen Sie auch|Lesen Sie mehr|Advertisement|Related:?|Read more|Sign up|Newsletter)\b/i;

/** The readable article text of an HTML page: JSON-LD body or the paragraphs of the article element, whichever is longer. */
export function extractArticle(html: string): Extracted {
  const ld = fromJsonLd(html);
  const cleaned = html.replace(/<(script|style|noscript|template|svg|nav|header|footer|aside|form|figure|iframe|button)\b[\s\S]*?<\/\1>/gi, ' ');
  const articles = [...cleaned.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]);
  const paragraphsOf = (region: string) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of region.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const p = plainText(m[1]);
      if (p.length >= 40 && !BOILERPLATE.test(p) && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    return out.join('\n\n');
  };
  const fromHtml = articles.map(paragraphsOf).reduce((best, t) => (t.length > best.length ? t : best), '') || paragraphsOf(cleaned);
  const text = (ld.body.length > fromHtml.length ? ld.body : fromHtml).trim();
  return { text: cut(text, MAX_ARTICLE_CHARS), paywall: ld.paywall };
}

/** Cuts at a word boundary. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  return head.slice(0, Math.max(head.lastIndexOf(' '), max - 40)).trimEnd();
}

export function classifyArticle(x: Extracted): DetailStatus {
  if (x.paywall || x.text.length < MIN_READABLE) return 'no_text';
  return x.text.length < MIN_LONG ? 'short' : 'ok';
}

export const DETAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'conclusion'],
  properties: { summary: { type: 'string' }, conclusion: { type: 'string' } },
} as const;

/** Longest conclusion we keep: 3 sentences. */
export const MAX_CONCLUSION_SENTENCES = 3;
export const MAX_CONCLUSION_CHARS = 500;

export function detailSystem(rules: string): string {
  return `Du fasst einen Wirtschafts- oder Börsenartikel für einen privaten Tagesüberblick ausführlicher zusammen.
Länge: etwa ein Drittel bis die Hälfte des Artikels, mindestens 100 und höchstens 300 Wörter (1 bis 2 Minuten Lesezeit). Ist der Artikel kürzer, fasse entsprechend kürzer.
Aufbau: 2 bis 4 kurze Absätze, getrennt durch eine Leerzeile, das Wichtigste zuerst. Mit eigenen Worten, keine längeren wörtlichen Zitate. Namen, Zahlen und Daten nur so, wie sie im Artikel stehen.
Zusätzlich conclusion = ein eigenes Fazit mit höchstens 3 Sätzen: Was ist die Kernaussage und wie ist sie einzuordnen? Nennt die Nachricht "Themen deines Depots", beschreibe vorsichtig ("könnte", "möglicherweise"), über welchen Zusammenhang die Meldung diese Themen berühren kann. Beschreibe nur mögliche Zusammenhänge, sage keine Kursrichtung, keinen Zeitpunkt und keine Handlung voraus und nenne keine Positionen, nur die Themen. Sind keine Themen genannt, schreibe kurz, dass kein direkter Bezug zum Depot erkennbar ist.
${rules}`;
}

/** `depot`: the topics of the owner's positions that occur in the article (never names, amounts or ISINs). */
export function detailUser(item: { title: string; source: string; lang: string | null }, text: string, depot: { topics: string[]; positions: number } = { topics: [], positions: 0 }): string {
  const themes = depot.topics.length ? `${depot.topics.join(', ')} (betrifft ${depot.positions} ${depot.positions === 1 ? 'Position' : 'Positionen'})` : 'keine';
  return `Titel: ${item.title}\nQuelle: ${item.source}\nSprache: ${item.lang ?? 'unbekannt'}\nThemen deines Depots, die im Artikel vorkommen: ${themes}\n\n<artikel>\n${text}\n</artikel>`;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The AI answer as clean paragraphs (max. about 300 words), or null if it is unusable. */
export function parseDetail(data: unknown): string | null {
  const raw = (data as { summary?: unknown } | null)?.summary;
  if (typeof raw !== 'string') return null;
  const text = raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
  if (words(text) < MIN_SUMMARY_WORDS) return null;
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  // Too long: keep whole sentences.
  const head = text.slice(0, MAX_SUMMARY_CHARS);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'));
  return end > MAX_SUMMARY_CHARS / 2 ? head.slice(0, end + 1) : head.trimEnd();
}

/** The conclusion: at most 3 whole sentences, or null if the AI gave nothing usable (the summary is still shown). */
export function parseConclusion(data: unknown): string | null {
  const raw = (data as { conclusion?: unknown } | null)?.conclusion;
  if (typeof raw !== 'string') return null;
  const flat = raw.replace(/\s+/g, ' ').trim();
  const sentences = flat.match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((x) => x.trim()) ?? [];
  const kept = (sentences.length ? sentences : [flat]).slice(0, MAX_CONCLUSION_SENTENCES).join(' ');
  if (kept.length < 20) return null;
  return kept.length <= MAX_CONCLUSION_CHARS ? kept : null;
}
