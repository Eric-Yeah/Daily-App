// Public index, future and commodity symbols the price job records (market data, nothing personal).
// Keep in sync with INDEX_SYMBOLS in supabase/functions/_shared/prices.ts.
export const IDX = {
  dax: { symbol: '^GDAXI', name: 'DAX' },
  mdax: { symbol: '^MDAXI', name: 'MDAX' },
  tecdax: { symbol: '^TECDAX', name: 'TecDAX' },
  stoxx: { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  cac: { symbol: '^FCHI', name: 'CAC 40' },
  ftse: { symbol: '^FTSE', name: 'FTSE 100' },
  nikkei: { symbol: '^N225', name: 'Nikkei 225' },
  hangSeng: { symbol: '^HSI', name: 'Hang Seng' },
  sp500: { symbol: '^GSPC', name: 'S&P 500' },
  ndx: { symbol: '^NDX', name: 'Nasdaq 100' },
  dow: { symbol: '^DJI', name: 'Dow Jones' },
  spFuture: { symbol: 'ES=F', name: 'S&P-500-Future' },
  ndxFuture: { symbol: 'NQ=F', name: 'Nasdaq-100-Future' },
  brent: { symbol: 'BZ=F', name: 'Brent', unit: '$' },
  wti: { symbol: 'CL=F', name: 'WTI', unit: '$' },
} as const;

export const ALL_INDEX_SYMBOLS: string[] = Object.values(IDX).map((i) => i.symbol);

/** Strips shown on "Heute": which tiles, in which order. Oil shows its price besides the change. */
export const MORNING_STRIP = [IDX.dax, IDX.stoxx, IDX.sp500, IDX.ndx, IDX.dow, IDX.mdax, IDX.tecdax, IDX.ftse, IDX.cac, IDX.nikkei, IDX.hangSeng, IDX.brent, IDX.wti];
export const AFTERNOON_STRIP = [IDX.dax, IDX.mdax, IDX.tecdax, IDX.stoxx, IDX.cac, IDX.ftse, IDX.nikkei, IDX.hangSeng, IDX.spFuture, IDX.ndxFuture, IDX.brent, IDX.wti];
