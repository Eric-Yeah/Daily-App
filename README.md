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
| M4 | Kurse (Yahoo + EODHD, kostenlos) | **fertig** (einmal einrichten, siehe „Kurse“) |
| M5 | News und KI (Claude Haiku 5.5) | **fertig** (KI-Schlüssel trägst du selbst ein) |
| M6 | Briefings vorab + Push | **fertig** |
| M7 | Overload und Study App | **fertig** (Training ohne Plan) |
| M8 | Feinschliff, Passkey-Login | offen |

Beispieldaten gibt es nur noch, solange du **keine Positionen** angelegt hast. Dann steht oben „Beispieldaten · keine echten Kurse“; unter **Mehr → Beispieldaten anzeigen** schaltest du sie aus. Sobald Positionen da sind, ist alles echt: Anmeldung, Einstellungen, Aufgaben, Zeile zum Tag, Depot (Positionen, Gruppen, CSV), Kurse, Indizes und US-Markt, Meldungen mit KI-Kurzfassung, Markttermine, Briefings, Push, Training aus Overload und „Dein Tag“ aus der Study App. Das Wetter fehlt noch.

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

## News, Briefings und Push (ab M5/M6)

**So läuft es:** In Supabase laufen zwei Edge Functions nach Zeitplan (pg_cron):
- `daily-news` alle 30 Minuten (6 bis 23 Uhr): holt Meldungen aus festen, öffentlich angebotenen Feeds (tagesschau.de Wirtschaft und Finanzen, CNBC, EZB, Fed, Bundesbank) und sucht über die freie GDELT-Nachrichtensuche nach deinen Depot-Themen. Gespeichert werden nur Titel, Anreißer, Link, Quelle und Zeit, nie der ganze Artikel. Meldungen werden über die Themen deinen Positionen zugeordnet („betrifft 3 Positionen“). Neue Meldungen fasst Claude Haiku 5.5 kurz zusammen, in der Sprache der Quelle, mit Wichtigkeit 1 bis 5. Älter als 14 Tage wird gelöscht.
- `daily-briefing` alle 15 Minuten: erstellt Morgen-, Nachmittags- und Abendbriefing zur eingestellten Zeit („Heute wichtig“, „Was bewegt den Markt gerade“, „Treiber des Tages“) und schickt den Push „Dein … ist fertig“ ohne Zahlen.
- **Termine** (Zinsentscheide von Fed und EZB, US-Inflation, US-Arbeitsmarkt) kommen aus den offiziellen Kalendern, siehe `supabase/migrations/0004_…`. Einmal im Jahr mit den neuen Listen ergänzen. Das US-Statistikamt (BLS) sperrt automatische Abrufe, deshalb keine automatische Liste.
- Die geplanten Aufrufe tragen eine geheime Kennung, die in der Datenbank (Supabase Vault) erzeugt wurde und sie nie verlässt. Ohne Kennung antworten die Functions mit „unauthorized“.

**KI-Schlüssel (du trägst ihn selbst ein, nie in den Chat oder Code):**
1. console.anthropic.com → *Settings* → *Workspaces* → am besten einen Workspace „daily“ mit eigenem **Spend Limit** (z. B. 2 $) anlegen → dort unter *API Keys* einen Schlüssel erzeugen.
2. Supabase → Projekt der Study App → *Edge Functions* → *Secrets* (bzw. *Project Settings* → *Edge Functions*) → *Add new secret* → Name `DAILY_ANTHROPIC_API_KEY`, Wert: dein Schlüssel → *Save*.
3. Fertig, beim nächsten Abruf (spätestens nach 30 Minuten) gibt es Kurzfassungen. Ohne Schlüssel laufen Meldungen weiter, nur mit dem Anreißer der Quelle.
4. Unter *Mehr* → *KI-Zusammenfassungen* stellst du die Obergrenze pro Monat ein (Standard 1 $) und siehst den Verbrauch. Ist sie erreicht, stoppt die KI bis zum Monatsende.

**Push am iPhone:** Daily vom Home-Bildschirm öffnen → *Mehr* → *Benachrichtigungen* → **Einschalten** → erlauben → **Test senden**. Uhrzeiten: Morgen 07:00, Nachmittag aus, Abend 17:45 (änderbar).

**Functions neu veröffentlichen** (nach Änderungen in `supabase/functions/`):
```bash
npx supabase functions deploy daily-news daily-briefing --project-ref mhyunfeirajnmbrpdojm --no-verify-jwt --use-api
```

**Prüfen, ob der Zeitplan läuft** (SQL Editor):
```sql
select jobname, schedule, active from cron.job where jobname like 'daily-%';
```

