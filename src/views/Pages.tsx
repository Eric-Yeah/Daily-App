import { useEffect, useState } from 'preact/hooks';
import { Header } from '../components/Header';
import { ReleaseHistory } from '../components/Updates';
import { formatDateLong, formatPct } from '../lib/format';
import { currentSession, deletePasskey, listPasskeys, passkeysSupported, registerPasskey, signOut, useAuth, type PasskeyInfo } from '../lib/auth';
import { disableLock, lockEnabled, lockErrorText, webAuthnLock } from '../lib/lock';
import { aiSpentThisMonth, disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push';
import { isClockPinned } from '../lib/clock';
import { updateSettings, useSettings } from '../lib/settings';
import { parseHHMM } from '../lib/time';

export const DISCLAIMER =
  'Informationen, keine Anlageberatung. KI-Zusammenfassungen können Fehler enthalten, bitte das Original prüfen.';

export function MorePage() {
  const s = useSettings();
  return (
    <main class="page">
      <Header dateLine="Einstellungen und Hinweise" title="Mehr" />

      <section class="card gap-8">
        <h2>Anzeige</h2>
        <label class="setting">
          <span>
            Dein Name
            <span class="setting__hint">Für „Guten Morgen, …“. Steht nur in deinem Konto, nicht im Code.</span>
          </span>
          <input
            class="input"
            type="text"
            autocomplete="given-name"
            maxLength={40}
            value={s.displayName}
            onChange={(e) => updateSettings({ displayName: e.currentTarget.value.trim() })}
          />
        </label>
        <label class="setting">
          <span>
            Beträge ausblenden
            <span class="setting__hint">Zeigt „•••• €“ statt Euro-Beträgen, Prozente bleiben sichtbar.</span>
          </span>
          <input type="checkbox" checked={s.hideAmounts} onChange={(e) => updateSettings({ hideAmounts: e.currentTarget.checked })} />
        </label>
        <label class="setting">
          <span>
            Beispieldaten anzeigen
            <span class="setting__hint">Erfundene Werte, bis echte Datenquellen verbunden sind.</span>
          </span>
          <input type="checkbox" checked={s.showMockData} onChange={(e) => updateSettings({ showMockData: e.currentTarget.checked })} />
        </label>
      </section>

      <SecuritySection />
      <NotificationsSection />
      <AiSection />

      <section class="card gap-8">
        <h2>Markt</h2>
        <label class="setting">
          <span>
            Handelsende
            <span class="setting__hint">Ab dann zeigt „Heute“ die Abendansicht. Xetra: 17:30.</span>
          </span>
          <input
            class="input mono"
            type="time"
            value={s.tradingEnd}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (/^\d{2}:\d{2}$/.test(v) && parseHHMM(v) > 12 * 60) updateSettings({ tradingEnd: v });
            }}
          />
        </label>
        <label class="setting">
          <span>
            Verlustschwelle
            <span class="setting__hint">Ab diesem Tagesverlust erscheint eine Position unter „Auffällig“. Pro Position änderbar.</span>
          </span>
          <select
            class="input"
            value={String(s.lossThresholdPct)}
            onChange={(e) => updateSettings({ lossThresholdPct: Number(e.currentTarget.value) })}
          >
            {[-1, -2, -3, -4, -5, -7, -10].map((v) => (
              <option key={v} value={String(v)}>
                {formatPct(v, 0)}
              </option>
            ))}
          </select>
        </label>
        <div class="setting">
          <span>
            Zeitzone
            <span class="setting__hint">{s.timeZone}</span>
          </span>
        </div>
      </section>

      <section class="card gap-8">
        <h2>Hinweise</h2>
        <p class="disclaimer">{DISCLAIMER}</p>
        {isClockPinned && <p class="disclaimer">Testmodus: Die Uhrzeit ist über „?now=…“ festgelegt.</p>}
        <p class="disclaimer">Version {__APP_VERSION__}</p>
      </section>

      <section class="card gap-8">
        <h2>Was ist neu</h2>
        <ReleaseHistory />
      </section>
    </main>
  );
}

const TIMEOUTS: [number, string][] = [
  [0, 'sofort'],
  [1, 'nach 1 Min.'],
  [5, 'nach 5 Min.'],
  [15, 'nach 15 Min.'],
  [60, 'nach 1 Std.'],
];

