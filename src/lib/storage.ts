// localStorage wrapper. All apps under eric-yeah.github.io share one origin, so every key
// gets the "daily:" prefix, and every access is guarded (private mode, blocked storage).
const PREFIX = 'daily:';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const storage = {
  get(key: string): string | null {
    return safe(() => localStorage.getItem(PREFIX + key), null);
  },
  set(key: string, value: string): void {
    safe(() => localStorage.setItem(PREFIX + key, value), undefined);
  },
  remove(key: string): void {
    safe(() => localStorage.removeItem(PREFIX + key), undefined);
  },
  getJSON<T>(key: string): T | undefined {
    const raw = this.get(key);
    if (!raw) return undefined;
    return safe(() => JSON.parse(raw) as T, undefined);
  },
  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  },
};
