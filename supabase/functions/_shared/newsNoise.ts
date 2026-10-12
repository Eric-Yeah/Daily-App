// Drops items that clearly are not market news (sport, celebrities, lifestyle, horoscopes, prize draws).
// Pure, also used in tests. Deliberately conservative: only whole words in the title and typical URL sections,
// so a real business story is never lost. Official sources (central banks) are never filtered.

const URL_SECTIONS = /\/(sport|sports|football|fussball|fußball|lifeandstyle|lifestyle|fashion|travel|reise|reisen|culture|kultur|film|music|musik|food|books|tv-and-radio|games|gaming|horoskop|horoscope|promi|panorama|stage|artanddesign)(\/|$)/i;

const TITLE_WORDS = [
  'Bundesliga', 'Champions League', 'Europa League', 'Fußball', 'Formel 1', 'Olympia', 'Tennis', 'Handball', 'Basketball', 'Eishockey', 'Wimbledon', 'Premier League', 'WM-Qualifikation', 'Tabellenführer',
  'Horoskop', 'Gewinnspiel', 'Rezept', 'Rezepte', 'Promi', 'Promis', 'Royals', 'Kreuzworträtsel', 'Sudoku', 'Tatort', 'Fernsehprogramm', 'TV-Tipp', 'Liveticker', 'Fotostrecke', 'Bildergalerie',
  'football', 'soccer', 'Premier League', 'horoscope', 'recipe', 'recipes', 'celebrity', 'celebrities', 'crossword', 'quiz', 'sweepstakes',
];
const TITLE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** True if the item is clearly not about markets, business or economy. */
export function isNoise(item: { title: string; url: string; official?: boolean }): boolean {
  if (item.official) return false;
  return TITLE_RE.test(item.title) || URL_SECTIONS.test(item.url);
}
