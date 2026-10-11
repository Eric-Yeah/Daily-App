// Depot data: groups and positions. Supabase when signed in, an in-memory store otherwise
// (local development without login, clearly empty, nothing is invented).
import { useEffect, useState } from 'preact/hooks';
import { currentSession } from '../lib/auth';
import type { ImportItem } from '../lib/csv';
import { daily } from '../lib/supabase';
import { invalidateMarket } from './market';
import { failed, ok, type Block } from './types';

export interface Group {
  id: string;
  name: string;
  color: string;
  sort: number;
}

export interface Position {
  id: string;
  name: string;
  isin: string;
  quantity: number;
  costPerUnit: number;
  currency: string;
  groupId: string | null;
  lossThresholdPct: number | null;
  topics: string[];
  manualPrice: number | null;
  providerSymbol: string | null; // price provider symbol; found automatically per ISIN, editable
  archived: boolean;
}

export type PositionDraft = Omit<Position, 'id'> & { id?: string };

export interface DepotData {
  groups: Group[];
  positions: Position[];
}

/** Group and topics for a newly imported position. */
export type Assign = (item: ImportItem) => { groupId: string | null; topics: string[] };

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export interface DepotStore {
  load(): Promise<Block<DepotData>>;
  saveGroup(g: Omit<Group, 'id'> & { id?: string }): Promise<string | null>; // error text or null
  deleteGroup(id: string): Promise<string | null>;
  savePosition(p: PositionDraft): Promise<string | null>;
  deletePosition(id: string): Promise<string | null>;
  importItems(items: ImportItem[], duplicates: 'update' | 'skip', assign: Assign): Promise<ImportResult | string>;
  subscribe(l: () => void): () => void;
}

type Row = Record<string, unknown>;

const toPosition = (r: Row): Position => ({
  id: r.id as string,
  name: r.name as string,
  isin: r.isin as string,
  quantity: Number(r.quantity),
  costPerUnit: Number(r.cost_per_unit),
  currency: (r.currency as string) ?? 'EUR',
  groupId: (r.group_id as string | null) ?? null,
  lossThresholdPct: r.loss_threshold_pct === null || r.loss_threshold_pct === undefined ? null : Number(r.loss_threshold_pct),
  topics: (r.topics as string[]) ?? [],
  manualPrice: r.manual_price === null || r.manual_price === undefined ? null : Number(r.manual_price),
  providerSymbol: (r.provider_symbol as string | null) ?? null,
  archived: Boolean(r.archived),
});

const fromPosition = (p: PositionDraft): Row => ({
  ...(p.id ? { id: p.id } : {}),
  name: p.name,
  isin: p.isin,
  quantity: p.quantity,
  cost_per_unit: p.costPerUnit,
  currency: p.currency,
  group_id: p.groupId,
  loss_threshold_pct: p.lossThresholdPct,
  topics: p.topics,
  manual_price: p.manualPrice,
  manual_price_at: p.manualPrice ? new Date().toISOString() : null,
  provider_symbol: p.providerSymbol,
  archived: p.archived,
  updated_at: new Date().toISOString(),
});

function errorText(message: string): string {
  if (/duplicate key.*isin|positions_user_id_isin_key/i.test(message)) return 'Diese ISIN hast du schon im Depot.';
  if (/duplicate key.*name|groups_user_id_name_key/i.test(message)) return 'Eine Gruppe mit diesem Namen gibt es schon.';
  if (/check constraint/i.test(message)) return 'Bitte prüfe deine Eingaben.';
  if (/fetch|network/i.test(message)) return 'Keine Verbindung. Versuch es gleich nochmal.';
  return 'Speichern gerade nicht möglich.';
}

