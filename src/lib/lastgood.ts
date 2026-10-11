// Offline and error handling for the views: when a block fails to load, show the last good one instead,
// marked as stale with its time ("Stand: HH:MM"). Kept in memory only: depot values and news are not
// written to the device storage, because all apps under eric-yeah.github.io share one browser origin.
import type { Block } from '../data/types';

type BlockMap = Record<string, Block<unknown>>;

export interface Snapshot<T> {
  data: T;
  at: Date; // when `data` was loaded
}

/** Replaces failed blocks of `next` by their last good version from `prev` (marked stale, with the time it was good). */
export function keepLastGood<T extends object>(prev: Snapshot<T> | undefined, next: T): T {
  if (!prev) return next;
  const out: BlockMap = { ...(next as BlockMap) };
  for (const [key, block] of Object.entries(next as BlockMap)) {
    const old = (prev.data as BlockMap)[key];
    if (block?.status === 'error' && old?.status === 'ok') {
      out[key] = { ...old, stale: true, asOf: old.stale && old.asOf ? old.asOf : prev.at.toISOString() };
    }
  }
  return out as T;
}
