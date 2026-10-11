import { describe, expect, it } from 'vitest';
import { canSummarise, detailIsFinal, detailMessage } from './newsDetail';

describe('news detail', () => {
  it('only stored items (numeric ids) can be summarised', () => {
    expect(canSummarise('1234')).toBe(true);
    expect(canSummarise('n1')).toBe(false);
    expect(canSummarise('')).toBe(false);
  });
  it('paywall and short articles are final, errors can be retried', () => {
    expect(detailIsFinal('no_text')).toBe(true);
    expect(detailIsFinal('short')).toBe(true);
    for (const s of ['unreachable', 'budget', 'error'] as const) expect(detailIsFinal(s)).toBe(false);
  });
  it('the paywall message does not promise a longer version', () => {
    expect(detailMessage('no_text')).toMatch(/Bezahlschranke/);
    expect(detailMessage('no_text')).toMatch(/keine ausführliche Fassung/);
  });
});
