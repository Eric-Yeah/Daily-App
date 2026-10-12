import { currentSession } from './auth';
import { supabase, supabaseConfigured } from './supabase';
import { cleanTopics } from './topics';

// AI topic suggestions (Claude Haiku 5.5 via the Edge Function "daily-topics"). Only the position NAMES are sent.
// They are suggestions on top of the rule-based ones in topics.ts: if anything fails, the result is just empty.

const MAX_PER_CALL = 40;
const cache = new Map<string, string[]>();
const key = (name: string) => name.trim().toLowerCase();

/** Suggestions only exist for a signed-in owner of a configured backend (not in demo mode). */
export const aiTopicsAvailable = (): boolean => supabaseConfigured && !!currentSession();

/** Answer of the Edge Function checked against what the app expects; `null` if it is not usable. */
export function readTopicsAnswer(data: unknown, count: number): string[][] | null {
  const d = data as { status?: unknown; topics?: unknown } | null;
  if (d?.status !== 'ok' || !Array.isArray(d.topics) || d.topics.length !== count) return null;
  return d.topics.map((t) => (Array.isArray(t) ? cleanTopics(t.filter((x): x is string => typeof x === 'string')) : []));
}

/**
 * Topic suggestions per name, in the same order. Names asked before are answered from memory. A failed call, no
 * login or no AI budget gives empty lists; this never throws.
 */
export async function suggestTopicsAi(names: string[]): Promise<string[][]> {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const missing = [...new Map(clean.filter((n) => !cache.has(key(n))).map((n) => [key(n), n])).values()];
  if (missing.length && aiTopicsAvailable()) {
    for (let i = 0; i < missing.length; i += MAX_PER_CALL) {
      const batch = missing.slice(i, i + MAX_PER_CALL);
      try {
        const { data, error } = await supabase().functions.invoke('daily-topics', { body: { names: batch } });
        const topics = error ? null : readTopicsAnswer(data, batch.length);
        if (topics) batch.forEach((n, j) => cache.set(key(n), topics[j]));
      } catch {
        // offline or function not published yet: no AI suggestions, the rule-based ones still work
      }
    }
  }
  return names.map((n) => cache.get(key(n)) ?? []);
}
