import { getSettings } from '../lib/settings';
import { createMockSource } from './mock';
import { empty, type DataSource, type TaskStore } from './types';

// Without mock data and before Supabase is connected (M2), every block shows an honest empty state.
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

function createEmptySource(): DataSource {
  const e = <T>() => empty<T>(NO_SOURCE);
  return {
    kind: 'none',
    tasks: emptyTasks,
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

let mock: DataSource | null = null;
let none: DataSource | null = null;

export function getDataSource(): DataSource {
  if (getSettings().showMockData) return (mock ??= createMockSource());
  return (none ??= createEmptySource());
}
