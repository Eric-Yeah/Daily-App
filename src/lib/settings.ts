import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_TIME_ZONE, DEFAULT_TRADING_END } from './time';
import { storage } from './storage';

// Device-local settings. From M2 on, the synced ones move to the `daily.settings` table;
// this store then acts as the offline cache.
export interface Settings {
  displayName: string;
  timeZone: string;
  tradingEnd: string;
  hideAmounts: boolean;
  showMockData: boolean;
}

const DEFAULTS: Settings = {
  displayName: '',
  timeZone: DEFAULT_TIME_ZONE,
  tradingEnd: DEFAULT_TRADING_END,
  hideAmounts: false,
  showMockData: true,
};

const KEY = 'settings';
let current: Settings = { ...DEFAULTS, ...storage.getJSON<Partial<Settings>>(KEY) };
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  storage.setJSON(KEY, current);
  listeners.forEach((l) => l(current));
}

export function useSettings(): Settings {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
