import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// URL and anon key are public by design (they ship in the bundle); Row Level Security protects the data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** The Supabase client (only call when `supabaseConfigured`). */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // Own key: the Study App uses the same project on the same origin.
        storageKey: 'daily:auth',
      },
    });
  }
  return client;
}

/** Shortcut for tables in the "daily" schema. */
export const daily = () => supabase().schema('daily');

/** True if the error means "the schema daily is not exposed in the Data API yet". */
export function isSchemaNotExposed(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST106' || /schema must be one of/i.test(error.message ?? ''));
}
