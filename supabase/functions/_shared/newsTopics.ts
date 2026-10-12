// Matches news to the topics of the depot positions. Pure, also used in tests.
// A topic matches if one of its search terms appears as a whole word in title or teaser.

/** Extra search terms for common topics (German and English). Unknown topics search for themselves. */
const SYNONYMS: Record<string, string[]> = {
  Welt: [
    'Weltwirtschaft', 'global economy', 'MSCI World', 'Weltbörsen', 'world stocks', 'Weltmarkt', 'Börsen', 'Aktienmärkte', 'Aktienmarkt', 'Anleger',
    'global markets', 'global stocks', 'stock market', 'stock markets', 'Wall Street', 'Dow Jones', 'Nikkei', 'DAX', 'Dax', 'Nasdaq', 'S&P 500', 'Zölle', 'Handelskrieg', 'tariffs', 'trade war',
  ],
  USA: [
    'USA', 'US-Wirtschaft', 'Wall Street', 'U.S. economy', 'US economy', 'S&P 500', 'Dow Jones', 'Nasdaq', 'Trump', 'US-Börse', 'US-Börsen', 'US-Notenbank', 'US-Regierung', 'US-Präsident',
    'Zölle', 'tariffs', 'Treasury', 'White House', 'Weißes Haus', 'Washington',
  ],
  'S&P 500': ['S&P 500', 'S&P500', 'Wall Street', 'US-Börse', 'US-Börsen', 'Dow Jones'],
  'Nasdaq 100': ['Nasdaq', 'Big Tech', 'Magnificent Seven', 'Wall Street'],
  Industrieländer: ['Industrieländer', 'Industriestaaten', 'G7', 'OECD', 'developed markets', 'Weltwirtschaft', 'Wall Street'],
  Europa: ['Europa', 'Eurozone', 'Euro-Raum', 'Euroraum', 'Europe', 'euro zone', 'eurozone', 'Stoxx', 'EU', 'EZB', 'ECB', 'Brüssel', 'Brussels', 'Frankreich', 'Italien', 'European', 'Bank of England'],
  Deutschland: [
    'Deutschland', 'deutsche Wirtschaft', 'Germany', 'German economy', 'DAX', 'Dax', 'MDax', 'Bundesregierung', 'Bundesbank', 'Bundestag', 'Merz', 'Ifo', 'ZEW', 'Börse Frankfurt', 'Frankfurter Börse',
  ],
  DAX: ['DAX', 'Dax', 'MDax', 'Frankfurter Börse', 'Börse Frankfurt'],
  Schwellenländer: [
    'Schwellenländer', 'Schwellenland', 'emerging markets', 'emerging market', 'Brasilien', 'Brazil', 'Südafrika', 'Mexiko', 'Türkei', 'Indonesien', 'Vietnam', 'Taiwan', 'Südkorea', 'Korea',
  ],
  China: ['China', 'chinesisch', 'Chinese', 'Peking', 'Beijing', 'Hongkong', 'Hong Kong', 'Hang Seng', 'Yuan', 'Xi Jinping', 'Shanghai'],
  Indien: ['Indien', 'India', 'indisch', 'Indian', 'Sensex', 'Nifty', 'Rupie'],
  Japan: ['Japan', 'japanisch', 'Japanese', 'Nikkei', 'Bank of Japan', 'Yen', 'Tokio', 'Tokyo'],
  Halbleiter: ['Halbleiter', 'Chip', 'Chips', 'Chiphersteller', 'semiconductor', 'semiconductors', 'chipmaker', 'Nvidia', 'TSMC', 'ASML', 'Infineon', 'AMD', 'Intel', 'Broadcom', 'Micron', 'Samsung'],
  Technologie: [
    'Technologie', 'Tech-Werte', 'Techwerte', 'tech stocks', 'technology stocks', 'Big Tech', 'Nasdaq', 'Apple', 'Microsoft', 'Google', 'Alphabet', 'Meta', 'Amazon', 'Tesla', 'Software', 'SAP', 'OpenAI',
  ],
  'KI und Robotik': [
    'künstliche Intelligenz', 'KI', 'artificial intelligence', 'AI', 'Robotik', 'robotics', 'ChatGPT', 'OpenAI', 'Anthropic', 'Nvidia', 'Rechenzentren', 'Rechenzentrum', 'data center', 'data centers', 'Roboter',
  ],
  'Erneuerbare Energien': [
    'erneuerbare Energien', 'Solar', 'Windkraft', 'renewable energy', 'clean energy', 'Photovoltaik', 'Wasserstoff', 'hydrogen', 'Energiewende', 'Windenergie', 'wind power', 'Vestas', 'Siemens Energy',
  ],
  Gesundheit: [
    'Pharma', 'Gesundheit', 'Biotech', 'healthcare', 'pharmaceutical', 'Medikament', 'Arzneimittel', 'FDA', 'Novo Nordisk', 'Pfizer', 'Roche', 'Novartis', 'Bayer', 'Impfstoff', 'Abnehmspritze', 'GLP-1',
  ],
  Dividenden: ['Dividende', 'Dividenden', 'dividend', 'dividends', 'Ausschüttung', 'Ausschüttungen'],
  Nebenwerte: ['Nebenwerte', 'small caps', 'small-cap', 'MDax', 'SDax', 'Mittelstand'],
  Gold: ['Gold', 'Goldpreis', 'gold price', 'Edelmetalle', 'Edelmetall', 'precious metals', 'Silber', 'Unze'],
  Anleihen: ['Anleihen', 'Anleihe', 'Rendite', 'Renditen', 'bond', 'bonds', 'Treasury', 'yields', 'Staatsanleihen', 'Bundesanleihen'],
  Zinsen: ['Zinsen', 'Zins', 'Leitzins', 'Zinsentscheid', 'Notenbank', 'Notenbanken', 'EZB', 'Fed', 'interest rate', 'interest rates', 'rate cut', 'rate hike', 'central bank', 'Federal Reserve', 'ECB', 'Inflation', 'Teuerung', 'Geldpolitik'],
  Immobilien: ['Immobilien', 'real estate', 'REIT', 'Immobilienmarkt', 'Mieten', 'Baufinanzierung', 'Hypothek', 'mortgage', 'housing'],
  Cybersicherheit: ['Cybersicherheit', 'Cyberangriff', 'cybersecurity', 'cyber attack', 'Hackerangriff', 'Datenleck', 'Ransomware', 'CrowdStrike'],
  Rüstung: ['Rüstung', 'Rüstungskonzern', 'defense stocks', 'defence', 'Rheinmetall', 'Verteidigung', 'Bundeswehr', 'NATO', 'Hensoldt', 'Renk'],
};

