import { describe, expect, it } from 'vitest';
import { readTopicsAnswer } from './topicsAi';

describe('AI topic answer', () => {
  it('accepts one list per name and cleans the topics', () => {
    expect(readTopicsAnswer({ status: 'ok', topics: [['Welt', ' USA ', 'welt'], []] }, 2)).toEqual([['Welt', 'USA'], []]);
  });
  it('rejects failures and answers of the wrong size', () => {
    expect(readTopicsAnswer({ status: 'budget' }, 1)).toBeNull();
    expect(readTopicsAnswer({ status: 'ok', topics: [['Welt']] }, 2)).toBeNull();
    expect(readTopicsAnswer(null, 1)).toBeNull();
  });
  it('ignores entries that are not text', () => {
    expect(readTopicsAnswer({ status: 'ok', topics: [['Welt', 5, null], 'x'] }, 2)).toEqual([['Welt'], []]);
  });
});
