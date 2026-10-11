import { describe, expect, it } from 'vitest';
import { shouldResync } from './resync';

describe('shouldResync', () => {
  it('allows the first reload', () => {
    expect(shouldResync(null, 1000)).toBe(true);
  });

  it('merges reloads that follow each other closely', () => {
    expect(shouldResync(1000, 1000 + 5_000)).toBe(false);
  });

  it('allows a reload after the minimum gap', () => {
    expect(shouldResync(1000, 1000 + 20_000)).toBe(true);
  });
});
