import { beforeEach, describe, expect, it, vi } from 'vitest';

// Invented example data; the Supabase client is replaced by a small in-memory fake.
type Rows = Record<string, Record<string, unknown>[]>;
let tables: Rows = {};
let failTable: string | null = null;

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'range', 'limit']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => void) =>
      resolve(failTable === table ? { data: null, error: { message: 'boom' } } : { data: tables[table] ?? [], error: null });
    return b;
  };
  return { daily: () => ({ from: (t: string) => builder(t) }), supabase: () => ({}) };
});

const { invalidateMarket, marketAfternoon, marketEvening, marketMorning } = await import('./market');

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h - 2, m)).toISOString(); // Berlin = UTC+2
};

function seed() {
  tables = {
    groups: [{ id: 'g1', name: 'Welt', color: '#6B9AF3', sort: 0 }],
    positions: [
      { id: 'p1', name: 'Beispiel A', isin: 'IE00B4L5Y983', quantity: 10, cost_per_unit: 80, currency: 'EUR', group_id: 'g1', provider_symbol: 'AAA.DE', topics: [], archived: false },
      { id: 'p2', name: 'Beispiel B', isin: 'DE0005140008', quantity: 5, cost_per_unit: 20, currency: 'EUR', group_id: null, provider_symbol: null, topics: [], archived: false },
    ],
    price_daily: [
      { symbol: 'AAA.DE', day: '2025-12-30', close: 80 },
      { symbol: 'AAA.DE', day: '2026-10-08', close: 98 },
      { symbol: 'AAA.DE', day: '2026-10-09', close: 100 },
      { symbol: '^GSPC', day: '2026-10-09', close: 5000 },
    ],
    price_snapshots: [
      { symbol: 'AAA.DE', ts: at('2026-10-12', '09:00'), price: 101 },
      { symbol: 'AAA.DE', ts: at('2026-10-12', '09:15'), price: 102 },
      { symbol: '^GSPC', ts: at('2026-10-12', '15:30'), price: 5050 },
    ],
    news_links: [],
  };
  failTable = null;
}

beforeEach(() => {
  seed();
  invalidateMarket();
});
const now = new Date(at('2026-10-12', '16:00'));

describe('marketAfternoon', () => {
  it('builds the depot curve and leaves out positions without a price', async () => {
    const r = await marketAfternoon(now);
    expect(r.depot?.status).toBe('ok');
    if (r.depot?.status !== 'ok') return;
    expect(r.depot.data.summary.value).toBe(1020);
    expect(r.depot.data.intraday.prevClose).toBe(1000);
    expect(r.depot.data.summary.changePct).toBeCloseTo(2);
    expect(r.depot.data.missing).toBe(1);
    expect(r.depot.data.intraday.points).toHaveLength(2);
  });

  it('shows the future block as empty when there are no future prices', async () => {
    const r = await marketAfternoon(now);
    expect(r.usStart?.status).toBe('empty');
  });
});

describe('marketMorning', () => {
  it('computes the depot, the since-purchase and year numbers and drops the mock weather', async () => {
    const r = await marketMorning(now);
    if (r.depot?.status !== 'ok' || r.kpis?.status !== 'ok') throw new Error('expected ok blocks');
    expect(r.depot.data.summary.value).toBe(1020);
    expect(r.depot.data.missing).toBe(1);
    expect(r.kpis.data.sinceBuy.abs).toBeCloseTo(1020 - 800);
    expect(r.kpis.data.ytd.pct).toBeCloseTo(((102 - 80) / 80) * 100);
    expect(r.weather?.status).toBe('empty');
  });

  it('reports indices without a quote as missing, never as zero', async () => {
    const r = await marketMorning(now);
    if (r.indices?.status !== 'ok') throw new Error('expected ok');
    const sp = r.indices.data.find((i) => i.name === 'S&P 500');
    expect(sp?.changePct).toBeCloseTo(1);
    expect(r.indices.data.find((i) => i.name === 'DAX')?.changePct).toBeNull();
  });
});

describe('marketEvening', () => {
  it('draws the US curve rebased to 100', async () => {
    const r = await marketEvening(now);
    if (r.us?.status !== 'ok') throw new Error('expected ok');
    expect(r.us.data.indices[0].name).toBe('S&P 500');
    expect(r.us.data.indices[0].points[0].value).toBeCloseTo(101);
  });
});

describe('failures and empty depot', () => {
  it('returns nothing without positions, so the base source stays', async () => {
    tables.positions = [];
    expect(await marketMorning(now)).toEqual({});
  });

  it('marks the blocks as failed when the price tables cannot be read', async () => {
    failTable = 'price_daily';
    const r = await marketMorning(now);
    expect(r.depot?.status).toBe('error');
    expect(r.alert?.status).toBe('error');
  });

  it('says why when no price exists yet', async () => {
    tables.price_daily = [];
    tables.price_snapshots = [];
    const r = await marketMorning(now);
    expect(r.depot?.status).toBe('empty');
  });
});
