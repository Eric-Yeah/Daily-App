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
| M8 | Feinschliff, Passkey-Login | **fertig** (Passkey einmal im Dashboard einschalten, Supabase-Beta) |

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

### Neue Versionen

Gibt es eine neue Version, zeigt Daily unten „Neue Version verfügbar“ mit **Aktualisieren**. Danach erscheint einmal „Neu in Version …“ mit den Neuerungen; alle früheren stehen unter *Mehr → Was ist neu*. Die Texte pflegt man in `src/lib/releaseNotes.ts`, die Versionsnummer in `package.json`.

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

**Ehrlicher Hinweis:** Die Face-ID-Sperre ist eine Schutzschicht gegen fremde Hände am entsperrten Handy. Sie läuft auf dem Gerät. Der eigentliche Schutz deiner Daten sind die Anmeldung und die Row Level Security in der Datenbank. Eine echte Anmeldung per Face ID gibt es als Passkey, siehe nächster Abschnitt.

## Passkey-Login (ab M8)

Ein **Passkey** ersetzt das Passwort durch Face ID: Dein iPhone beweist deine Identität, Supabase prüft die Signatur und meldet dich an. Anders als die lokale App-Sperre ist das eine echte Anmeldung. Das Passwort bleibt als Rückfall bestehen.

**Ehrlich:** Supabase bietet Passkeys seit Ende Mai 2026 als **Beta** an, die Schnittstelle kann sich ändern. Fällt etwas aus, funktioniert weiter die Anmeldung mit Passwort.

**Einmalig einschalten (du klickst):**
1. Supabase → Projekt der Study App → *Authentication* → *Passkeys* → einschalten.
2. Dort eintragen: **RP ID** `eric-yeah.github.io` (ohne `https://`), **Origin** `https://eric-yeah.github.io`. Das gilt für das ganze Projekt, an der Study App ändert sich nichts. Die RP ID danach **nie mehr ändern**, sonst werden alle Passkeys ungültig.
3. Die *Site URL* des Projekts nicht anfassen.
4. In Daily anmelden (Passwort) → *Mehr* → *Sicherheit* → **Anmeldung mit Face ID (Passkey) → Hinzufügen** → Face ID bestätigen.
5. Zum Testen abmelden und auf dem Anmeldebildschirm **Mit Face ID anmelden** tippen. Danach prüfen, dass die Anmeldung mit Passwort weiter geht.

Zugriff hat auch mit Passkey nur das Konto in `daily.owner`. Entfernen kannst du Passkeys unter *Mehr → Sicherheit*.

## Offline und Fehler (M8)

- Ohne Internet zeigt Daily oben „Offline · du siehst den letzten Stand“. Einzelne Blöcke, die gerade nicht laden, zeigen ihre letzten Daten mit „Stand: HH:MM · gerade nicht aktuell“.
- Der letzte Stand liegt **nur im Arbeitsspeicher** und wird nicht auf dem Gerät gespeichert, weil alle Apps unter `eric-yeah.github.io` einen gemeinsamen Browserspeicher teilen und Depotwerte dort nicht liegen sollen. Schließt du die App und bist offline, siehst du deshalb Hinweise statt alter Zahlen.
- Beim Wiederkommen des Internets und beim Zurückkehren in die App lädt Daily automatisch neu.
- Diagramme, Prozentwerte und Tabs haben Beschreibungen für Screenreader (VoiceOver); die Tagesansicht lässt sich mit Pfeiltasten umschalten.

## Depot (ab M3)

Im Tab **Depot** legst du Positionen an (Name, ISIN oder WKN, Stückzahl, Einstandskurs je Stück), trägst optional einen **Sparplan** ein (Betrag pro Monat und Tag, nur eine Notiz, nichts wird automatisch gebucht), ordnest sie Gruppen zu und vergibst Themen für die spätere News-Suche. Gespeichert wird nur das, keine Kontonummern und keine Zugangsdaten.