function SecuritySection() {
  const auth = useAuth();
  const s = useSettings();
  const [enabled, setEnabled] = useState(lockEnabled());
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [passkeyMessage, setPasskeyMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    webAuthnLock.available().then(setAvailable);
    if (passkeysSupported()) void listPasskeys().then(setPasskeys);
  }, []);

  const addPasskey = async () => {
    setBusy(true);
    setPasskeyMessage('');
    const err = await registerPasskey();
    setBusy(false);
    if (err) return setPasskeyMessage(err);
    setPasskeyMessage('Passkey eingerichtet. Beim nächsten Anmelden reicht Face ID.');
    setPasskeys(await listPasskeys());
  };

  const removePasskey = async (p: PasskeyInfo) => {
    if (!confirm('Diesen Passkey entfernen? Die Anmeldung mit Passwort bleibt möglich.')) return;
    const err = await deletePasskey(p.id);
    if (err) return setPasskeyMessage(err);
    setPasskeyMessage('Passkey entfernt.');
    setPasskeys(await listPasskeys());
  };

  if (auth.status !== 'ready') return null;

  const enroll = async () => {
    setMessage('');
    try {
      await webAuthnLock.enroll();
      setEnabled(true);
      setMessage('Face ID ist eingerichtet. Ab dem nächsten Öffnen fragt Daily danach.');
    } catch (e) {
      setMessage(lockErrorText(e));
    }
  };

  const disable = () => {
    disableLock();
    setEnabled(false);
    setMessage('Die Sperre ist auf diesem Gerät aus.');
  };

  return (
    <>
      <section class="card gap-8">
        <h2>Sicherheit</h2>
        <div class="setting">
          <span>
            App-Sperre mit Face ID
            <span class="setting__hint">
              {enabled
                ? 'An auf diesem Gerät. Schützt vor fremden Händen am entsperrten Handy.'
                : available === false
                  ? 'Dieses Gerät bietet kein Face ID oder Touch ID für Web-Apps.'
                  : 'Beim Öffnen und nach einer Pause fragt Daily nach Face ID.'}
            </span>
          </span>
          {enabled ? (
            <button class="button button--secondary" type="button" onClick={disable}>
              Ausschalten
            </button>
          ) : (
            <button class="button" type="button" onClick={enroll} disabled={available === false}>
              Einrichten
            </button>
          )}
        </div>
        <label class="setting">
          <span>
            Sperren
            <span class="setting__hint">wenn Daily so lange im Hintergrund war</span>
          </span>
          <select
            class="input"
            value={String(s.lockTimeoutMin)}
            onChange={(e) => updateSettings({ lockTimeoutMin: Number(e.currentTarget.value) })}
          >
            {TIMEOUTS.map(([v, label]) => (
              <option key={v} value={String(v)}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p class="setting__hint" role="status">
            {message}
          </p>
        )}
        {passkeysSupported() && (
          <>
            <div class="setting">
              <span>
                Anmeldung mit Face ID (Passkey)
                <span class="setting__hint">Statt Passwort. Das Passwort bleibt als Rückfall. Noch im Test bei Supabase.</span>
              </span>
              <button class="button" type="button" onClick={addPasskey} disabled={busy}>
                Hinzufügen
              </button>
            </div>
            {passkeys && passkeys.length > 0 && (
              <ul class="plain-list">
                {passkeys.map((p) => (
                  <li key={p.id} class="setting">
                    <span>
                      {p.name}
                      <span class="setting__hint">eingerichtet am {formatDateLong(p.createdAt, s.timeZone)}</span>
                    </span>
                    <button class="button button--secondary" type="button" onClick={() => void removePasskey(p)}>
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {passkeyMessage && (
              <p class="setting__hint" role="status">
                {passkeyMessage}
              </p>
            )}
          </>
        )}
      </section>

      <section class="card gap-8">
        <h2>Konto</h2>
        <div class="setting">
          <span>
            Angemeldet
            <span class="setting__hint">{currentSession()?.user.email}</span>
          </span>
          <button class="button button--secondary" type="button" onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
      </section>
    </>
  );
}

const PUSH_TIMES: { key: 'pushMorning' | 'pushAfternoon' | 'pushEvening'; label: string; options: string[] }[] = [
  { key: 'pushMorning', label: 'Morgenbriefing', options: ['06:00', '06:30', '07:00', '07:30', '08:00'] },
  { key: 'pushAfternoon', label: 'Nachmittag', options: ['12:00', '13:00', '14:00', '15:00', '16:00'] },
  { key: 'pushEvening', label: 'Abendbriefing', options: ['17:35', '17:45', '18:00', '18:30', '19:00', '20:00'] },
];

const PUSH_HINT: Record<PushState, string> = {
  unsupported: 'Dieser Browser kann keine Benachrichtigungen.',
  'needs-install': 'Am iPhone geht das nur in der App vom Home-Bildschirm: Safari → Teilen → „Zum Home-Bildschirm“, dann Daily von dort öffnen.',
  denied: 'Benachrichtigungen sind blockiert. iPhone: Einstellungen → Mitteilungen → Daily → Mitteilungen erlauben.',
  off: 'Aus auf diesem Gerät. Die Nachrichten enthalten nie Zahlen, nur „Dein Briefing ist fertig“.',
  on: 'An auf diesem Gerät.',
};

function NotificationsSection() {
  const auth = useAuth();
  const s = useSettings();
  const [state, setState] = useState<PushState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState);
  }, []);

  if (auth.status !== 'ready') return null;

  const toggle = async () => {
    setBusy(true);
    setMessage('');
    if (state === 'on') {
      await disablePush();
      setMessage('Benachrichtigungen auf diesem Gerät aus.');
    } else {
      const err = await enablePush();
      setMessage(err ?? 'Eingeschaltet. Tipp auf „Test senden“, um es auszuprobieren.');
    }
    setState(await pushState());
    setBusy(false);
  };

  return (
    <section class="card gap-8">
      <h2>Benachrichtigungen</h2>
      <div class="setting">
        <span>
          Push auf diesem Gerät
          <span class="setting__hint">{state ? PUSH_HINT[state] : ' '}</span>
        </span>
        {(state === 'on' || state === 'off') && (
          <button class={`button${state === 'on' ? ' button--secondary' : ''}`} type="button" disabled={busy} onClick={toggle}>
            {state === 'on' ? 'Ausschalten' : 'Einschalten'}
          </button>
        )}
      </div>
      {PUSH_TIMES.map((t) => (
        <label key={t.key} class="setting">
          <span>{t.label}</span>
          <select class="input" value={s[t.key] ?? ''} onChange={(e) => updateSettings({ [t.key]: e.currentTarget.value || null })}>
            <option value="">aus</option>
            {t.options.map((o) => (
              <option key={o} value={o}>
                {o} Uhr
              </option>
            ))}
          </select>
        </label>
      ))}
      {state === 'on' && (
        <button class="link-button" type="button" onClick={async () => setMessage(await sendTestPush())}>
          Test senden
        </button>
      )}
      {message && (
        <p class="setting__hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function AiSection() {
  const auth = useAuth();
  const s = useSettings();
  const [spent, setSpent] = useState<number | null>(null);
  useEffect(() => {
    if (auth.status === 'ready') aiSpentThisMonth().then(setSpent);
  }, [auth.status]);
  if (auth.status !== 'ready') return null;
  const usd = (v: number) => `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} $`;
  return (
    <section class="card gap-8">
      <h2>KI-Zusammenfassungen</h2>
      <label class="setting">
        <span>
          Obergrenze pro Monat
          <span class="setting__hint">
            {spent === null ? 'Verbrauch wird geladen …' : `Diesen Monat verbraucht: ${usd(spent)}.`} Danach stoppt die KI bis zum Monatsende, Meldungen gibt es weiter.
          </span>
        </span>
        <select class="input" value={String(s.aiBudgetUsdMonth)} onChange={(e) => updateSettings({ aiBudgetUsdMonth: Number(e.currentTarget.value) })}>
          {[0, 0.5, 1, 2, 5].map((v) => (
            <option key={v} value={String(v)}>
              {v === 0 ? 'aus' : usd(v)}
            </option>
          ))}
        </select>
      </label>
      <p class="setting__hint">Modell: Claude Haiku 5.5. Zusammenfassungen in der Sprache der Quelle, ohne Anlageempfehlung.</p>
    </section>
  );
}
