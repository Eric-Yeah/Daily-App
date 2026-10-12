import { useState } from 'preact/hooks';
import { storage } from './storage';

// Cards that can be folded (Marktüberblick, Marktstart, Live-Blog). They start open; once folded, a card stays
// folded on this device (also after a reload) until it is opened again. Only the ids of folded cards are stored.
const KEY = 'collapsed-cards';

/** The folded card ids from the stored text; anything unexpected counts as "nothing folded". */
export function parseCollapsed(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
}

/** The list with `id` folded or opened. */
export function withCollapsed(list: string[], id: string, collapsed: boolean): string[] {
  const rest = list.filter((x) => x !== id);
  return collapsed ? [...rest, id] : rest;
}

const read = () => parseCollapsed(storage.getJSON<unknown>(KEY));

/** `[collapsed, setCollapsed]` for one card; the choice is remembered on this device. */
export function useCollapsed(id: string): [boolean, (collapsed: boolean) => void] {
  const [collapsed, set] = useState(() => read().includes(id));
  return [
    collapsed,
    (next) => {
      set(next);
      storage.setJSON(KEY, withCollapsed(read(), id, next));
    },
  ];
}
