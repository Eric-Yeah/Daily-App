import { describe, expect, it } from 'vitest';
import { storedDetail, toNewsDetail } from '../data/live';
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

  const summary = 'Erster Absatz.\n\nZweiter Absatz.';
  it('a stored summary comes back with the news, including the conclusion', () => {
    expect(storedDetail({ status: 'ok', summary, conclusion: ' Das ist das Fazit. ' })).toMatchObject({
      status: 'ok',
      paragraphs: ['Erster Absatz.', 'Zweiter Absatz.'],
      conclusion: 'Das ist das Fazit.',
    });
    expect(storedDetail({ status: 'ok', summary, conclusion: null })).toMatchObject({ status: 'ok', conclusion: null });
  });
  it('stored "not possible" results stay final, broken rows are asked for again', () => {
    expect(storedDetail({ status: 'no_text', summary: null, conclusion: null })).toEqual({ status: 'no_text' });
    expect(storedDetail({ status: 'short', summary: null, conclusion: null })).toEqual({ status: 'short' });
    expect(storedDetail({ status: 'ok', summary: '  ', conclusion: null })).toBeUndefined();
    expect(storedDetail(null)).toBeUndefined();
  });
  it('answers of the Edge Function map to the same shape', () => {
    expect(toNewsDetail('ok', summary, undefined)).toMatchObject({ status: 'ok', conclusion: null });
    expect(toNewsDetail('budget', undefined, undefined)).toEqual({ status: 'budget' });
    expect(toNewsDetail('whatever', undefined, undefined)).toEqual({ status: 'error' });
  });
});