/** The topics Daily knows well (rich search terms); suggestions prefer these. */
export const KNOWN_TOPICS = Object.keys(SYNONYMS);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function termsFor(topic: string): string[] {
  const list = SYNONYMS[topic];
  return [...new Set([topic, ...(list ?? [])])].filter((t) => t.length >= 2);
}

const cache = new Map<string, RegExp>();
function regexFor(topic: string): RegExp {
  let re = cache.get(topic);
  if (!re) {
    // Short words (KI, AI, Fed, DAX, Gold) are matched case-sensitively, everything else case-insensitively.
    const parts = termsFor(topic).map((t) => (/^[A-Z][A-Za-z&]{1,3}$/.test(t) ? `(?-i:${escape(t)})` : escape(t)));
    re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
    cache.set(topic, re);
  }
  return re;
}

/** Topics (from the given list) that a text mentions. */
export function matchTopics(text: string, topics: string[]): string[] {
  return topics.filter((t) => {
    try {
      return regexFor(t).test(text);
    } catch {
      // Engines without inline flags: fall back to a plain case-insensitive search.
      return termsFor(t).some((term) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'iu').test(text));
    }
  });
}

/** topic → position ids */
export function topicIndex(positions: { id: string; topics: string[] }[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const p of positions) for (const t of p.topics) idx.set(t, [...(idx.get(t) ?? []), p.id]);
  return idx;
}

/** The most widely held topics first (for the limited GDELT searches). */
export function topTopics(idx: Map<string, string[]>, n: number): string[] {
  return [...idx.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, n).map(([t]) => t);
}

/** GDELT query for a topic: its terms in quotes, German or English sources. */
export function gdeltQuery(topic: string): string {
  const terms = termsFor(topic).slice(0, 4).map((t) => (/\s/.test(t) ? `"${t}"` : t));
  const any = terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0];
  return `${any} (sourcelang:german OR sourcelang:english)`;
}
