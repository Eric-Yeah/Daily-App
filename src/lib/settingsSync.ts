import { currentSession } from './auth';
import { getSettings, onSettingsChange, updateSettings, type Settings } from './settings';
import { daily } from './supabase';

// Keeps the synced settings in daily.settings. The local store stays the source for rendering
// (works offline); the database row wins when the app starts.

const COLUMNS = {
  displayName: 'display_name',
  timeZone: 'time_zone',
  tradingEnd: 'trading_end',
  hideAmounts: 'hide_amounts',
  lockTimeoutMin: 'lock_timeout_min',
  lossThresholdPct: 'loss_threshold_pct',
} as const satisfies Partial<Record<keyof Settings, string>>;

type Synced = keyof typeof COLUMNS;
const SYNCED = Object.keys(COLUMNS) as Synced[];

function toRow(s: Partial<Settings>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const k of SYNCED) if (k in s) row[COLUMNS[k]] = s[k];
  return row;
}

function fromRow(row: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED) {
    const v = row[COLUMNS[k]];
    // numeric columns come back as numbers or strings depending on the column type
    if (v !== undefined && v !== null) out[k] = k === 'lossThresholdPct' ? Number(v) : v;
  }
  return out as Partial<Settings>;
}

let pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | undefined;

async function flush() {
  const session = currentSession();
  if (!session || Object.keys(pending).length === 0) return;
  const row = { ...pending, user_id: session.user.id, updated_at: new Date().toISOString() };
  pending = {};
  await daily().from('settings').upsert(row);
}

/** Loads the settings row after login (creates it from the local values the first time). */
export async function pullSettings(): Promise<void> {
  const session = currentSession();
  if (!session) return;
  const { data, error } = await daily().from('settings').select('*').maybeSingle();
  if (error) return;
  if (data) updateSettings(fromRow(data), 'remote');
  else await daily().from('settings').insert({ ...toRow(getSettings()), user_id: session.user.id });
}

onSettingsChange((patch, origin) => {
  if (origin !== 'user' || !currentSession()) return;
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return;
  pending = { ...pending, ...row };
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 800);
});
