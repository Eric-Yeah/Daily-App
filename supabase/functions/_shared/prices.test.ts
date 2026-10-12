import { describe, expect, it } from 'vitest';
import { addDays, dailyCloses, eodhdFrom, eodhdSymbolOf, parseEodhdSearch, pickEodhdListing, localDay, openSessions, parseChart, parseEodhd, parseSearch, pickFigiListing, pickListing, toEodhdSymbol } from './prices.ts';

// Invented example data; no real positions.
const chart = (extra: object = {}) => ({
  chart: {
    result: [
      {
        meta: { symbol: 'TEST.DE', currency: 'EUR', gmtoffset: 7200, chartPreviousClose: 100, ...extra },
        timestamp: [1760162400, 1760163300, 1760164200, 1760165100], // 2025-10-11 06:00 UTC onwards
        indicators: { quote: [{ close: [101, null, 0, 102.5] }] },
      },
    ],
  },
});

describe('parseChart', () => {
  it('keeps only bars with a positive price', () => {
    const c = parseChart(chart())!;
    expect(c.symbol).toBe('TEST.DE');
    expect(c.currency).toBe('EUR');
    expect(c.prevClose).toBe(100);
    expect(c.points.map((p) => p.price)).toEqual([101, 102.5]);
    expect(c.points[0].ts).toBe('2025-10-11T06:00:00.000Z');
  });

  it('falls back to previousClose and tolerates broken input', () => {
    expect(parseChart(chart({ chartPreviousClose: undefined, previousClose: 99 }))!.prevClose).toBe(99);
    expect(parseChart(null)).toBeNull();
    expect(parseChart({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull();
    expect(parseChart({ chart: { result: [{ meta: {} }] } })).toBeNull();
  });
});

describe('dailyCloses', () => {
  const data = {
    symbol: 'TEST.DE',
    currency: 'EUR',
    gmtOffsetSec: 7200,
    prevClose: null,
    points: [
      { ts: '2026-10-08T07:00:00.000Z', price: 10 },
      { ts: '2026-10-09T07:00:00.000Z', price: 11 },
      { ts: '2026-10-12T07:00:00.000Z', price: 12 },
    ],
  };
  it('drops the partial bar of today during the session', () => {
    expect(dailyCloses(data, '2026-10-12', false)).toEqual([
      { day: '2026-10-08', close: 10 },
      { day: '2026-10-09', close: 11 },
    ]);
  });
  it('keeps today after the session', () => {
    expect(dailyCloses(data, '2026-10-12', true).at(-1)).toEqual({ day: '2026-10-12', close: 12 });
  });
  it('uses the exchange-local day', () => {
    expect(localDay('2026-10-08T22:30:00.000Z', 7200)).toBe('2026-10-09');
  });
});

describe('symbol lookup', () => {
  const hits = parseSearch({
    quotes: [
      { symbol: 'TEST.L', exchange: 'LSE', shortname: 'Beispiel ETF', quoteType: 'ETF' },
      { symbol: 'TEST.DE', exchange: 'GER', shortname: 'Beispiel ETF', quoteType: 'ETF' },
      { symbol: 'NOPE', quoteType: 'CURRENCY' },
      { exchange: 'x' },
    ],
  });
  it('parses search hits', () => expect(hits).toHaveLength(3));
  it('prefers the Xetra listing', () => expect(pickListing(hits)?.symbol).toBe('TEST.DE'));
  it('returns null when nothing fits', () => {
    expect(pickListing([])).toBeNull();
    expect(pickListing([{ symbol: 'EURUSD=X', exchange: null, name: null, type: 'CURRENCY' }])).toBeNull();
  });
  it('maps euro exchanges to EODHD', () => {
    expect(toEodhdSymbol('TEST.DE')).toBe('TEST.XETRA');
    expect(toEodhdSymbol('TEST.MI')).toBe('TEST.MI');
    expect(toEodhdSymbol('TEST.L')).toBeNull();
    expect(toEodhdSymbol('^GSPC')).toBeNull();
  });
});

describe('parseEodhd', () => {
  it('reads valid rows only, sorted', () => {
    expect(
      parseEodhd([
        { date: '2026-10-09', close: 11 },
        { date: '2026-10-08', close: 10 },
        { date: 'kaputt', close: 5 },
        { date: '2026-10-07', close: 'x' },
      ]),
    ).toEqual([
      { day: '2026-10-08', close: 10 },
      { day: '2026-10-09', close: 11 },
    ]);
    expect(parseEodhd({ error: 'nope' })).toEqual([]);
  });
});

describe('openSessions', () => {
  const end = 17 * 60 + 30;
  it('opens Xetra and the US on a weekday afternoon', () => {
    expect(openSessions(2, 16 * 60, end)).toEqual({ xetra: true, us: true });
  });
  it('keeps the US open after Xetra closes, and closes both at night', () => {
    expect(openSessions(2, 20 * 60, end)).toEqual({ xetra: false, us: true });
    expect(openSessions(2, 23 * 60, end)).toEqual({ xetra: false, us: false });
  });
  it('allows a short buffer after the close and is closed on weekends', () => {
    expect(openSessions(2, end + 5, end).xetra).toBe(true);
    expect(openSessions(2, end + 6, end).xetra).toBe(false);
    expect(openSessions(6, 12 * 60, end)).toEqual({ xetra: false, us: false });
  });
});

describe('eodhdFrom', () => {
  const today = '2026-10-12';
  const year = '2025-10-07';
  it('loads the whole year for a symbol without history', () => {
    expect(eodhdFrom([], today, year)).toBe(year);
  });
  it('starts at the oldest provisional (Yahoo) day of the last week', () => {
    expect(
      eodhdFrom(
        [
          { day: '2026-10-08', source: 'eodhd' },
          { day: '2026-10-09', source: 'yahoo' },
          { day: '2026-10-12', source: 'yahoo' },
        ],
        today,
        year,
      ),
    ).toBe('2026-10-09');
  });
  it('does nothing when the recent days all come from EODHD or are old', () => {
    expect(eodhdFrom([{ day: '2026-10-09', source: 'eodhd' }], today, year)).toBeNull();
    expect(eodhdFrom([{ day: '2026-09-01', source: 'yahoo' }], today, year)).toBeNull();
  });
  it('shifts days across month ends', () => {
    expect(addDays('2026-10-02', -3)).toBe('2026-09-29');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('EODHD listing search', () => {
  const hits = parseEodhdSearch([
    { Code: 'AAA', Exchange: 'PA', Currency: 'EUR', Type: 'ETF' },
    { Code: 'BBB', Exchange: 'XETRA', Currency: 'EUR', Type: 'ETF' },
    { Code: 'BBB', Exchange: 'LSE', Currency: 'USD', Type: 'ETF' },
    { Code: 'BBB', Exchange: 'F', Currency: 'EUR', Type: 'ETF' },
    { nope: true },
  ]);
  it('parses listings and ignores broken rows', () => expect(hits).toHaveLength(4));
  it('prefers the Xetra euro listing and derives the Yahoo symbol', () => {
    expect(pickEodhdListing(hits)).toEqual({ ticker: 'BBB', exchange: 'XETRA', yahooSymbol: 'BBB.DE' });
  });
  it('falls back to other euro exchanges and skips non-euro listings', () => {
    expect(pickEodhdListing(hits.filter((h) => h.exchange !== 'XETRA'))).toEqual({ ticker: 'AAA', exchange: 'PA', yahooSymbol: 'AAA.PA' });
    expect(pickEodhdListing(hits.filter((h) => h.exchange === 'LSE'))).toBeNull();
    expect(parseEodhdSearch({ error: 'x' })).toEqual([]);
  });
  it('uses the stored EODHD listing before deriving from the Yahoo symbol', () => {
    expect(eodhdSymbolOf({ ticker: 'BBB', exchange: 'XETRA', provider_symbol: 'OTHER.MI' })).toBe('BBB.XETRA');
    expect(eodhdSymbolOf({ ticker: null, exchange: null, provider_symbol: 'AAA.PA' })).toBe('AAA.PA');
    expect(eodhdSymbolOf({ ticker: 'X', exchange: 'MIL', provider_symbol: 'X.MI' })).toBe('X.MI');
    expect(eodhdSymbolOf({ ticker: null, exchange: null, provider_symbol: null })).toBeNull();
  });
});

describe('WKN lookup via OpenFIGI', () => {
  const resp = (rows: object[]) => [{ data: rows }];
  it('picks the Xetra listing and derives the symbols', () => {
    const raw = resp([{ ticker: 'AAA', exchCode: 'SW' }, { ticker: 'AAA', exchCode: 'GY' }]);
    expect(pickFigiListing(raw)).toEqual({ ticker: 'AAA', exchange: 'XETRA', yahooSymbol: 'AAA.DE' });
  });
  it('falls back to the German composite listing for ETFs and prefers Xetra when both exist', () => {
    expect(pickFigiListing(resp([{ ticker: 'ETF1', exchCode: 'GR' }, { ticker: 'ETF1', exchCode: 'GF' }]))).toEqual({ ticker: 'ETF1', exchange: 'XETRA', yahooSymbol: 'ETF1.DE' });
    expect(pickFigiListing(resp([{ ticker: 'AAA', exchCode: 'GR' }, { ticker: 'BBB', exchCode: 'GY' }]))?.ticker).toBe('BBB');
  });
  it('returns null without a German listing, for odd tickers and for broken responses', () => {
    expect(pickFigiListing(resp([{ ticker: 'AAA', exchCode: 'SW' }]))).toBeNull();
    expect(pickFigiListing(resp([{ ticker: 'a b', exchCode: 'GY' }]))).toBeNull();
    expect(pickFigiListing([{ warning: 'No identifier found.' }])).toBeNull();
    expect(pickFigiListing({ error: 'x' })).toBeNull();
  });
});
