// New-version handling for the installed app. The service worker downloads a new version in the background;
// instead of swapping silently, the app shows a banner and applies it when the user taps "Aktualisieren".
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';

let needRefresh = false;
let applySW: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

const HOUR = 3600_000;

export function initUpdates() {
  applySW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((l) => l());
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // iOS rarely checks on its own: look for a new version when the app comes back and once an hour.
      const check = () => void registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, HOUR);
    },
  });
}

/** Installs the waiting version and reloads the app. */
export function applyUpdate() {
  void applySW?.(true);
}

export function useUpdateAvailable(): boolean {
  const [value, setValue] = useState(needRefresh);
  useEffect(() => {
    const l = () => setValue(needRefresh);
    listeners.add(l);
    l();
    return () => void listeners.delete(l);
  }, []);
  return value;
}
