import { describe, expect, it } from 'vitest';
import { readingMinutes } from './readingTime';

const words = (n: number) => Array.from({ length: n }, () => 'wort').join(' ');

describe('readingMinutes', () => {
  it('is at least one minute', () => {
    expect(readingMinutes('Kurz', [{ title: 'A', text: 'B' }])).toBe(1);
  });
  it('counts about 200 words per minute', () => {
    expect(readingMinutes('Titel', [{ title: 'T', text: words(1198) }])).toBe(6);
    expect(readingMinutes('Titel', [{ title: 'T', text: words(1400) }])).toBe(7);
  });
});
