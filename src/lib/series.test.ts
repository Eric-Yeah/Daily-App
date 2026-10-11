import { describe, expect, it } from 'vitest';
import { periodChanges, type PositionInput } from './portfolio';
import { depotHistory, depotIntraday, indexCurve, priceInfo, type DailyRow, type SnapRow } from './series';

// Invented example data. 2026-10-12 is a Monday; Berlin is UTC+2 then.
const TZ = 'Europe/Berlin';
const at = (hhmmBerlin: string, day = '2026-10-12') => {
  const [h, m] = hhmmBerlin.split(':').map(Number);
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h - 2, m)).toISOString();
};
const snap = (symbol: string, hhmm: string, price: number, day?: string): SnapRow => ({ symbol, ts: at(hhmm, day), price });
const close = (symbol: string, day: string, c: number): DailyRow => ({ symbol, day, close: c });

const daily = [
  close('A', '2025-12-30', 80),
  close('A', '2026-09-30', 90),
  close('A', '2026-10-08', 95),
  close('A', '2026-10-09', 100),
  close('B', '2026-10-09', 50),
];
const win = (hhmm: string) => ({ tz: TZ, now: new Date(at(hhmm)), start: '09:00', end: '17:30' });

describe('priceInfo', () => {
  it('uses the newest snapshot of a day without a stored close', () => {
    const r = priceInfo([snap('A', '09:00', 101), snap('A', '09:15', 102)], daily.filter((d) => d.symbol === 'A'), TZ, new Date(at('10:00')))!;
    expect(r.price.last).toBe(102);
    expect(r.price.prevClose).toBe(100);
    expect(r.lastDay).toBe('2026-10-12');
    expect(r.prevDay).toBe('2026-10-09');
    expect(r.price.yearStart).toBe(80); // last close of the previous year
    expect(r.price.monthStart).toBe(90); // last close before October
    expect(r.price.weekStart).toBe(100); // last close before Monday
  });

  it('ignores snapshots in the future (simulated time)', () => {
    const r = priceInfo([snap('A', '09:00', 101), snap('A', '15:00', 150)], daily.filter((d) => d.symbol === 'A'), TZ, new Date(at('10:00')))!;
    expect(r.price.last).toBe(101);
  });

  it('falls back to the latest close when the day is already closed', () => {
    const rows = [...daily.filter((d) => d.symbol === 'A'), close('A', '2026-10-12', 103)];
    const r = priceInfo([snap('A', '17:15', 102.9)], rows, TZ, new Date(at('18:00')))!;
    expect(r.price.last).toBe(103);
    expect(r.price.prevClose).toBe(100);
  });

  it('is null without a previous close or without data', () => {
    expect(priceInfo([snap('A', '10:00', 1)], [], TZ, new Date(at('11:00')))).toBeNull();
    expect(priceInfo([], [], TZ, new Date(at('11:00')))).toBeNull();
  });
});

describe('depotIntraday', () => {
  const held = [
    { symbol: 'A', quantity: 2 },
    { symbol: 'B', quantity: 4 },
  ];
  const snaps = [snap('A', '09:00', 101), snap('B', '09:00', 51), snap('A', '09:15', 102), snap('B', '09:30', 49)];

  it('sums quantity × price and carries the last price forward', () => {
    const r = depotIntraday(held, snaps, daily, win('10:00'))!;
    expect(r.prevClose).toBe(2 * 100 + 4 * 50);
    expect(r.points.map((p) => p.value)).toEqual([2 * 101 + 4 * 51, 2 * 102 + 4 * 51, 2 * 102 + 4 * 49]);
    expect(r.points.map((p) => p.minute)).toEqual([540, 555, 570]);
    expect(r.skipped).toBe(0);
    expect(r.prevDay).toBe('2026-10-09');
  });

  it('uses the previous close before a symbol has its first bar', () => {
    const r = depotIntraday(held, [snap('A', '09:00', 101), snap('B', '09:15', 51)], daily, win('10:00'))!;
    expect(r.points[0].value).toBe(2 * 101 + 4 * 50);
  });

  it('leaves out symbols without data and cuts at "now"', () => {
    const r = depotIntraday(held, [snap('A', '09:00', 101), snap('A', '12:00', 130)], daily, win('10:00'))!;
    expect(r.skipped).toBe(1);
    expect(r.prevClose).toBe(200);
    expect(r.points).toHaveLength(1);
  });

  it('is null without snapshots', () => {
    expect(depotIntraday(held, [], daily, win('10:00'))).toBeNull();
  });

  it('shows the newest earlier session on a closed day', () => {
    const r = depotIntraday([held[0]], [snap('A', '10:00', 99, '2026-10-09')], [close('A', '2026-10-08', 95)], {
      ...win('10:00'),
      now: new Date(at('10:00', '2026-10-10')),
    })!;
    expect(r.day).toBe('2026-10-09');
    expect(r.prevClose).toBe(190);
  });
});

describe('indexCurve', () => {
  it('rebases to 100 and reports the change', () => {
    const c = indexCurve([snap('X', '15:30', 1010), snap('X', '16:00', 1030)], [close('X', '2026-10-09', 1000)], {
      tz: TZ,
      now: new Date(at('17:00')),
      start: '15:30',
      end: '22:00',
    })!;
    expect(c.points.map((p) => p.value)).toEqual([101, 103]);
    expect(c.changePct).toBeCloseTo(3);
  });

  it('is null without a previous close', () => {
    expect(indexCurve([snap('X', '15:30', 1)], [], { tz: TZ, now: new Date(at('17:00')), start: '15:30', end: '22:00' })).toBeNull();
  });
});

describe('depotHistory', () => {
  it('sums daily values and carries closes over gaps', () => {
    const h = depotHistory(
      [
        { symbol: 'A', quantity: 1 },
        { symbol: 'B', quantity: 2 },
      ],
      daily,
      5,
      '2026-10-12',
    );
    expect(h).toEqual([{ day: '2026-10-09', value: 100 + 2 * 50 }]);
  });
  it('is empty when a symbol has no history', () => {
    expect(depotHistory([{ symbol: 'Z', quantity: 1 }], daily, 5, '2026-10-12')).toEqual([]);
  });
});

describe('periodChanges', () => {
  const pos = (price: PositionInput['price']): PositionInput => ({
    id: 'x', name: 'x', quantity: 10, costPerUnit: 1, groupId: null, lossThresholdPct: null, price,
  });
  it('compares the value now with the start values', () => {
    const r = periodChanges([pos({ last: 110, prevClose: 108, weekStart: 100, monthStart: 105, yearStart: 90 })]);
    expect(r.week).toEqual({ pct: 10, abs: 100 });
    expect(r.month!.pct).toBeCloseTo(4.76, 1);
    expect(r.year!.pct).toBeCloseTo(22.22, 1);
  });
  it('gives no partial sums', () => {
    const r = periodChanges([pos({ last: 110, prevClose: 108, weekStart: 100 }), pos({ last: 50, prevClose: 49 })]);
    expect(r.week).toBeNull();
  });
});
