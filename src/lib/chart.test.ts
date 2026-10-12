import { describe, expect, it } from 'vitest';
import { nearestIndex, sessionChart, sparkline } from './chart';

describe('nearestIndex', () => {
  const pts = [{ x: 0 }, { x: 10 }, { x: 30 }, { x: 100 }];
  it('picks the closest point', () => {
    expect(nearestIndex(pts, -5)).toBe(0);
    expect(nearestIndex(pts, 4)).toBe(0);
    expect(nearestIndex(pts, 6)).toBe(1);
    expect(nearestIndex(pts, 21)).toBe(2);
    expect(nearestIndex(pts, 70)).toBe(3);
    expect(nearestIndex(pts, 500)).toBe(3);
  });
  it('prefers the earlier point on a tie and handles no points', () => {
    expect(nearestIndex(pts, 20)).toBe(1);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe('chart points', () => {
  it('returns one point per value for the sparkline', () => {
    const c = sparkline([1, 2, 3]);
    expect(c.xy).toHaveLength(3);
    expect(c.xy[0].x).toBe(0);
    expect(c.xy[2].x).toBe(320);
  });
  it('returns one point per sample for a session chart', () => {
    const c = sessionChart(
      [
        { minute: 540, value: 100 },
        { minute: 600, value: 102 },
      ],
      100,
      { start: '09:00', end: '17:30' },
      { height: 110, top: 22, bottom: 70 },
    );
    expect(c.xy).toHaveLength(2);
    expect(c.xy[0].x).toBe(0);
  });
});
