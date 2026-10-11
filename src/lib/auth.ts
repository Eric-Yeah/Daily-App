import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'preact/hooks';
import { storage } from './storage';
import { daily, isSchemaNotExposed, supabase, supabaseConfigured } from './supabase';

export type AuthState =
  | { status: 'disabled' } // no Supabase configured (local dev with mock data only)
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'no-access'; email: string; reason: 'not-owner' | 'schema' }
  | { status: 'ready'; session: Session };

// Last successful owner check per user, so the app also opens offline.
const OWNER_CACHE = 'owner-ok';

// Local development only: "?demo" runs without login and without Supabase (in-memory data).
// The production build never contains this switch.
const demo = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
const enabled = supabaseConfigured && !demo;

let state: AuthState = enabled ? { status: 'loading' } : { status: 'disabled' };
const listeners = new Set<(s: AuthState) => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l(state));
}

export function getAuth(): AuthState {
  return state;
}

export function currentSession(): Session | null {
  return state.status === 'ready' ? state.session : null;
}

async function checkOwner(session: Session): Promise<AuthState> {
  const { data, error } = await daily().from('owner').select('user_id').maybeSingle();
  if (error) {
    if (isSchemaNotExposed(error)) return { status: 'no-access', email: session.user.email ?? '', reason: 'schema' };
    // Offline or server trouble: trust the last successful check for this user.
    if (storage.get(OWNER_CACHE) === session.user.id) return { status: 'ready', session };
    throw error;
  }
  if (!data) {
    storage.remove(OWNER_CACHE);
    return { status: 'no-access', email: session.user.email ?? '', reason: 'not-owner' };
  }
  storage.set(OWNER_CACHE, session.user.id);
  return { status: 'ready', session };
}

async function apply(session: Session | null) {
  if (!session) return set({ status: 'signed-out' });
  try {
    set(await checkOwner(session));
  } catch {
    // Unknown state and no cache: show the login again rather than half-loaded data.
    set({ status: 'signed-out' });
  }
}

let started = false;
function start() {
  if (started || !enabled) return;
  started = true;
  const auth = supabase().auth;
  auth.getSession().then(({ data }) => apply(data.session));
  auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') set({ status: 'signed-out' });
    else if (event === 'SIGNED_IN') apply(session);
    else if (event === 'TOKEN_REFRESHED' && session && state.status === 'ready') set({ status: 'ready', session });
  });
}

export function useAuth(): AuthState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    start();
    listeners.add(setValue);
    setValue(state);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** German error text for the login form. */
export function loginErrorText(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/email not confirmed/i.test(message)) return 'Die E-Mail-Adresse ist noch nicht bestätigt.';
  if (/rate limit|too many/i.test(message)) return 'Zu viele Versuche. Bitte warte kurz.';
  if (/fetch|network/i.test(message)) return 'Keine Verbindung. Prüfe dein Internet.';
  return 'Anmeldung gerade nicht möglich.';
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  return error ? loginErrorText(error.message) : null;
}

// ---------- Passkey login (Supabase passkeys, beta) ----------
// A passkey is a real credential held by Supabase: the phone proves with Face ID, Supabase checks the
// signature and issues the session. The password stays as the fallback. The passkey is bound to this
// site's address (eric-yeah.github.io), see the README.

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: Date;
}

// Remembered per device once a passkey worked here, so the login page can ask for Face ID right away.
const PASSKEY_HINT = 'passkey-hint';
export const passkeyKnown = (): boolean => storage.get(PASSKEY_HINT) === '1';

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** German text for a failed passkey step. */
export function passkeyErrorText(error: { name?: string; message?: string; status?: number } | null | undefined): string {
  const msg = error?.message ?? '';
  if (error?.name === 'NotAllowedError' || /not allowed|cancel|abort|timed out/i.test(msg)) return 'Abgebrochen. Du kannst es nochmal versuchen oder das Passwort nutzen.';
  if (/not enabled|disabled|not supported|404|not found/i.test(msg) || error?.status === 404) {
    return 'Passkeys sind im Supabase-Projekt noch nicht eingeschaltet (siehe README).';
  }
  if (/fetch|network/i.test(msg)) return 'Keine Verbindung. Prüfe dein Internet.';
  if (/no.*(credential|passkey)|unknown credential/i.test(msg)) return 'Für dieses Gerät ist noch kein Passkey eingerichtet. Melde dich mit dem Passwort an und richte ihn unter „Mehr → Sicherheit“ ein.';
  return 'Passkey gerade nicht möglich. Nutze das Passwort.';
}

export async function signInWithPasskey(): Promise<string | null> {
  try {
    const { error } = await supabase().auth.signInWithPasskey();
    if (!error) storage.set(PASSKEY_HINT, '1');
    return error ? passkeyErrorText(error) : null;
  } catch (e) {
    return passkeyErrorText(e as Error);
  }
}

/** Registers a passkey for the signed-in account (asks for Face ID). */
export async function registerPasskey(): Promise<string | null> {
  try {
    const { error } = await supabase().auth.registerPasskey();
    if (!error) storage.set(PASSKEY_HINT, '1');
    return error ? passkeyErrorText(error) : null;
  } catch (e) {
    return passkeyErrorText(e as Error);
  }
}

export async function listPasskeys(): Promise<PasskeyInfo[] | null> {
  try {
    const { data, error } = await supabase().auth.passkey.list();
    if (error || !data) return null;
    return data.map((p) => ({ id: p.id, name: p.friendly_name || 'Passkey', createdAt: new Date(p.created_at) }));
  } catch {
    return null;
  }
}

export async function deletePasskey(id: string): Promise<string | null> {
  try {
    const { error } = await supabase().auth.passkey.delete({ passkeyId: id });
    return error ? passkeyErrorText(error) : null;
  } catch (e) {
    return passkeyErrorText(e as Error);
  }
}

/** Checks the password of the signed-in user again (fallback for the app lock). */
export async function verifyPassword(password: string): Promise<string | null> {
  const email = currentSession()?.user.email;
  if (!email) return 'Nicht angemeldet.';
  return signIn(email, password);
}

export async function signOut(): Promise<void> {
  storage.remove(OWNER_CACHE);
  await supabase().auth.signOut();
}
