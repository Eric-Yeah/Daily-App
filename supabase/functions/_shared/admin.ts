// Server-side helpers for the Daily Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

export { CORS, json } from './http.ts';

/** Service-role client for the "daily" schema (bypasses RLS; only used server-side). */
export function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false }, db: { schema: 'daily' } });
}

/** Same, for the Study App's tables in "public" (read-only use). */
export function adminPublic(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if the request carries the secret that only pg_cron knows (kept in Supabase Vault). */
export async function isCron(req: Request, db: SupabaseClient): Promise<boolean> {
  const given = req.headers.get('x-daily-cron') ?? '';
  if (given.length < 32) return false;
  const { data } = await db.rpc('cron_secret');
  return typeof data === 'string' && sameText(given, data);
}

/** The signed-in user behind a request, if they are the Daily owner. */
export async function ownerFromRequest(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const id = data.user?.id;
  if (!id) return null;
  const { data: row } = await db.from('owner').select('user_id').eq('user_id', id).maybeSingle();
  return row ? id : null;
}

export async function ownerId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from('owner').select('user_id').limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export interface OwnerSettings {
  timeZone: string;
  aiBudgetUsdMonth: number;
  push: { morning: string | null; afternoon: string | null; evening: string | null };
}

export async function ownerSettings(db: SupabaseClient, userId: string): Promise<OwnerSettings> {
  const { data } = await db.from('settings').select('*').eq('user_id', userId).maybeSingle();
  return {
    timeZone: (data?.time_zone as string) || 'Europe/Berlin',
    aiBudgetUsdMonth: data?.ai_budget_usd_month === undefined ? 1 : Number(data.ai_budget_usd_month),
    push: {
      morning: data ? (data.push_morning as string | null) : '07:00',
      afternoon: data ? (data.push_afternoon as string | null) : null,
      evening: data ? (data.push_evening as string | null) : '17:45',
    },
  };
}
