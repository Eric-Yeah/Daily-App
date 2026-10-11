import { useEffect, useState } from 'preact/hooks';
import { MockBanner } from '../../components/Header';
import { ViewSwitcher } from '../../components/Segmented';
import { useMarketLive } from '../../data/market';
import { getDataSource } from '../../data/source';
import { useNow } from '../../lib/clock';
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
  const switcher = <ViewSwitcher value={view} onChange={choose} />;
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

/** Loads a view's data; reloads when the source or the minute changes. */
export function useViewData<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(undefined));
    return () => {
      alive = false;
    };
  }, deps);
  return data;
}
