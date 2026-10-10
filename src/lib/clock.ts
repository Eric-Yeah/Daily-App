import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_TIME_ZONE, fromZonedWallTime } from './time';

// The app clock. For testing and comparing with the mockups, the time can be pinned with
// a query parameter, e.g. /Daily-App/?now=2026-10-12T14:32 (Berlin wall-clock time).
function readOverride(): Date | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('now');
  if (!raw) return null;
  const d = fromZonedWallTime(raw, DEFAULT_TIME_ZONE) ?? new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const override = readOverride();
const startedAt = Date.now();

export function now(): Date {
  // A pinned clock still ticks forward so countdowns can be checked.
  return override ? new Date(override.getTime() + (Date.now() - startedAt)) : new Date();
}

export const isClockPinned = override !== null;

/** Re-renders every `intervalMs` (default 30 s) and when the app becomes visible again. */
export function useNow(intervalMs = 30_000): Date {
  const [value, setValue] = useState(now);
  useEffect(() => {
    const tick = () => setValue(now());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return value;
}