function createSupabaseDepot(): DepotStore {
  const listeners = new Set<() => void>();
  const emit = () => {
    invalidateMarket();
    listeners.forEach((l) => l());
  };
  const done = (error: { message: string } | null) => {
    if (!error) emit();
    return error ? errorText(error.message) : null;
  };
  return {
    async load() {
      const [g, p] = await Promise.all([
        daily().from('groups').select('id,name,color,sort').order('sort').order('name'),
        daily().from('positions').select('*').order('name'),
      ]);
      if (g.error || p.error) return failed('Depot gerade nicht verfügbar.');
      return ok({ groups: g.data as Group[], positions: (p.data as Row[]).map(toPosition) });
    },
    async saveGroup(g) {
      const { error } = await daily().from('groups').upsert(g);
      return done(error);
    },
    async deleteGroup(id) {
      const { error } = await daily().from('groups').delete().eq('id', id);
      return done(error);
    },
    async savePosition(p) {
      const { error } = p.id
        ? await daily().from('positions').update(fromPosition(p)).eq('id', p.id)
        : await daily().from('positions').insert(fromPosition(p));
      return done(error);
    },
    async deletePosition(id) {
      const { error } = await daily().from('positions').delete().eq('id', id);
      return done(error);
    },
    async importItems(items, duplicates, assign) {
      const valid = items.filter((i) => i.status !== 'error');
      const fresh = valid.filter((i) => i.status === 'new');
      const dupes = valid.filter((i) => i.status === 'duplicate');
      const rows = (list: ImportItem[], fresh: boolean) =>
        list.map((i) => {
          const a = fresh ? assign(i) : null;
          return {
            name: i.name,
            isin: i.isin,
            quantity: i.quantity,
            cost_per_unit: i.costPerUnit,
            ...(a ? { group_id: a.groupId, topics: a.topics } : {}),
            updated_at: new Date().toISOString(),
          };
        });
      if (fresh.length) {
        const { error } = await daily().from('positions').insert(rows(fresh, true));
        if (error) return errorText(error.message);
      }
      if (duplicates === 'update' && dupes.length) {
        // Only quantity, cost and name change; group, topics and thresholds stay as they are.
        const { error } = await daily().from('positions').upsert(rows(dupes, false), { onConflict: 'user_id,isin' });
        if (error) return errorText(error.message);
      }
      emit();
      return {
        created: fresh.length,
        updated: duplicates === 'update' ? dupes.length : 0,
        skipped: (duplicates === 'skip' ? dupes.length : 0) + (items.length - valid.length),
      };
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

function createMemoryDepot(): DepotStore {
  let data: DepotData = { groups: [], positions: [] };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const id = () => crypto.randomUUID();
  return {
    async load() {
      return ok(structuredClone(data));
    },
    async saveGroup(g) {
      if (data.groups.some((x) => x.name === g.name && x.id !== g.id)) return 'Eine Gruppe mit diesem Namen gibt es schon.';
      data.groups = g.id ? data.groups.map((x) => (x.id === g.id ? { ...x, ...g, id: x.id } : x)) : [...data.groups, { ...g, id: id() }];
      data.groups.sort((a, b) => a.sort - b.sort);
      emit();
      return null;
    },
    async deleteGroup(gid) {
      data.groups = data.groups.filter((g) => g.id !== gid);
      data.positions = data.positions.map((p) => (p.groupId === gid ? { ...p, groupId: null } : p));
      emit();
      return null;
    },
    async savePosition(p) {
      if (data.positions.some((x) => x.isin === p.isin && x.id !== p.id)) return 'Diese ISIN hast du schon im Depot.';
      data.positions = p.id
        ? data.positions.map((x) => (x.id === p.id ? ({ ...p } as Position) : x))
        : [...data.positions, { ...p, id: id() }];
      emit();
      return null;
    },
    async deletePosition(pid) {
      data.positions = data.positions.filter((p) => p.id !== pid);
      emit();
      return null;
    },
    async importItems(items, duplicates, assign) {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const i of items) {
        const existing = data.positions.find((p) => p.isin === i.isin);
        if (i.status === 'error') skipped++;
        else if (!existing) {
          const { groupId, topics } = assign(i);
          data.positions.push({
            id: id(),
            name: i.name,
            isin: i.isin,
            quantity: i.quantity,
            costPerUnit: i.costPerUnit,
            currency: 'EUR',
            groupId,
            lossThresholdPct: null,
            topics,
            manualPrice: null,
            providerSymbol: null,
            archived: false,
          });
          created++;
        } else if (duplicates === 'update') {
          Object.assign(existing, { name: i.name, quantity: i.quantity, costPerUnit: i.costPerUnit });
          updated++;
        } else skipped++;
      }
      emit();
      return { created, updated, skipped };
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

let store: { key: string; value: DepotStore } | null = null;

export function getDepotStore(): DepotStore {
  const key = currentSession()?.user.id ?? 'memory';
  if (!store || store.key !== key) store = { key, value: key === 'memory' ? createMemoryDepot() : createSupabaseDepot() };
  return store.value;
}

/** Loads the depot and reloads after every change. */
export function useDepot(): { block: Block<DepotData> | undefined; store: DepotStore } {
  const s = getDepotStore();
  const [block, setBlock] = useState<Block<DepotData>>();
  useEffect(() => {
    let alive = true;
    const load = () => s.load().then((b) => alive && setBlock(b));
    load();
    const off = s.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [s]);
  return { block, store: s };
}
