# Daily

Deine persönliche Tages-App (PWA, iPhone zuerst): **Morgen**, **Nachmittag** und **Abend** mit Depot-Überblick, Marktmeldungen, Training, Terminen und Aufgaben.

- Adresse: `https://eric-yeah.github.io/Daily-App/`
- Design in [`design/`](design/) (nur Referenz, wird nicht ausgeliefert). Der Projektbrief liegt nur lokal und ist nicht im Repository.

> **Informationen, keine Anlageberatung.** KI-Zusammenfassungen können Fehler enthalten, bitte das Original prüfen.

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| M1 | Oberfläche mit Beispieldaten, PWA, Deploy | **fertig** |
| M2 | Supabase, Login, Face-ID-Sperre | **fertig** |
| M3 | Depot: Positionen, Gruppen, CSV-Import | **fertig** |
| M4 | Kurse (kostenlose Anbieter) | offen |
| M5 | News und KI (Claude Haiku 5.5) | offen |
| M6 | Briefings vorab + Push | offen |
| M7 | Overload und Study App | offen |
| M8 | Feinschliff, Passkey-Login | offen |

Kurse, Meldungen, Termine, Training und „Dein Tag“ sind noch **Beispieldaten**. Das steht oben als „Beispieldaten · keine echten Kurse“ und lässt sich unter **Mehr → Beispieldaten anzeigen** ausschalten. Ohne Beispieldaten siehst du die ehrlichen Leerzustände („Noch keine Datenquelle verbunden“). **Echt** sind: Anmeldung, Einstellungen, „Heute erledigen“, „Eine Zeile zum Tag“ (seit M2) und das **Depot** mit Positionen, Gruppen und CSV-Import (seit M3). Die Kurse dazu kommen mit M4.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org/) 24.

```bash
npm install
```

```bash
npm run dev
```

Dann im Browser `http://localhost:5173/Daily-App/` öffnen. Mit `?demo` (`http://localhost:5173/Daily-App/?demo`) läuft die App lokal ohne Anmeldung mit einem leeren Speicher im Browser, praktisch zum Ausprobieren. Den Demo-Modus gibt es nur lokal, nicht in der veröffentlichten App. Im Browser-Entwicklermodus die Breite auf 390 px stellen, so wie im Design.

### Testmodus für die Uhrzeit

Welche Ansicht vorgewählt ist und was die Countdowns anzeigen, hängt von der Uhrzeit ab. Zum Testen kannst du sie festlegen, und zwar als **Berliner Zeit**:

- Morgen: `http://localhost:5173/Daily-App/?now=2026-10-12T07:30`
- Nachmittag (wie im Mockup): `http://localhost:5173/Daily-App/?now=2026-10-12T14:32`
- Abend (wie im Mockup): `http://localhost:5173/Daily-App/?now=2026-10-12T17:45`
- Wochenende: `http://localhost:5173/Daily-App/?now=2026-10-10T12:00`

### Weitere Befehle

| Befehl | Was er macht |
|---|---|
| `npm test` | Tests (Zahlenformat, Zeitlogik, Sperre, Aufgaben, ISIN, CSV, Depot-Berechnung) |
| `npm run test:db` | Datenbank-Tests: Migrationen und Row Level Security in einer Test-Datenbank (nie die echte) |
| `npm run check:public` | Prüft, dass nichts Privates im Code steht |
| `npm run build` | Typprüfung + fertige App in `dist/` |
| `npm run preview` | Den Build lokal ansehen (mit Service Worker und CSP) |
| `npm run icons` | App-Icons neu erzeugen |

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` baut die App automatisch und veröffentlicht sie (`.github/workflows/deploy.yml`). Vorher laufen `npm run check:public` (keine Schlüssel, E-Mail-Adressen oder Rechnernamen im Code), die Tests, die Datenbank-Tests und eine Prüfung, dass kein Schlüssel im Build steckt.

### Am iPhone installieren

1. In **Safari** `https://eric-yeah.github.io/Daily-App/` öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → *Hinzufügen*.
3. Ab jetzt die App über das Symbol starten. Nur so funktionieren später auch Push-Nachrichten (iOS 16.4 oder neuer).

## Supabase (ab M2)

Daily nutzt das **Supabase-Projekt der Study App**, aber nur ein eigenes Schema `daily`. An den Tabellen der Study App ändert Daily nichts. Du meldest dich mit deinem Study-App-Konto an.

Weil die Study App Registrierungen für Freunde erlaubt, reicht „angemeldet“ nicht: Nur Konten in der Tabelle `daily.owner` sehen und schreiben Daten in Daily. Das prüft die Datenbank selbst (Row Level Security), nicht nur die App.

### Einmalig einrichten (du klickst)

Alles im Supabase-Dashboard, im **Projekt der Study App**:

