// Pure geometry for the small SVG charts (viewBox width 320, like the mockups).
import type { SeriesPoint } from '../data/types';
import { parseHHMM, sessionFraction } from './time';

export const CHART_WIDTH = 320;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function scaleY(domainMin: number, domainMax: number, top: number, bottom: number) {
  if (domainMax - domainMin < 1e-9) return () => (top + bottom) / 2;
  return (v: number) => bottom - ((v - domainMin) / (domainMax - domainMin)) * (bottom - top);
}

export interface Polyline {
  line: string; // stroke path
  area: string; // filled path down to the chart bottom
  end: { x: number; y: number } | null;
  /** Every plotted point in chart units, same order as the input values (for touch/hover lookup). */
  xy: { x: number; y: number }[];
}

function polyline(xy: { x: number; y: number }[], height: number): Polyline {
  if (xy.length === 0) return { line: '', area: '', end: null, xy };
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  const first = xy[0];
  const last = xy[xy.length - 1];
  const area = `${line} L${fmt(last.x)} ${height} L${fmt(first.x)} ${height} Z`;
  return { line, area, end: last, xy };
}

/** Morning depot sparkline: evenly spaced values, y between 14 and 46 of a 64 px chart. */
export function sparkline(values: number[], height = 64): Polyline {
  if (values.length === 0) return polyline([], height);
  const y = scaleY(Math.min(...values), Math.max(...values), 14, 46);
  const step = values.length > 1 ? CHART_WIDTH / (values.length - 1) : 0;
  return polyline(
    values.map((v, i) => ({ x: i * step, y: y(v) })),
    height,
  );
}

export interface SessionChart extends Polyline {
  baselineY: number; // previous close
  /** true while the session still has time left (draw the dotted remainder). */
  open: boolean;
}

/**
 * Intraday chart over a trading session.
 * x = time within session, y = value; the previous close is always inside the visible range.
 */
export function sessionChart(
  points: SeriesPoint[],
  prevClose: number,
  session: { start: string; end: string },
  box: { height: number; top: number; bottom: number },
): SessionChart {
  const values = points.map((p) => p.value);
  const y = scaleY(Math.min(prevClose, ...values), Math.max(prevClose, ...values), box.top, box.bottom);
  const xy = points.map((p) => ({
    // Keep the end cap and marker inside the viewBox.
    x: Math.min(CHART_WIDTH - 2, sessionFraction(p.minute, session.start, session.end) * CHART_WIDTH),
    y: y(p.value),
  }));
  const base = polyline(xy, box.height);
  const lastMinute = points.at(-1)?.minute ?? 0;
  return { ...base, baselineY: y(prevClose), open: lastMinute < parseHHMM(session.end) };
}

/** Index of the point whose x is closest to `x` (points sorted by x); -1 when there are none. */
export function nearestIndex(points: { x: number }[], x: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && x - points[lo - 1].x <= points[lo].x - x) return lo - 1;
  return lo;
}
