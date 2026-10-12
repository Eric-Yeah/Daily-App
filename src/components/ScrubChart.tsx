import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHART_WIDTH, nearestIndex } from '../lib/chart';
import { formatPct, spokenPct, trend } from '../lib/format';

/** One selectable point of a chart: where it sits (chart units) and what to say about it. */
export interface ScrubPoint {
  x: number;
  y: number;
  /** "11:20" or "Fr., 9. Okt." */
  when: string;
  /** Formatted value ("48.120 €"); left out when amounts are hidden or not meaningful. */
  value?: string;
  /** Change in percent against the reference (previous close), or null if there is none. */
  pct: number | null;
}

const TOUCH_HOLD_MS = 1800;

/**
 * Makes a small SVG chart explorable: drag a finger or move the mouse over it to see time, value and change;
 * with the keyboard use the arrow keys (Home/End jump to the ends, Escape closes).
 * The SVG is passed as children; cursor, dot and label are drawn on top as HTML so they stay round and sharp
 * even when the SVG is stretched.
 */
export function ScrubChart({
  points,
  height,
  label,
  color,
  compact = false,
  children,
}: {
  points: ScrubPoint[];
  height: number;
  label: string;
  color: string;
  compact?: boolean;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const hold = useRef<number>();
  const [index, setIndex] = useState<number | null>(null);
  const [spoken, setSpoken] = useState('');
  const shown = index !== null && index < points.length ? index : null;
  const p = shown === null ? null : points[shown];

  useEffect(() => () => window.clearTimeout(hold.current), []);

  const pick = (clientX: number) => {
    const el = box.current;
    if (!el || points.length === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    setIndex(nearestIndex(points, ((clientX - r.left) / r.width) * CHART_WIDTH));
  };

  const onDown = (e: PointerEvent) => {
    window.clearTimeout(hold.current);
    pick(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    // Mouse: follow without a button. Touch: only while the finger is down (a vertical scroll cancels the pointer).
    if (e.pointerType === 'mouse' || e.buttons > 0) pick(e.clientX);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => setIndex(null), TOUCH_HOLD_MS);
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') setIndex(null);
  };

  const onKey = (e: KeyboardEvent) => {
    if (points.length === 0) return;
    let next: number | null = null;
    const at = shown ?? points.length - 1;
    if (e.key === 'ArrowLeft') next = Math.max(0, at - 1);
    else if (e.key === 'ArrowRight') next = Math.min(points.length - 1, at + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = points.length - 1;
    else if (e.key === 'Escape') {
      setIndex(null);
      return;
    } else return;
    e.preventDefault();
    setIndex(next);
    const q = points[next];
    setSpoken(`${q.when}${q.value ? `, ${q.value}` : ''}${q.pct === null ? '' : `, ${spokenPct(q.pct, 2)}`}`);
  };

  const leftPct = p ? (p.x / CHART_WIDTH) * 100 : 0;
  const tipRight = p ? p.x < CHART_WIDTH / 2 : false;

  return (
    <div
      ref={box}
      class="scrub"
      style={{ height: `${height}px` }}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Mit den Pfeiltasten einzelne Werte ansehen.`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onLeave}
      onKeyDown={onKey}
      onBlur={() => setIndex(null)}
    >
      {children}
      {p && (
        <>
          <div class="scrub__line" style={{ left: `${leftPct}%` }} aria-hidden="true" />
          <div class="scrub__dot" style={{ left: `${leftPct}%`, top: `${p.y}px`, background: color }} aria-hidden="true" />
          <div class={`scrub__tip${compact ? ' scrub__tip--compact' : ''}${tipRight ? ' scrub__tip--right' : ''}`} aria-hidden="true">
            <span class="scrub__when">{p.when}</span>
            {p.value && <span class="scrub__value">{p.value}</span>}
            {p.pct !== null && <span class={`scrub__pct ${trend(p.pct, 2)}`}>{formatPct(p.pct, compact ? 1 : 2)}</span>}
          </div>
        </>
      )}
      <span class="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </span>
    </div>
  );
}

/** "HH:MM" from minutes since midnight. */
export const minuteLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