1. **Tabellen anlegen:** links *SQL Editor* → *+ New query* → den kompletten Inhalt von [`supabase/migrations/0001_daily_core.sql`](supabase/migrations/0001_daily_core.sql) einfügen → *Run*. Unten muss „Success. No rows returned“ stehen.
2. **Schema freigeben:** *Integrations* → *Data API* → *Settings* → bei *Exposed schemas* `daily` anhaken → *Save*. (`public` und `graphql_public` bleiben drin.)
   - **Wichtig:** Unter *Exposed tables* stehen die `daily.…`-Tabellen orange mit Warnsymbol („custom grants“). Dort **nichts anklicken**: Das würde die bewusst strengen Rechte (kein Zugriff ohne Anmeldung, `daily.owner` nicht beschreibbar) durch Standardrechte ersetzen.
3. **Dich als Besitzer eintragen:** wieder *SQL Editor* → *+ New query* → folgende Zeile einfügen, **deine E-Mail-Adresse** statt `DEINE@EMAIL` eintragen → *Run*:
   ```sql
   insert into daily.owner (user_id) select id from auth.users where email = 'DEINE@EMAIL';
   ```
   Es muss „1 row affected“ (oder „Success“) stehen. Danach die Abfrage links in der Liste löschen (⋯ → *Delete*), damit deine Adresse dort nicht liegen bleibt.
4. Fertig. Die Projekt-Adresse und der öffentliche `anon`-Schlüssel sind schon als Variablen im GitHub-Repository eingetragen.

Neue Migrationen kommen später genauso als nummerierte Dateien in `supabase/migrations/` und werden im SQL Editor ausgeführt. Welche schon gelaufen sind, zeigt `select * from daily.schema_migrations;`.

### Anmelden und Face ID

1. App öffnen → mit E-Mail und Passwort deines Study-App-Kontos anmelden. Du bleibst danach angemeldet.
2. *Mehr* → *Sicherheit* → **Einrichten** → Face ID bestätigen.
3. Ab jetzt fragt Daily beim Öffnen und nach einer Pause (einstellbar, Standard 5 Minuten) nach Face ID. Ohne Face ID geht es mit „Stattdessen mit Passwort“.

**Ehrlicher Hinweis:** Die Face-ID-Sperre ist eine Schutzschicht gegen fremde Hände am entsperrten Handy. Sie läuft auf dem Gerät. Der eigentliche Schutz deiner Daten sind die Anmeldung und die Row Level Security in der Datenbank. Später (M8) prüfe ich Passkeys als echte Anmeldung; Supabase bietet sie seit 2026 als Beta.

## Depot (ab M3)

Im Tab **Depot** legst du Positionen an (Name, ISIN, Stückzahl, Einstandskurs je Stück), ordnest sie Gruppen zu und vergibst Themen für die spätere News-Suche. Gespeichert wird nur das, keine Kontonummern und keine Zugangsdaten.

**CSV-Import:** Depot bei deinem Broker als CSV exportieren → *Depot* → *CSV-Import* → Datei wählen. Die App erkennt Trennzeichen, Zeichensatz (auch ältere Windows-Exporte), die Kopfzeile und die Spalten. Prüfe die Zuordnung und die Vorschau:
- Mehrere Zeilen mit derselben ISIN (mehrere Käufe) werden zusammengefasst, der Einstandskurs wird gewichtet gemittelt.
- Schon vorhandene ISINs werden aktualisiert (Gruppe und Themen bleiben) oder übersprungen.
- Zeilen mit ungültiger ISIN (Prüfziffer) erscheinen als Fehler und werden nicht übernommen.
- Die Datei selbst wird nur auf dem Gerät gelesen und nicht hochgeladen.

**Themen** schlägt die App vorerst nach festen Regeln aus dem Namen vor (z. B. „MSCI World“ → Welt, USA). Ein KI-Vorschlag kommt mit M5.

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
  lib/                           Zahlenformat, Zeitlogik, Diagramme, Einstellungen, Login, Sperre
  data/                          Datenquelle: Beispieldaten (mock.ts), Aufgaben/Notizen (personal.ts)
  components/                    Karten, Diagramme, Listen nach dem Design
  views/today/                   Morgen, Nachmittag, Abend
public/icons/                    App-Icons (erzeugt mit npm run icons)
supabase/migrations/             Datenbank: Tabellen und Sicherheitsregeln (im SQL Editor ausführen)
supabase/tests/                  Nachbau der Supabase-Rollen für die Datenbank-Tests
scripts/                         check:public, Datenbank-Tests, Icons
.github/workflows/deploy.yml     Prüfungen, Tests, Build und Veröffentlichung
```

## Technik

Vite + Preact + TypeScript, `vite-plugin-pwa` (Service Worker, Manifest), Vitest. Schriften: Plus Jakarta Sans und IBM Plex Mono über `@fontsource`. Ab M2: Supabase (Schema `daily` im Study-App-Projekt), Edge Functions für Kurse, News, KI und Push.
