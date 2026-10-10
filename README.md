# Daily

Deine persönliche Tages-App (PWA, iPhone zuerst): **Morgen**, **Nachmittag** und **Abend** mit Depot-Überblick, Marktmeldungen, Training, Terminen und Aufgaben.

- Adresse: `https://eric-yeah.github.io/Daily-App/`
- Design in [`design/`](design/) (nur Referenz, wird nicht ausgeliefert). Der Projektbrief liegt nur lokal und ist nicht im Repository.

> **Informationen, keine Anlageberatung.** KI-Zusammenfassungen können Fehler enthalten, bitte das Original prüfen.

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| M1 | Oberfläche mit Beispieldaten, PWA, Deploy | **fertig** |
| M2 | Supabase, Login, Face-ID-Sperre | offen |
| M3 | Depot: Positionen, Gruppen, CSV-Import | offen |
| M4 | Kurse (kostenlose Anbieter) | offen |
| M5 | News und KI (Claude Haiku 5.5) | offen |
| M6 | Briefings vorab + Push | offen |
| M7 | Overload und Study App | offen |
| M8 | Feinschliff, Passkey-Login | offen |

Im Moment zeigt die App **Beispieldaten**. Das steht oben als „Beispieldaten · keine echten Kurse“ und lässt sich unter **Mehr → Beispieldaten anzeigen** ausschalten. Ohne Beispieldaten siehst du die ehrlichen Leerzustände („Noch keine Datenquelle verbunden“).

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org/) 24.

```bash
npm install
```

```bash
npm run dev
```

Dann im Browser `http://localhost:5173/Daily-App/` öffnen. Im Browser-Entwicklermodus die Breite auf 390 px stellen, so wie im Design.

### Testmodus für die Uhrzeit

Welche Ansicht vorgewählt ist und was die Countdowns anzeigen, hängt von der Uhrzeit ab. Zum Testen kannst du sie festlegen, und zwar als **Berliner Zeit**:

- Morgen: `http://localhost:5173/Daily-App/?now=2026-10-12T07:30`
- Nachmittag (wie im Mockup): `http://localhost:5173/Daily-App/?now=2026-10-12T14:32`
- Abend (wie im Mockup): `http://localhost:5173/Daily-App/?now=2026-10-12T17:45`
- Wochenende: `http://localhost:5173/Daily-App/?now=2026-10-10T12:00`

### Weitere Befehle

| Befehl | Was er macht |
|---|---|
| `npm test` | Tests (Zahlenformat, Zeitlogik) |
| `npm run check:public` | Prüft, dass nichts Privates im Code steht |
| `npm run build` | Typprüfung + fertige App in `dist/` |
| `npm run preview` | Den Build lokal ansehen (mit Service Worker und CSP) |
| `npm run icons` | App-Icons neu erzeugen |

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` baut die App automatisch und veröffentlicht sie (`.github/workflows/deploy.yml`). Vorher laufen `npm run check:public` (keine Schlüssel, E-Mail-Adressen oder Rechnernamen im Code), die Tests und eine Prüfung, dass kein Schlüssel im Build steckt.

### Am iPhone installieren

1. In **Safari** `https://eric-yeah.github.io/Daily-App/` öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → *Hinzufügen*.
3. Ab jetzt die App über das Symbol starten. Nur so funktionieren später auch Push-Nachrichten (iOS 16.4 oder neuer).

## Sicherheit und Datenschutz

- **Repository und Seite sind öffentlich.** Im Code stehen nie Geheimnisse oder persönliche Daten (Namen, E-Mail-Adressen, Schule, Depotwerte). Alles Private liegt ab M2 in Supabase hinter Login und Row Level Security. `npm run check:public` prüft das vor jedem Deploy.
- **Gemeinsame Adresse:** Alle deine Apps liegen unter `eric-yeah.github.io` und teilen sich denselben Browser-Ursprung. Deshalb:
  - nutzen alle Einträge im Browserspeicher das Präfix `daily:`, und der Offline-Cache heißt `daily-…`,
  - gibt es **keine Drittanbieter-Skripte**, die Schriften liegen selbst gehostet in der App,
  - verbietet eine strenge **Content-Security-Policy** alles außer der eigenen Adresse (und ab M2 Supabase),
  - werden Texte aus Meldungen nur als Text angezeigt, nie als HTML.
- **Die Adresse ist endgültig.** Face ID/Passkeys (ab M2) sind an `eric-yeah.github.io` gebunden. Ein Umzug würde sie ungültig machen.
- Schlüssel kommen nur in Supabase-Secrets oder in deine lokale `.env` (steht in `.gitignore`). Vorlage: [`.env.example`](.env.example).

## Ordner

```
src/
  main.tsx, app.tsx, router.ts   Einstieg, Tabs (Heute, Depot, News, Mehr)
  styles/                        Design-Tokens (Farben, Radien) und Styles
  lib/                           Zahlenformat, Zeitlogik, Diagramme, Einstellungen
  data/                          Datenquelle: Beispieldaten (mock.ts), später Supabase
  components/                    Karten, Diagramme, Listen nach dem Design
  views/today/                   Morgen, Nachmittag, Abend
public/icons/                    App-Icons (erzeugt mit npm run icons)
.github/workflows/deploy.yml     Build, Tests und Veröffentlichung
```

## Technik

Vite + Preact + TypeScript, `vite-plugin-pwa` (Service Worker, Manifest), Vitest. Schriften: Plus Jakarta Sans und IBM Plex Mono über `@fontsource`. Ab M2: Supabase (Schema `daily` im Study-App-Projekt), Edge Functions für Kurse, News, KI und Push.
