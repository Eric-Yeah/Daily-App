import { describe, expect, it } from 'vitest';
import { formatWeekday } from './format';
import {
  fromZonedWallTime,
  lastClosedTradingDay,
  minutesUntil,
  pickView,
  previousTradingDay,
  usSessionInZone,
  xetraStatus,
  zonedParts,
} from './time';

const opts = { timeZone: 'Europe/Berlin', tradingEnd: '17:30' };
// Helper: a Berlin wall-clock time in October 2026 (CEST, UTC+2).
const berlin = (iso: string) => new Date(`${iso}+02:00`);

describe('pickView', () => {
  it('picks the view by Berlin time', () => {
    expect(pickView(berlin('2026-10-12T07:00'), opts)).toBe('morning');
    expect(pickView(berlin('2026-10-12T11:59'), opts)).toBe('morning');
    expect(pickView(berlin('2026-10-12T12:00'), opts)).toBe('afternoon');
    expect(pickView(berlin('2026-10-12T17:29'), opts)).toBe('afternoon');
    expect(pickView(berlin('2026-10-12T17:30'), opts)).toBe('evening');
    expect(pickView(berlin('2026-10-12T23:00'), opts)).toBe('evening');
  });
  it('respects a custom trading end', () => {
    expect(pickView(berlin('2026-10-12T17:45'), { ...opts, tradingEnd: '22:00' })).toBe('afternoon');
  });
  it('handles winter time (CET, UTC+1)', () => {
    // 11:30 UTC on 2 Dec 2026 is 12:30 in Berlin.
    expect(pickView(new Date('2026-12-02T11:30:00Z'), opts)).toBe('afternoon');
    expect(zonedParts(new Date('2026-12-02T11:30:00Z'), 'Europe/Berlin').hour).toBe(12);
  });
});

describe('xetraStatus', () => {
  it('knows open, pre-market, closed and weekend', () => {
    expect(xetraStatus(berlin('2026-10-12T08:59'), opts)).toBe('pre');
    expect(xetraStatus(berlin('2026-10-12T09:00'), opts)).toBe('open');
    expect(xetraStatus(berlin('2026-10-12T17:30'), opts)).toBe('closed');
    expect(xetraStatus(berlin('2026-10-10T12:00'), opts)).toBe('holiday'); // Saturday
  });
  it('knows the Xetra holidays by default', () => {
    expect(xetraStatus(berlin('2026-12-24T12:00'), { tradingEnd: '17:30' })).toBe('holiday');
    expect(xetraStatus(berlin('2026-12-23T12:00'), { tradingEnd: '17:30' })).toBe('open');
  });
  it('treats listed holidays as closed', () => {
    expect(xetraStatus(berlin('2026-12-24T12:00'), { ...opts, holidays: ['2026-12-24'] })).toBe('holiday');
  });
});

describe('trading days', () => {
  it('finds the previous trading day across a weekend', () => {
    expect(formatWeekday(previousTradingDay(berlin('2026-10-12T14:32')), 'UTC')).toBe('Freitag');
    expect(formatWeekday(previousTradingDay(berlin('2026-10-13T14:32')), 'UTC')).toBe('Montag');
  });
  it('uses today once the session has ended', () => {
    expect(formatWeekday(lastClosedTradingDay(berlin('2026-10-12T07:00'), opts), 'UTC')).toBe('Freitag');
    expect(formatWeekday(lastClosedTradingDay(berlin('2026-10-12T18:00'), opts), 'UTC')).toBe('Montag');
    expect(formatWeekday(lastClosedTradingDay(berlin('2026-10-11T10:00'), opts), 'UTC')).toBe('Freitag');
  });
});

describe('countdowns', () => {
  it('counts minutes until the trading end', () => {
    expect(minutesUntil(berlin('2026-10-12T14:32'), '17:30', 'Europe/Berlin')).toBe(178);
  });
  it('maps the US session to Berlin time, including the DST gap weeks', () => {
    expect(usSessionInZone(berlin('2026-10-12T14:00'), 'Europe/Berlin')).toEqual({ open: '15:30', close: '22:00' });
    // 26 Oct – 1 Nov 2026: Europe is already on winter time, the US not yet.
    expect(usSessionInZone(new Date('2026-10-27T12:00:00Z'), 'Europe/Berlin')).toEqual({ open: '14:30', close: '21:00' });
  });
});

describe('fromZonedWallTime', () => {
  it('turns Berlin wall-clock time into an instant (summer and winter)', () => {
    expect(fromZonedWallTime('2026-10-12T14:32', 'Europe/Berlin')?.toISOString()).toBe('2026-10-12T12:32:00.000Z');
    expect(fromZonedWallTime('2026-12-02T12:30', 'Europe/Berlin')?.toISOString()).toBe('2026-12-02T11:30:00.000Z');
    expect(fromZonedWallTime('nope', 'Europe/Berlin')).toBeNull();
  });
});
