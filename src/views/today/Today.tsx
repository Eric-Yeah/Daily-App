import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MockBanner } from '../../components/Header';
import { ViewSwitcher } from '../../components/Segmented';
import { useMarketLive } from '../../data/market';
import { getDataSource } from '../../data/source';
import { useNow } from '../../lib/clock';
import { keepLastGood, type Snapshot } from '../../lib/lastgood';
import { useOnline } from '../../lib/online';
import { useResync } from '../../lib/resync';
import { useSettings } from '../../lib/settings';
import { pickView, type ViewKey } from '../../lib/time';
import { Afternoon } from './Afternoon';
import { Evening } from './Evening';
import { Morning } from './Morning';

// A manual switch only lasts for this app session (kept in memory, not in storage).
let manualView: ViewKey | null = null;

export function Today() {
  const settings = useSettings();
  const now = useNow();
  const [view, setView] = useState<ViewKey>(() => manualView ?? pickView(now, settings));

  // Follow the clock (e.g. morning → afternoon at 12:00) unless the user picked a view.
  useEffect(() => {
    if (!manualView) setView(pickView(now, settings));
  }, [now, settings.timeZone, settings.tradingEnd]);

  const choose = (v: ViewKey) => {
    manualView = v;
    setView(v);
  };

  const source = getDataSource();
  const marketLive = useMarketLive();
  const backToNow = () => {
    manualView = null;
    setView(pickView(now, settings));
  };
  const switcher = <ViewSwitcher value={view} current={pickView(now, settings)} onChange={choose} onNow={backToNow} />;
  const banner = source.kind === 'mock' && !marketLive ? <MockBanner /> : null;

  return (
    <main class="page" id="today-panel" role="tabpanel" aria-labelledby={`tab-${view}`}>
      {banner}
      {view === 'morning' && <Morning source={source} now={now} switcher={switcher} />}
      {view === 'afternoon' && <Afternoon source={source} now={now} switcher={switcher} />}
      {view === 'evening' && <Evening source={source} now={now} switcher={switcher} />}
    </main>
  );
}

export interface ViewData<T> {
  data: T | undefined;
  failed: boolean; // the load failed and there is nothing older to show
  retry: () => void;
}

// Last good result per view, in memory: switching views shows it at once, a failed refresh falls back to it.
const lastGood = new Map<string, Snapshot<object>>();

/**
 * Loads a view's data; reloads when the source or the minute changes, when the connection returns and when
 * the window gets focus or becomes visible again (see `useResync`). A failed block is replaced by its last good version (marked stale).
 */
export function useViewData<T extends object>(key: string, load: () => Promise<T>, deps: unknown[]): ViewData<T> {
  const [data, setData] = useState<T | undefined>(() => lastGood.get(key)?.data as T | undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  useResync(retry);

  useEffect(() => {
    let alive = true;
    load()
      .then((d) => {
        if (!alive) return;
        const merged = keepLastGood(lastGood.get(key) as Snapshot<T> | undefined, d);
        lastGood.set(key, { data: merged, at: new Date() });
        setData(merged);
        setFailed(false);
      })
      .catch(() => alive && setFailed(!lastGood.has(key)));
    return () => {
      alive = false;
    };
  }, [...deps, attempt]);
  return { data, failed, retry };
}

/** Offline hint and, if nothing could be loaded at all, an error card with a retry button. */
export function ViewState<T>({ view, children }: { view: ViewData<T>; children: ComponentChildren }) {
  const online = useOnline();
  return (
    <>
      {!online && (
        <div class="offline-banner" role="status">
          Offline · du siehst den letzten Stand
        </div>
      )}
      {view.failed ? (
        <section class="card gap-12 block-state block-state--error" role="alert">
          <p>Die Daten konnten nicht geladen werden.</p>
          <button class="button button--secondary" type="button" onClick={view.retry}>
            Erneut versuchen
          </button>
        </section>
      ) : (
        // aria-busy tells screen readers that the skeletons are placeholders while the first load runs
        <div class="view-body" aria-busy={view.data === undefined}>
          {children}
        </div>
      )}
    </>
  );
}
