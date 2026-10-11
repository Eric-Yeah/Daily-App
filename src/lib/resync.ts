import { useEffect, useRef } from 'preact/hooks';

// Keeps data from another device (the phone, say) up to date while the app stays open, which on a Mac
// can be for hours: reload when the window gets focus or becomes visible, when the connection returns,
// and every few minutes while it is visible. Plain reads of the same protected tables, nothing new is opened.

export const RESYNC_MIN_GAP_MS = 20_000;
export const RESYNC_INTERVAL_MS = 120_000;

/** Reloads that come too close together (focus and visibility fire at the same time) are merged. */
export function shouldResync(lastAt: number | null, now: number, minGapMs = RESYNC_MIN_GAP_MS): boolean {
  return lastAt === null || now - lastAt >= minGapMs;
}

/** Calls `reload` on the events above. The first load is up to the caller; this only adds the later ones. */
export function useResync(reload: () => void, intervalMs = RESYNC_INTERVAL_MS): void {
  const fn = useRef(reload);
  fn.current = reload;
  useEffect(() => {
    let last: number | null = Date.now();
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      if (!shouldResync(last, t)) return;
      last = t;
      fn.current();
    };
    const timer = setInterval(run, intervalMs);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [intervalMs]);
}
