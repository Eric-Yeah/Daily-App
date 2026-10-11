// Topic tags per position (used for the news search from M5 on).
// Rule-based suggestions from the fund name; an AI suggestion follows in M5. Always editable.

const RULES: [RegExp, string[]][] = [
  [/msci\s*world|ftse\s*(all[- ]?world|developed)|global|welt/i, ['Welt', 'USA', 'Industrieländer']],
  [/acwi|all[- ]?country|all[- ]?world/i, ['Welt', 'Schwellenländer']],
  [/s&p\s*500|sp500|s\+p/i, ['USA', 'S&P 500']],
  [/nasdaq/i, ['USA', 'Nasdaq 100', 'Technologie']],
  [/\busa?\b|united states|america|amerika/i, ['USA']],
  [/emerging|schwellenl|\bem\b/i, ['Schwellenländer']],
  [/stoxx|europe|europa|eurozone|euro area/i, ['Europa']],
  [/\bdax\b|germany|deutschland/i, ['Deutschland', 'DAX']],
  [/japan|nikkei|topix/i, ['Japan']],
  [/china|csi\s*300/i, ['China']],
  [/india|indien/i, ['Indien']],
  [/semiconductor|halbleiter|chip/i, ['Halbleiter', 'Technologie']],
  [/info(rmation)?\s*tech|technology|technologie|\btech\b/i, ['Technologie']],
  [/clean\s*energy|renewable|erneuerbar|solar|wind/i, ['Erneuerbare Energien']],
  [/health|gesundheit|pharma|biotech/i, ['Gesundheit']],
  [/dividend|dividende/i, ['Dividenden']],
  [/small\s*cap|nebenwerte/i, ['Nebenwerte']],
  [/gold/i, ['Gold']],
  [/bond|anleihe|treasury|aggregate|govt|government/i, ['Anleihen', 'Zinsen']],
  [/real\s*estate|reit|immobilien/i, ['Immobilien']],
  [/robot|automation|\bai\b|artificial intelligence|künstliche intelligenz/i, ['KI und Robotik', 'Technologie']],
  [/cyber\s*security/i, ['Cybersicherheit', 'Technologie']],
  [/defen[cs]e|rüstung|aerospace/i, ['Rüstung']],
];

/** Suggested topics for a fund name (unique, in rule order). */
export function suggestTopics(name: string): string[] {
  const out: string[] = [];
  for (const [re, topics] of RULES) if (re.test(name)) for (const t of topics) if (!out.includes(t)) out.push(t);
  return out.slice(0, 8);
}

/** Cleans user input: trims, removes markup characters, limits length and count, no duplicates. */
export function cleanTopics(topics: string[]): string[] {
  const out: string[] = [];
  for (const raw of topics) {
    const t = raw.replace(/[<>{}"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 12);
}

/** Group suggestion from topics, for new positions. */
export function suggestGroupName(topics: string[]): string | null {
  if (topics.includes('Welt')) return 'Welt breit';
  if (topics.includes('Schwellenländer')) return 'Schwellenländer';
  if (topics.includes('USA')) return 'USA';
  if (topics.includes('Europa') || topics.includes('Deutschland')) return 'Europa';
  if (topics.length) return 'Branchen und Themen';
  return null;
}

export const DEFAULT_GROUPS: { name: string; color: string }[] = [
  { name: 'Welt breit', color: '#8DB8FF' },
  { name: 'USA', color: '#6FDCAA' },
  { name: 'Europa', color: '#B5D2FF' },
  { name: 'Schwellenländer', color: '#FFC983' },
  { name: 'Branchen und Themen', color: '#D7A6FF' },
];