## Kurse (ab M4)

**So läuft es:** Die Edge Function `daily-prices` holt zu Handelszeiten alle 30 Minuten die Kurse und legt sie in der Datenbank ab (`price_snapshots` für den Tagesverlauf, `price_daily` für Schlusskurse). Die App liest nur aus der eigenen Datenbank und ruft nie einen Kursanbieter selbst auf.
- **Yahoo Finance** (ohne Schlüssel): Kurse deiner Positionen, DAX, Euro Stoxx 50, S&P 500, Nasdaq 100 und die beiden US-Futures, ca. 15 Minuten verzögert. Zu jeder Position wird das Kurssymbol automatisch über die ISIN gesucht (Xetra bevorzugt) und in der Position gespeichert. Du kannst es im Positionsformular selbst eintragen.
- **EODHD** (kostenlos, optional): holt abends den Schlusskurs nach, wenn Yahoo ihn für eine Xetra-Position nicht geliefert hat (höchstens 15 Abrufe pro Tag).
- Zeiten: Xetra Mo bis Fr von 09:00 bis Handelsende, US-Indizes 15:30 bis 22:00 (Berliner Zeit, Sommer-/Winterzeit passt sich an). Feiertage ohne Handel liefern keine neuen Kurse.
- **Ehrlich:** Yahoo bietet diese Schnittstelle inoffiziell an, die Nutzungsbedingungen erlauben automatische Abrufe nicht ausdrücklich. Sie kann ohne Vorwarnung ausfallen oder sich ändern. Dann bleiben die Kurse auf dem letzten Stand, und die App zeigt „—“ oder „ohne Kurs“. Es wird nie geschätzt oder erfunden. Positionen in anderen Währungen als Euro werden nicht umgerechnet und stehen unter „ohne Kurs“. Ein von dir eingetragener manueller Kurs gilt nur als Wert ohne Tagesänderung.
- MSCI World und MSCI Emerging Markets haben keine kostenlose Indexquelle und fehlen deshalb in der Indexzeile.

**Einmalig einrichten (du klickst):**
1. Supabase → *SQL Editor* → *+ New query* → Inhalt von [`supabase/migrations/0006_prices.sql`](supabase/migrations/0006_prices.sql) einfügen → *Run*. Danach genauso [`supabase/migrations/0007_cron_prices.sql`](supabase/migrations/0007_cron_prices.sql) (der Zeitplan).
2. Function veröffentlichen (im Projektordner im Terminal):
   ```bash
   npx supabase functions deploy daily-prices --project-ref mhyunfeirajnmbrpdojm --no-verify-jwt --use-api
   ```
3. Optional, für den Schlusskurs-Rückfall: auf eodhd.com ein kostenloses Konto anlegen, den API-Schlüssel kopieren und in Supabase → *Edge Functions* → *Secrets* → *Add new secret* als `DAILY_EODHD_API_KEY` eintragen (nie in den Chat oder in Code).
4. Erster Test: Supabase → *Edge Functions* → `daily-prices` → *Test*; oder abwarten, bis der Zeitplan läuft. Danach zeigt `select symbol, count(*) from daily.price_snapshots group by symbol;`, welche Kurse angekommen sind.

**Prüfen, ob der Zeitplan läuft** (SQL Editor):
```sql
select jobname, schedule, active from cron.job where jobname = 'daily-prices';
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```

**Gut zu wissen:** Der Verlauf füllt sich erst ab dem ersten Lauf. Die Schlusskurse des letzten Jahres holt die Function beim ersten Mal nach, dadurch sind „Woche, Monat, Jahr“ und die Vortagsänderung sofort da. Die Xetra-Feiertage stehen in `src/lib/time.ts` und müssen einmal im Jahr ergänzt werden.

## Training und „Dein Tag“ (ab M7)

- **Training:** Daily liest die Tageszusammenfassungen, die Overload schon an die Study App schickt (Einheiten, Minuten, Art). Daraus: heute trainiert oder nicht, diese und letzte Woche, Streak in Wochen, zuletzt, Wochenleiste. Den Trainingsplan teilt Overload nicht, deshalb steht dort kein „geplant 16:30“. Voraussetzung: In Overload ist „Study App verbinden“ eingerichtet.
- **Dein Tag:** aus der Study App der Stundenplan und die Vertretungen von heute (Stand: dein letzter Lanis-Abruf in der Study App) und Klausuren der nächsten 14 Tage.
- Daily liest diese Daten nur und ändert nichts an Overload oder der Study App.

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
