// Public index and future symbols the price job records (market data, nothing personal).
// Keep in sync with INDEX_SYMBOLS in supabase/functions/_shared/prices.ts.
export const IDX = {
  dax: { symbol: '^GDAXI', name: 'DAX' },
  stoxx: { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  sp500: { symbol: '^GSPC', name: 'S&P 500' },
  ndx: { symbol: '^NDX', name: 'Nasdaq 100' },
  spFuture: { symbol: 'ES=F', name: 'S&P-500-Future' },
  ndxFuture: { symbol: 'NQ=F', name: 'Nasdaq-100-Future' },
} as const;

export const ALL_INDEX_SYMBOLS: string[] = Object.values(IDX).map((i) => i.symbol);
