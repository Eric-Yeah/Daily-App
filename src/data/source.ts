import { currentSession } from '../lib/auth';
import { getSettings } from '../lib/settings';
import { createMockNotes, createMockSource } from './mock';
import { createSupabaseNotes, createSupabaseTasks } from './personal';
import { empty, type DataSource, type DayNoteStore, type TaskStore } from './types';

// Market data (prices, news, events …) is still mock data until M4/M5, clearly marked in the UI.
// Personal data (tasks, day notes) comes from Supabase as soon as you are signed in.
const NO_SOURCE = 'Noch keine Datenquelle verbunden.';

const emptyTasks: TaskStore = {
  async list() {
    return empty('Aufgaben werden ab der Anmeldung gespeichert.');
  },
  async add() {},
  async toggle() {},
  subscribe() {
    return () => {};
  },
};

function createEmptySource(tasks: TaskStore, notes: DayNoteStore): DataSource {
  const e = <T>() => empty<T>(NO_SOURCE);
  return {
    kind: 'none',
    tasks,
    notes,
    async morning() {
      return {
        weather: e(),
        indices: e(),
        important: e(),
        depot: empty('Noch keine Positionen. Lege sie im Tab „Depot“ an oder importiere eine CSV.'),
        kpis: e(),
        alert: e(),
        news: e(),
        events: e(),
        training: e(),
        day: e(),
      };
    },
    async afternoon() {
      return { depot: e(), indices: e(), groups: e(), morningEvents: e(), usStart: e(), marketNow: e() };
    },
    async evening() {
      return { balance: e(), drivers: e(), news: e(), us: e(), outlook: e(), periods: e(), trainingDone: e() };
    },
  };
}

const cache = new Map<string, DataSource>();

export function getDataSource(): DataSource {
  const userId = currentSession()?.user.id ?? '';
  const mock = getSettings().showMockData;
  const key = `${userId}|${mock}`;
  let source = cache.get(key);
  if (!source) {
    const personal = userId
      ? { tasks: createSupabaseTasks(), notes: createSupabaseNotes() }
      : mock
        ? null
        : { tasks: emptyTasks, notes: createMockNotes() };
    if (mock) {
      const base = createMockSource();
      source = personal ? { ...base, ...personal } : base;
    } else {
      source = createEmptySource(personal!.tasks, personal!.notes);
    }
    cache.set(key, source);
  }
  return source;
}
