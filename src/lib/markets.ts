// Market categories for the news filter ("nach Märkten"). A news item belongs to every market whose terms
// appear as whole words in its title, summary or source. Pure, also used in tests.

export interface Market {
  key: string;
  label: string;
  terms: string[];
}

export const MARKETS: Market[] = [
  { key: 'de', label: 'Deutschland', terms: ['Deutschland', 'deutsche', 'deutschen', 'deutscher', 'Germany', 'German', 'DAX', 'MDAX', 'Bundesregierung', 'Bundestag', 'Bundesbank', 'Berlin'] },
  { key: 'eu', label: 'Europa', terms: ['Europa', 'europäische', 'Eurozone', 'Euroraum', 'Euro-Raum', 'Europe', 'European', 'Stoxx', 'EU', 'EZB', 'ECB', 'Frankreich', 'France', 'Italien', 'Italy', 'Großbritannien', 'Britain', 'UK', 'Bank of England'] },
  { key: 'us', label: 'USA', terms: ['USA', 'US', 'U.S.', 'Wall Street', 'Dow Jones', 'Nasdaq', 'S&P 500', 'Fed', 'Federal Reserve', 'Trump', 'Washington', 'Treasury', 'American', 'Amerika'] },
  { key: 'asia', label: 'Asien', terms: ['Asien', 'Asia', 'Asian', 'China', 'chinesische', 'Chinese', 'Peking', 'Beijing', 'Japan', 'japanische', 'Nikkei', 'Tokio', 'Tokyo', 'Indien', 'India', 'Südkorea', 'Korea', 'Taiwan', 'Hongkong', 'Hang Seng'] },
  { key: 'commodities', label: 'Rohstoffe', terms: ['Rohstoffe', 'commodities', 'Öl', 'Ölpreis', 'oil', 'crude', 'Brent', 'OPEC', 'Opec', 'Erdgas', 'natural gas', 'Gas', 'Gold', 'Silber', 'silver', 'Kupfer', 'copper', 'Energie', 'energy', 'Benzin', 'Diesel', 'diesel'] },
  { key: 'rates', label: 'Zinsen', terms: ['Zinsen', 'Zins', 'Leitzins', 'Zinsentscheid', 'Notenbank', 'Notenbanken', 'central bank', 'interest rate', 'interest rates', 'rate cut', 'Inflation', 'Anleihen', 'Anleihe', 'bond', 'bonds', 'yields', 'Rendite', 'Renditen', 'Fed', 'EZB', 'ECB', 'Bundesbank'] },
  { key: 'crypto', label: 'Krypto', terms: ['Bitcoin', 'Krypto', 'Kryptowährung', 'Kryptowährungen', 'crypto', 'cryptocurrency', 'Ethereum', 'Blockchain'] },
  { key: 'tech', label: 'Tech & KI', terms: ['KI', 'AI', 'künstliche Intelligenz', 'artificial intelligence', 'Nvidia', 'Apple', 'Microsoft', 'Google', 'Alphabet', 'Meta', 'Amazon', 'Tesla', 'OpenAI', 'Chip', 'Chips', 'Halbleiter', 'semiconductor', 'semiconductors', 'Software', 'tech', 'Technologie', 'Big Tech'] },
  { key: 'companies', label: 'Unternehmen', terms: ['Aktie', 'Aktien', 'shares', 'stock', 'stocks', 'Quartalszahlen', 'Quartal', 'earnings', 'Gewinn', 'Umsatz', 'revenue', 'profit', 'Übernahme', 'takeover', 'merger', 'acquisition', 'Dividende', 'Konzern', 'IPO', 'Börsengang'] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cache = new Map<string, RegExp>();
function regexFor(m: Market): RegExp {
  let re = cache.get(m.key);
  if (!re) {
    // Short all-caps words (KI, AI, EU, UK, US, Fed, DAX, Öl) are matched case-sensitively, everything else case-insensitively.
    const alternatives = m.terms.map((t) => (/^(?:[A-ZÄÖÜ][A-Za-zÄÖÜäöü&.]{1,3})$/.test(t) ? `(?-i:${escape(t)})` : escape(t)));
    re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
    cache.set(m.key, re);
  }
  return re;
}

/** Keys of the markets a text belongs to. */
export function marketsOf(text: string): string[] {
  return MARKETS.filter((m) => {
    try {
      return regexFor(m).test(text);
    } catch {
      // Engines without inline flags: plain case-insensitive search.
      return m.terms.some((t) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(t)}(?![\\p{L}\\p{N}])`, 'iu').test(text));
    }
  }).map((m) => m.key);
}
