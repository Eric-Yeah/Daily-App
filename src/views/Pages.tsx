import { Header } from '../components/Header';
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
            <span class="setting__hint">Für „Guten Morgen, …“. Bleibt nur auf diesem Gerät.</span>
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
