import { useEffect, useRef, useState } from 'preact/hooks';
import { Header } from '../components/Header';
import { passkeyKnown, passkeysSupported, signIn, signInWithPasskey, signOut, verifyPassword } from '../lib/auth';
import { biometricName } from '../lib/device';
import { lockErrorText, unlock, webAuthnLock } from '../lib/lock';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else unlock(); // the password was just entered, no need to ask for the biometric check right after
  };

  // `auto`: started by the page itself, not by a tap. Some browsers refuse that without a gesture,
  // so a failure stays silent and the button is still there.
  const withPasskey = async (auto = false) => {
    setBusy(true);
    setError('');
    const err = await signInWithPasskey();
    setBusy(false);
    if (err) {
      if (!auto) setError(err);
    } else unlock(); // the biometric check was just done by the passkey itself
  };

  // Once a passkey worked on this device, ask for Face ID right away: open the app, confirm, done.
  useEffect(() => {
    if (passkeysSupported() && passkeyKnown() && document.visibilityState === 'visible') void withPasskey(true);
  }, []);

  return (
    <main class="page page--plain">
      <Header dateLine="Dein Tagesüberblick" title="Daily" />
      <form class="card gap-12" onSubmit={submit}>
        <h2>Anmelden</h2>
        {passkeysSupported() && (
          <>
            <button class="button button--wide" type="button" onClick={() => void withPasskey()} disabled={busy}>
              Mit {biometricName()} anmelden
            </button>
            <p class="note">Geht, sobald du unter „Mehr → Sicherheit“ einen Passkey eingerichtet hast. Sonst melde dich mit dem Passwort an.</p>
          </>
        )}
        <p class="card-sub">Mit deinem Konto aus der Study App. Du bleibst danach angemeldet.</p>
        <label class="field">
          <span class="field__label">E-Mail</span>
          <input
            class="input"
            type="email"
            autocomplete="username"
            inputMode="email"
            required
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field__label">Passwort</span>
          <input
            class="input"
            type="password"
            autocomplete="current-password"
            required
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        {error && (
          <p class="form-error" role="alert">
            {error}
          </p>
        )}
        <button class={`button button--wide${passkeysSupported() ? ' button--secondary' : ''}`} type="submit" disabled={busy}>
          {busy ? 'Anmelden …' : 'Mit Passwort anmelden'}
        </button>
        <p class="note">Passwort vergessen? Setz es in der Study App zurück, es ist dasselbe Konto.</p>
      </form>
    </main>
  );
}

export function NoAccessPage({ email, reason }: { email: string; reason: 'not-owner' | 'schema' }) {
  return (
    <main class="page page--plain">
      <Header dateLine="Daily" title="Kein Zugang" />
      <section class="card gap-12">
        {reason === 'schema' ? (
          <p class="card-sub">
            Die Datenbank für Daily ist noch nicht freigegeben. In Supabase unter Integrations → Data API → Settings → Exposed
            schemas muss „daily“ eingetragen sein (siehe README).
          </p>
        ) : (
          <p class="card-sub">
            Das Konto {email} ist für Daily nicht freigeschaltet. Daily ist eine persönliche App; nur das eingetragene
            Konto hat Zugriff.
          </p>
        )}
        <button class="button button--wide" type="button" onClick={() => void signOut()}>
          Abmelden
        </button>
      </section>
    </main>
  );
}

/** Time the unlock animation takes before the app shows (keep in sync with `.lock--opening` in components.css). */
const OPEN_MS = 760;

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shown when the app is locked, and as a privacy cover while it is in the background. */
export function LockScreen({ coverOnly = false }: { coverOnly?: boolean }) {
  const [message, setMessage] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const checking = useRef(false);

  // Plays the opening animation, then lets the app in.
  const open = () => {
    if (reducedMotion()) return unlock();
    setOpening(true);
    setTimeout(unlock, OPEN_MS);
  };

  // `auto`: started by the screen itself, not by a tap. Some browsers refuse that without a gesture,
  // so a failure stays silent and the button is still there.
  const faceId = async (auto = false) => {
    if (checking.current || opening) return;
    checking.current = true;
    setMessage('');
    try {
      if (await webAuthnLock.verify()) open();
    } catch (e) {
      if (!auto) setMessage(lockErrorText(e));
    } finally {
      checking.current = false;
    }
  };

  // Ask for Face ID as soon as the lock appears (app start, return after the pause).
  useEffect(() => {
    if (!coverOnly && document.visibilityState === 'visible') void faceId(true);
  }, [coverOnly]);

  const withPassword = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const err = await verifyPassword(password);
    setBusy(false);
    if (err) setMessage(err);
    else open();
  };

  return (
    <main class={`page page--plain lock${opening ? ' lock--opening' : ''}`} aria-label={opening ? 'Daily ist entsperrt' : 'Daily ist gesperrt'}>
      <div class="lock__icon" aria-hidden="true">
        <span class="lock__ring" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path class="lock__shackle" d="M8 11V8a4 4 0 0 1 8 0v3" />
          <rect x="5" y="11" width="14" height="10" rx="3" />
        </svg>
      </div>
      <h1 class="lock__title">{opening ? 'Entsperrt' : 'Daily ist gesperrt'}</h1>
      {!coverOnly && (
        <section class="card gap-12 lock__panel">
          <button class="button button--wide" type="button" onClick={() => void faceId()}>
            Mit {biometricName()} entsperren
          </button>
          {message && (
            <p class="form-error" role="alert">
              {message}
            </p>
          )}
          {usePassword ? (
            <form class="input-row" onSubmit={withPassword}>
              <input
                class="input"
                type="password"
                autocomplete="current-password"
                aria-label="Passwort"
                placeholder="Passwort"
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              <button class="button" type="submit" disabled={busy || !password}>
                OK
              </button>
            </form>
          ) : (
            <button class="link-button" type="button" onClick={() => setUsePassword(true)}>
              Stattdessen mit Passwort
            </button>
          )}
        </section>
      )}
    </main>
  );
}
