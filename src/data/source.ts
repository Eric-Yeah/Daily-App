import { currentSession } from '../lib/auth';
import { getSettings } from '../lib/settings';
import { liveAfternoon, liveEvening, liveMorning } from './live';
import { marketAfternoon, marketEvening, marketMorning } from './market';
import { createMockNotes, createMockSource } from './mock';
import { createSupabaseNotes, createSupabaseTasks } from './personal';
import { empty, type DataSource, type DayNoteStore, type TaskStore } from './types';

// Signed in with positions, market data is real too (prices, indices, US market, from the price tables
// that the Edge Function "daily-prices" fills), as are tasks, day notes, news, events, briefings,
// training and "Dein Tag". Without positions the base source (mock data or empty states) is shown.
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

/** Signed in: real news, events, briefings, training and "Dein Tag" replace the matching blocks. */
function withLive(base: DataSource): DataSource {
  return {
    ...base,
    async morning(now) {
      const [b, l, m] = await Promise.all([base.morning(now), liveMorning(now), marketMorning(now)]);
      return { ...b, ...m, ...l };
    },
    async afternoon(now) {
      const [b, l, m] = await Promise.all([base.afternoon(now), liveAfternoon(now), marketAfternoon(now)]);
      return { ...b, ...m, ...l };
    },
    async evening(now) {
      const [b, l, m] = await Promise.all([base.evening(now), liveEvening(now), marketEvening(now)]);
      return { ...b, ...m, ...l };
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
    if (userId) source = withLive(source);
    cache.set(key, source);
  }
  return source;
}
