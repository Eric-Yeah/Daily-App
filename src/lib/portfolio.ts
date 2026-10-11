// Depot calculations. Pure functions: positions + prices in, numbers out.
// A position without a price is never estimated; it is listed in `missing` and left out of the sums.

export interface PricePoint {
  last: number; // latest (or closing) price
  prevClose: number; // previous trading day's close
  yearStart?: number; // last close of the previous year
  weekStart?: number; // last close before this week
  monthStart?: number; // last close before this month
}

export interface PositionInput {
  id: string;
  name: string;
  quantity: number;
  costPerUnit: number;
  groupId: string | null;
  lossThresholdPct: number | null; // null = default from settings
  price: PricePoint | null;
}

export interface GroupInput {
  id: string;
  name: string;
  color: string;
  sort: number;
}

export interface GroupResult {
  id: string | null; // null = "Ohne Gruppe"
  name: string;
  color: string;
  value: number;
  sharePct: number;
  changePct: number;
}

export interface AlertResult {
  positionId: string;
  name: string;
  changePct: number;
  thresholdPct: number;
}

export interface DepotResult {
  value: number;
  prevValue: number;
  changeAbs: number;
  changePct: number;
  costBasis: number;
  sinceBuyAbs: number;
  sinceBuyPct: number;
  ytdAbs: number | null;
  ytdPct: number | null;
  groups: GroupResult[];
  alerts: AlertResult[];
  missing: string[]; // position ids without price
}

const pct = (part: number, base: number) => (base > 0 ? (part / base) * 100 : 0);

/** Change of a set of values relative to a base, in percent (weighted by value). */
function relChange(now: number, base: number): number {
  return base > 0 ? ((now - base) / base) * 100 : 0;
}

export function computeDepot(positions: PositionInput[], groups: GroupInput[], defaultThresholdPct = -3): DepotResult {
  const priced = positions.filter((p) => p.price && p.quantity > 0);
  const missing = positions.filter((p) => p.quantity > 0 && !p.price).map((p) => p.id);

  let value = 0;
  let prevValue = 0;
  let costBasis = 0;
  let ytdBase = 0;
  let ytdKnown = true;
  for (const p of priced) {
    const q = p.quantity;
    value += q * p.price!.last;
    prevValue += q * p.price!.prevClose;
    costBasis += q * p.costPerUnit;
    if (p.price!.yearStart !== undefined) ytdBase += q * p.price!.yearStart;
    else ytdKnown = false;
  }

  // Groups: sorted like the user's order; positions without (known) group go to "Ohne Gruppe" at the end.
  const known = new Map(groups.map((g) => [g.id, g]));
  const buckets = new Map<string | null, { value: number; prev: number }>();
  for (const p of priced) {
    const key = p.groupId && known.has(p.groupId) ? p.groupId : null;
    const b = buckets.get(key) ?? { value: 0, prev: 0 };
    b.value += p.quantity * p.price!.last;
    b.prev += p.quantity * p.price!.prevClose;
    buckets.set(key, b);
  }
  const groupResults: GroupResult[] = [...buckets.entries()]
    .map(([id, b]) => {
      const g = id ? known.get(id)! : null;
      return {
        id,
        name: g?.name ?? 'Ohne Gruppe',
        color: g?.color ?? '#A9B8C9',
        value: b.value,
        sharePct: pct(b.value, value),
        changePct: relChange(b.value, b.prev),
        sort: g?.sort ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.sort - b.sort || b.value - a.value)
    .map(({ sort: _sort, ...rest }) => rest);

  const alerts: AlertResult[] = priced
    .map((p) => {
      const changePct = relChange(p.price!.last, p.price!.prevClose);
      const thresholdPct = p.lossThresholdPct ?? defaultThresholdPct;
      return { positionId: p.id, name: p.name, changePct, thresholdPct };
    })
    .filter((a) => a.changePct <= a.thresholdPct)
    .sort((a, b) => a.changePct - b.changePct);

  return {
    value,
    prevValue,
    changeAbs: value - prevValue,
    changePct: relChange(value, prevValue),
    costBasis,
    sinceBuyAbs: value - costBasis,
    sinceBuyPct: relChange(value, costBasis),
    ytdAbs: ytdKnown && priced.length ? value - ytdBase : null,
    ytdPct: ytdKnown && priced.length ? relChange(value, ytdBase) : null,
    groups: groupResults,
    alerts,
    missing,
  };
}

/** Cost basis of the depot (works without prices). */
export function costBasisOf(positions: Pick<PositionInput, 'quantity' | 'costPerUnit'>[]): number {
  return positions.reduce((s, p) => s + p.quantity * p.costPerUnit, 0);
}
