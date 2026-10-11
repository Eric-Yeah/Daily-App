import { useEffect, useState } from 'preact/hooks';
import { getSettings } from './settings';
import { storage } from './storage';

// App lock, stage 1: a local WebAuthn check (Face ID / Touch ID) on this device.
// It protects against other hands on an unlocked phone; the real protection is the login + RLS.
// Stage 2 (passkey as the actual login via Supabase) can be added as another LockMethod.

export interface LockMethod {
  kind: 'webauthn-local';
  available(): Promise<boolean>;
  enroll(): Promise<void>;
  verify(): Promise<boolean>;
}

const CRED_KEY = 'lock';

interface StoredCredential {
  id: string; // base64url credential id
  createdAt: string;
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function stored(): StoredCredential | null {
  return storage.getJSON<StoredCredential>(CRED_KEY) ?? null;
}

export const webAuthnLock: LockMethod = {
  kind: 'webauthn-local',

  async available() {
    try {
      return (
        typeof PublicKeyCredential !== 'undefined' &&
        (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
      );
    } catch {
      return false;
    }
  },

  async enroll() {
    const existing = stored();
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Daily', id: location.hostname },
        // No personal data: the authenticator only needs some stable id for this lock.
        user: { id: randomBytes(16), name: 'Daily-Sperre', displayName: 'Daily-Sperre' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        excludeCredentials: existing ? [{ type: 'public-key', id: fromBase64Url(existing.id) }] : [],
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Einrichtung abgebrochen');
    storage.setJSON(CRED_KEY, { id: toBase64Url(new Uint8Array(cred.rawId)), createdAt: new Date().toISOString() });
  },

  async verify() {
    const c = stored();
    if (!c) return false;
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(c.id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    return !!assertion;
  },
};

export const lockEnabled = (): boolean => stored() !== null;

export function disableLock(): void {
  storage.remove(CRED_KEY);
  locked = false;
  emit();
}

/**
 * Should the app lock after having been in the background?
 * timeout 0 = lock on every return; hiddenAt null = never hidden (fresh start is handled separately).
 */
export function shouldLock(hiddenAt: number | null, now: number, timeoutMin: number): boolean {
  if (hiddenAt === null) return false;
  return now - hiddenAt >= timeoutMin * 60_000;
}

// --- Lock state (in memory: a fresh app start always begins locked when the lock is on) ---
let locked = lockEnabled();
let covered = false; // hides content while in the background (app switcher snapshot)
let hiddenAt: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function unlock(): void {
  locked = false;
  covered = false;
  emit();
}

export function lockNow(): void {
  if (!lockEnabled()) return;
  locked = true;
  emit();
}

function onVisibility() {
  if (!lockEnabled()) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    covered = true;
  } else {
    if (shouldLock(hiddenAt, Date.now(), getSettings().lockTimeoutMin)) locked = true;
    covered = false;
    hiddenAt = null;
  }
  emit();
}

let listening = false;
export function useLock(): { locked: boolean; covered: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!listening) {
      listening = true;
      document.addEventListener('visibilitychange', onVisibility);
    }
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { locked: locked && lockEnabled(), covered: covered && lockEnabled() };
}

/** German message for WebAuthn errors. */
export function lockErrorText(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return 'Abgebrochen oder nicht erkannt. Versuch es nochmal.';
  if (name === 'InvalidStateError') return 'Face ID ist auf diesem Gerät schon eingerichtet.';
  if (name === 'SecurityError') return 'Face ID geht nur über die echte App-Adresse (https).';
  return 'Face ID gerade nicht möglich.';
}
