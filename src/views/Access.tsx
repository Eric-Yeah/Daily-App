import { useState } from 'preact/hooks';
import { Header } from '../components/Header';
import { signIn, signOut, verifyPassword } from '../lib/auth';
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
    else unlock(); // the password was just entered, no need to ask for Face ID right after
  };

  return (
    <main class="page page--plain">
      <Header dateLine="Dein Tagesüberblick" title="Daily" />
      <form class="card gap-12" onSubmit={submit}>
        <h2>Anmelden</h2>
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
        <button class="button button--wide" type="submit" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
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
            Die Datenbank für Daily ist noch nicht freigegeben. In Supabase unter Project Settings → Data API → Exposed
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

/** Shown when the app is locked, and as a privacy cover while it is in the background. */
export function LockScreen({ coverOnly = false }: { coverOnly?: boolean }) {
  const [message, setMessage] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const faceId = async () => {
    setMessage('');
    try {
      if (await webAuthnLock.verify()) unlock();
    } catch (e) {
      setMessage(lockErrorText(e));
    }
  };

  const withPassword = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const err = await verifyPassword(password);
    setBusy(false);
    if (err) setMessage(err);
    else unlock();
  };

  return (
    <main class="page page--plain lock" aria-label="Daily ist gesperrt">
      <div class="lock__icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="3" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h1 class="lock__title">Daily ist gesperrt</h1>
      {!coverOnly && (
        <section class="card gap-12">
          <button class="button button--wide" type="button" onClick={faceId}>
            Mit Face ID entsperren
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
