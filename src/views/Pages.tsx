import { useEffect, useState } from 'preact/hooks';
import { Header } from '../components/Header';
import { currentSession, signOut, useAuth } from '../lib/auth';
import { disableLock, lockEnabled, lockErrorText, webAuthnLock } from '../lib/lock';
import { isClockPinned } from '../lib/clock';
import { updateSettings, useSettings } from '../lib/settings';
import { parseHHMM } from '../lib/time';

export const DISCLAIMER =
  'Informationen, keine Anlageberatung. KI-Zusammenfassungen können Fehler enthalten, bitte das Original prüfen.';

export function DepotPage() {
  return (
    <main class="page">
      <Header dateLine="Positionen und Gruppen" title="Depot" />
      <section class="card gap-8 block-state">
        <h2 class="block-state__title">Kommt in Meilenstein M3</h2>
        <p>Hier legst du deine Positionen an, ordnest sie Gruppen zu und importierst die CSV deines Brokers.</p>
      </section>
    </main>
  );
}

export function NewsPage() {
  return (
    <main class="page">
      <Header dateLine="Meldungen zu deinen Themen" title="News" />
      <section class="card gap-8 block-state">
        <h2 class="block-state__title">Kommt in Meilenstein M5</h2>
        <p>Hier erscheinen alle Meldungen zu deinen Themen mit KI-Kurzfassung und Link zum Original.</p>
      </section>
    </main>
  );
}

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

  useEffect(() => {
    webAuthnLock.available().then(setAvailable);
  }, []);

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
