// Tasks and day notes stored in Supabase (schema daily, protected by RLS).
import { isoDate, zonedParts } from '../lib/time';
import { getSettings } from '../lib/settings';
import { daily } from '../lib/supabase';
import { failed, ok, type DayNoteStore, type Task, type TaskStore } from './types';

export interface TaskRow {
  id: string;
  title: string;
  day: string;
  done: boolean;
  created_at: string;
}

/** Today's date in the user's time zone, e.g. "2026-10-12". */
export function today(now = new Date()): string {
  return isoDate(zonedParts(now, getSettings().timeZone));
}

/**
 * Tasks shown today: everything dated today, plus open tasks from earlier days (they roll over).
 * Done tasks from earlier days disappear. Open ones first, then by creation time.
 */
export function visibleTasks(rows: TaskRow[], day: string): Task[] {
  return rows
    .filter((r) => r.day === day || (!r.done && r.day < day))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.created_at.localeCompare(b.created_at))
    .map((r) => ({ id: r.id, title: r.title, done: r.done }));
}

const UNAVAILABLE = 'Aufgaben gerade nicht verfügbar.';

export function createSupabaseTasks(): TaskStore {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    async list() {
      const d = today();
      const { data, error } = await daily()
        .from('tasks')
        .select('id,title,day,done,created_at')
        .or(`day.eq.${d},and(done.is.false,day.lt.${d})`)
        .order('created_at');
      return error ? failed(UNAVAILABLE) : ok(visibleTasks(data as TaskRow[], d));
    },
    async add(title) {
      await daily().from('tasks').insert({ title, day: today() });
      emit();
    },
    async toggle(id, done) {
      // A rolled-over task that gets done today belongs to today (otherwise it would vanish).
      await daily()
        .from('tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null, day: today() })
        .eq('id', id);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createSupabaseNotes(): DayNoteStore {
  return {
    async get(day) {
      const { data, error } = await daily().from('day_notes').select('note').eq('day', day).maybeSingle();
      return error ? failed('Notiz gerade nicht verfügbar.') : ok((data?.note as string | undefined) ?? '');
    },
    async set(day, note) {
      const { error } = await daily()
        .from('day_notes')
        .upsert({ day, note, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
      return !error;
    },
  };
}