**CSV-Import:** Depot bei deinem Broker als CSV exportieren → *Depot* → *CSV-Import* → Datei wählen. Die App erkennt Trennzeichen, Zeichensatz (auch ältere Windows-Exporte), die Kopfzeile und die Spalten. Prüfe die Zuordnung und die Vorschau:
- Eine WKN-Spalte wird erkannt; eine Zeile braucht ISIN oder WKN. Mehrere Zeilen mit derselben ISIN/WKN (mehrere Käufe) werden zusammengefasst, der Einstandskurs wird gewichtet gemittelt.
- Schon vorhandene ISINs/WKNs werden aktualisiert (Gruppe und Themen bleiben) oder übersprungen.
- Zeilen ohne gültige ISIN (Prüfziffer) und ohne gültige WKN erscheinen als Fehler und werden nicht übernommen.
- Die Datei selbst wird nur auf dem Gerät gelesen und nicht hochgeladen.

**Themen** schlägt die App vorerst nach festen Regeln aus dem Namen vor (z. B. „MSCI World“ → Welt, USA). Ein KI-Vorschlag kommt mit M5.

## News, Briefings und Push (ab M5/M6)

**So läuft es:** In Supabase laufen zwei Edge Functions nach Zeitplan (pg_cron):
- `daily-news` alle 30 Minuten (6 bis 23 Uhr): holt Meldungen aus festen, öffentlich angebotenen Feeds (tagesschau.de, Handelsblatt, FAZ, SPIEGEL, ZEIT, n-tv, CNBC, MarketWatch, BBC, Guardian, EZB, Fed, Bank of England, Bundesbank) Gespeichert werden nur Titel, Anreißer, Link, Quelle und Zeit, nie der ganze Artikel. Alle Meldungen werden gespeichert; passende werden über die Themen deinen Positionen zugeordnet („betrifft 3 Positionen“). Neue Meldungen fasst Claude Haiku 5.5 kurz zusammen (zuerst die zu deinen Positionen und von Notenbanken, allgemeine Marktmeldungen nur einige pro Lauf, damit das Monatsbudget reicht), in der Sprache der Quelle, mit Wichtigkeit 1 bis 5. Älter als 14 Tage wird gelöscht.
- `daily-briefing` alle 15 Minuten: erstellt Morgen-, Nachmittags- und Abendbriefing zur eingestellten Zeit („Heute wichtig“, „Was bewegt den Markt gerade“, „Treiber des Tages“) und dazu den **Marktüberblick**: ein kompakter KI-Text mit den letzten Indexschlusskursen, den wichtigsten Meldungen und den Terminen, jeder Absatz mit Quellenlinks (Kosten: Morgen und Abend je etwa 0,5 Cent, Mittag etwa 0,2 Cent). Morgens und abends ist der Überblick die **Langfassung** (bis etwa 5 bis 7 Minuten Lesezeit): erst ein Plan mit 6 bis 9 Themen, dann ein kurzer KI-Aufruf pro Thema. An ruhigen Tagen wird er kürzer, es wird nicht aufgefüllt. Alle KI-Aufrufe laufen mit Claude Haiku 5.5 ohne zusätzliches Nachdenken. Eine **Web-Suche** der Anthropic-API (10 $ pro 1.000 Suchen) ist eingebaut, aber abgeschaltet (`WEB_SEARCH_ENABLED` in `daily-briefing`): Reuters, AP, FT, BBC und MarketWatch sperren den Such-Crawler, und im Test brachte sie wenig Neues.
- `daily-news` schreibt zwischen 12 und 22 Uhr zusätzlich den **Live-Blog** für den Nachmittag: bei jedem Abruf bekommt die KI die neu gespeicherten Meldungen und schreibt 0 bis 3 kurze Einträge (Tabelle `liveblog_entries`, Migration `0008_liveblog.sql`, im SQL Editor ausführen). Die Tagesansicht „Nachmittag“ zeigt ihn und lädt alle 2 Minuten neu. und schickt den Push „Dein … ist fertig“ ohne Zahlen.
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
- **EODHD** (kostenlos, mit deinem Schlüssel, 20 Abrufe pro Tag) ist die **Hauptquelle für die Schlusskurse** der Positionen (Euro-Notierungen an Xetra, Mailand, Paris, Amsterdam). Einmal pro Morgen (08:02 Uhr, Mo bis Fr) ersetzt es die vorläufigen Werte der letzten Tage durch die offiziellen; für eine neue Position holt es das ganze letzte Jahr in einem Abruf. Das reicht für bis zu etwa 10 Positionen. Damit stammen Depotwert, Vortagsänderung und Woche/Monat/Jahr aus der lizenzierten Quelle.
- **Yahoo Finance** (ohne Schlüssel, inoffiziell) liefert die Tageskurven (ca. 15 Minuten verzögert), DAX, Euro Stoxx 50, S&P 500, Nasdaq 100 und die US-Futures sowie den vorläufigen Schlusskurs des Tages. Ohne EODHD-Schlüssel kommen auch die Schlusskurse von Yahoo.
- **Kurssymbol:** Zu jeder Position wird es automatisch über die ISIN gesucht (über die WKN allein findet keine der Quellen etwas, dort trägst du das Symbol selbst ein) und in der Position gespeichert. Mit EODHD-Schlüssel entscheidet EODHD die Börse (Euro-Notierung, Xetra bevorzugt, dann Mailand, Paris, Amsterdam) und das Yahoo-Symbol wird daraus abgeleitet, damit beide Quellen dieselbe Börse meinen. Du kannst das Symbol im Positionsformular auch selbst eintragen.
- Zeiten: Xetra Mo bis Fr von 09:00 bis Handelsende, US-Indizes 15:30 bis 22:00 (Berliner Zeit, Sommer-/Winterzeit passt sich an). Feiertage ohne Handel liefern keine neuen Kurse.
- **Ehrlich:** Yahoo bietet seine Schnittstelle inoffiziell an, die Nutzungsbedingungen erlauben automatische Abrufe nicht ausdrücklich. Sie kann ohne Vorwarnung ausfallen oder sich ändern. Mit EODHD-Schlüssel bleibt dann das Depot mit den letzten Schlusskursen sichtbar; es fehlen die Tageskurve und die Indizes. Ohne Daten zeigt die App „—“ oder „ohne Kurs“. Es wird nie geschätzt oder erfunden. Positionen in anderen Währungen als Euro werden nicht umgerechnet und stehen unter „ohne Kurs“. Ein von dir eingetragener manueller Kurs gilt nur als Wert ohne Tagesänderung.
- MSCI World und MSCI Emerging Markets haben keine kostenlose Indexquelle und fehlen deshalb in der Indexzeile.

**Einmalig einrichten (du klickst):**
1. Supabase → *SQL Editor* → *+ New query* → Inhalt von [`supabase/migrations/0006_prices.sql`](supabase/migrations/0006_prices.sql) einfügen → *Run*. Danach genauso [`supabase/migrations/0007_cron_prices.sql`](supabase/migrations/0007_cron_prices.sql) (der Zeitplan).
2. Function veröffentlichen (im Projektordner im Terminal):
   ```bash
   npx supabase functions deploy daily-prices --project-ref mhyunfeirajnmbrpdojm --no-verify-jwt --use-api
   ```
3. Empfohlen (Hauptquelle der Schlusskurse): auf eodhd.com ein kostenloses Konto anlegen, den API-Schlüssel kopieren und in Supabase → *Edge Functions* → *Secrets* → *Add new secret* als `DAILY_EODHD_API_KEY` eintragen (nie in den Chat oder in Code).
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
