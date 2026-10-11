// Minimal RSS 2.0 / Atom reader (no DOM in Edge Functions). Pure, also used in tests.
// Only what Daily stores: title, link, teaser (plain text, short), time.

export interface FeedItem {
  title: string;
  url: string;
  teaser: string | null;
  publishedAt: Date | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Text content of a tag: CDATA unwrapped, markup removed, entities decoded, whitespace collapsed. */
export function plainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Entities first (feeds often escape their HTML), then strip tags.
  return decodeEntities(decodeEntities(unwrapped).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : null;
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const alt = links.find((a) => !/rel=["'](?!alternate)/i.test(a)) ?? links[0];
  return alt ? (/href=["']([^"']+)["']/i.exec(alt)?.[1] ?? null) : null;
}

export function shorten(text: string, max = 300): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd() + ' …';
}

/** Removes tracking parameters so the same article is stored once. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|wt_|xtor|ref$|cmpid|__twitter)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const out: FeedItem[] = [];
  for (const b of blocks) {
    const title = plainText(tag(b, 'title') ?? '');
    const rawLink = tag(b, 'link')?.trim() || atomLink(b) || tag(b, 'guid')?.trim() || '';
    const url = canonicalUrl(plainText(rawLink));
    if (!title || !url) continue;
    const desc = tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content');
    const teaser = desc ? shorten(plainText(desc)) : null;
    const when = tag(b, 'pubDate') ?? tag(b, 'updated') ?? tag(b, 'published') ?? tag(b, 'dc:date');
    const d = when ? new Date(plainText(when)) : null;
    out.push({ title: shorten(title, 380), url, teaser: teaser || null, publishedAt: d && !isNaN(d.getTime()) ? d : null });
  }
  return out;
}

/** GDELT DOC 2.0 "artlist" JSON → feed items (title, url, time; no teaser). */
export function parseGdelt(json: unknown): (FeedItem & { lang: 'de' | 'en' | null; source: string })[] {
  const arts = (json as { articles?: Record<string, string>[] })?.articles ?? [];
  return arts
    .map((a) => {
      const url = canonicalUrl(a.url ?? '');
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(a.seendate ?? '');
      const lang = a.language === 'German' ? 'de' : a.language === 'English' ? 'en' : null;
      return {
        title: shorten(plainText(a.title ?? ''), 380),
        url: url ?? '',
        teaser: null,
        publishedAt: m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null,
        lang,
        source: (a.domain ?? '').replace(/^www\./, '').slice(0, 100),
      };
    })
    .filter((a) => a.title && a.url && a.lang);
}
