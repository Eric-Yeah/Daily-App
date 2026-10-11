// Filtering, searching and sorting of the news list (client side, on the items already loaded). Pure, also used in tests.
import type { LiveNews } from '../data/live';
import { marketsOf } from './markets';

export interface NewsFilter {
  query: string;
  markets: string[]; // market keys (OR)
  topic: string | null; // depot topic
  source: string | null;
  hours: 6 | 24 | 48;
  onlyDepot: boolean;
  onlyImportant: boolean; // importance 4 or 5
  onlyOfficial: boolean; // central banks and authorities
  sort: 'importance' | 'recent';
}

export const DEFAULT_FILTER: NewsFilter = {
  query: '',
  markets: [],
  topic: null,
  source: null,
  hours: 48,
  onlyDepot: false,
  onlyImportant: false,
  onlyOfficial: false,
  sort: 'importance',
};

/** Lower case without accents, so "oel" does not match but "Öl" and "ol" do (and "Zürich" = "zurich"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const marketCache = new WeakMap<LiveNews, string[]>();
export function marketsOfItem(n: LiveNews): string[] {
  let m = marketCache.get(n);
  if (!m) {
    m = marketsOf(`${n.title} ${n.summary}`);
    marketCache.set(n, m);
  }
  return m;
}

/** Most relevant first: importance, number of positions, then recency (same as the Today views). */
function byImportance(a: LiveNews, b: LiveNews): number {
  return (b.importance ?? 2) - (a.importance ?? 2) || b.positions - a.positions || b.publishedAt.getTime() - a.publishedAt.getTime();
}

const byRecent = (a: LiveNews, b: LiveNews) => b.publishedAt.getTime() - a.publishedAt.getTime();

export function applyFilter(items: LiveNews[], f: NewsFilter, now: Date): LiveNews[] {
  const since = now.getTime() - f.hours * 3600_000;
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  const out = items.filter((n) => {
    if (n.publishedAt.getTime() < since) return false;
    if (f.onlyDepot && !(n.positions > 0)) return false;
    if (f.onlyImportant && (n.importance ?? 0) < 4) return false;
    if (f.onlyOfficial && !n.official) return false;
    if (f.source && n.source !== f.source) return false;
    if (f.topic && !n.topics.includes(f.topic)) return false;
    if (f.markets.length) {
      const m = marketsOfItem(n);
      if (!f.markets.some((k) => m.includes(k))) return false;
    }
    if (words.length) {
      const hay = fold(`${n.title} ${n.summary} ${n.source} ${n.topics.join(' ')}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  return out.sort(f.sort === 'recent' ? byRecent : byImportance);
}

/** How many of the items belong to each market (for the chip counts). */
export function marketCounts(items: LiveNews[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of items) for (const k of marketsOfItem(n)) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}

/** Number of active filters (without the sort order), for the "Filter" button. */
export function activeCount(f: NewsFilter): number {
  return (
    (f.query.trim() ? 1 : 0) +
    f.markets.length +
    (f.topic ? 1 : 0) +
    (f.source ? 1 : 0) +
    (f.hours !== DEFAULT_FILTER.hours ? 1 : 0) +
    (f.onlyDepot ? 1 : 0) +
    (f.onlyImportant ? 1 : 0) +
    (f.onlyOfficial ? 1 : 0)
  );
}
