import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatDateLong,
  formatDuration,
  formatEuro,
  formatNumber,
  formatPct,
  formatPctArrow,
  formatPositions,
  formatTime,
  MINUS,
  trend,
} from './format';

describe('formatEuro', () => {
  it('uses German grouping and a space before €', () => {
    expect(formatEuro(48215)).toBe('48.215 €');
    expect(formatEuro(5480, { signed: true })).toBe('+5.480 €');
    expect(formatEuro(1234.5, { decimals: 2 })).toBe('1.234,50 €');
  });
  it('uses the real minus sign', () => {
    expect(formatEuro(-201, { signed: true })).toBe(`${MINUS}201 €`);
    expect(formatEuro(-201)).toBe(`${MINUS}201 €`);
    expect(formatEuro(-201)).not.toContain('-');
  });
  it('can hide amounts', () => {
    expect(formatEuro(48215, { hidden: true })).toBe('•••• €');
  });
});

describe('formatPct', () => {
  it('formats with comma, sign and a space before %', () => {
    expect(formatPct(0.42, 2)).toBe('+0,42 %');
    expect(formatPct(-3.1, 1)).toBe(`${MINUS}3,1 %`);
    expect(formatPct(12.8, 1)).toBe('+12,8 %');
  });
  it('never shows a sign for values that round to zero', () => {
    expect(formatPct(-0.04, 1)).toBe('0,0 %');
    expect(formatPct(0.004, 2)).toBe('0,00 %');
    expect(trend(-0.04, 1)).toBe('flat');
  });
  it('adds the arrow so gains/losses are not shown by colour alone', () => {
    expect(formatPctArrow(0.42)).toBe('▲ +0,42 %');
    expect(formatPctArrow(-1.5)).toBe(`▼ ${MINUS}1,50 %`);
    expect(formatPctArrow(0)).toBe('0,00 %');
  });
});

describe('formatNumber', () => {
  it('rounds to the displayed precision', () => {
    expect(formatNumber(2.346, 2)).toBe('2,35');
    expect(formatNumber(-0.4, 0)).toBe('0');
  });
});

describe('dates and durations', () => {
  const d = new Date('2026-10-12T12:32:00Z'); // 14:32 in Berlin (CEST)
  it('formats time and long date in Berlin', () => {
    expect(formatTime(d, 'Europe/Berlin')).toBe('14:32');
    expect(formatDateLong(d, 'Europe/Berlin')).toBe('Montag, 12. Oktober');
  });
  it('formats durations and ages', () => {
    expect(formatDuration(178)).toBe('2 Std. 58 Min.');
    expect(formatDuration(58)).toBe('58 Min.');
    expect(formatDuration(120)).toBe('2 Std.');
    expect(formatAge(120)).toBe('vor 2 Std.');
    expect(formatAge(15)).toBe('vor 15 Min.');
    expect(formatAge(60 * 30)).toBe('vor 1 Tag');
    expect(formatAge(60 * 72)).toBe('vor 3 Tagen');
  });
  it('pluralises positions', () => {
    expect(formatPositions(1)).toBe('1 Position');
    expect(formatPositions(5)).toBe('5 Positionen');
  });
});
