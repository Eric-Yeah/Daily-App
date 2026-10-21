// Which stored news items get an AI summary in this run. Pure, also used in tests.

export interface SummaryCandidate {
  id: number;
  official: boolean;
  news_links: unknown[] | null;
}

/**
 * Items without a summary yet (`summarised` holds the ids that have one), most relevant first: items that touch a
 * position and official ones before general market news, of which only `generalMax` are taken; at most `max` in all.
 */
export function pickForSummary<T extends SummaryCandidate>(items: T[], summarised: ReadonlySet<number>, generalMax: number, max: number): T[] {
  const open = items
    .filter((n) => !summarised.has(n.id))
    .sort((a, b) => (b.news_links?.length ?? 0) - (a.news_links?.length ?? 0) || Number(b.official) - Number(a.official));
  const isRelated = (n: T) => n.official || !!n.news_links?.length;
  const related = open.filter(isRelated);
  const general = open.filter((n) => !isRelated(n)).slice(0, generalMax);
  return [...related, ...general].slice(0, max);
}
