const WORDS_PER_MINUTE = 200;

/** Reading time in minutes (at least 1) for a headline and sections of text. */
export function readingMinutes(headline: string, sections: { title: string; text: string }[]): number {
  const words = [headline, ...sections.map((s) => `${s.title} ${s.text}`)].join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
