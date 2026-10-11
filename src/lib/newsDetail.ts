import type { NewsDetail } from '../data/live';

type Failed = Exclude<NewsDetail, { status: 'ok' }>['status'];

const MESSAGES: Record<Failed, string> = {
  no_text: 'Der Artikel ist hinter einer Bezahlschranke oder nicht frei lesbar. Ohne den Artikeltext gibt es keine ausführliche Fassung.',
  short: 'Der Artikel ist kurz, die Kurzfassung oben deckt ihn schon ab.',
  unreachable: 'Die Seite der Quelle war gerade nicht erreichbar. Versuch es später nochmal.',
  budget: 'Das KI-Budget für diesen Monat ist aufgebraucht. Unter „Mehr → KI-Zusammenfassungen“ kannst du es erhöhen.',
  no_key: 'Die KI ist noch nicht eingerichtet (Schlüssel fehlt).',
  error: 'Die ausführliche Fassung klappt gerade nicht. Versuch es später nochmal.',
};

export const detailMessage = (status: Failed): string => MESSAGES[status];

/** A failed attempt is final if retrying cannot help (paywall, short article); the button then disappears. */
export const detailIsFinal = (status: Failed): boolean => status === 'no_text' || status === 'short';

/** Numeric ids belong to stored news items; demo and mock items cannot be summarised. */
export const canSummarise = (id: string): boolean => /^\d+$/.test(id);
