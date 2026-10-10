# Daily App

Persönliche PWA (Vite + Preact + TypeScript), veröffentlicht über GitHub Pages unter `/Daily-App/`. Überblick, Befehle und Ordner: `README.md`.

## Wichtig: Alles hier ist öffentlich

Repository **und** Seite sind öffentlich. Deshalb gilt ohne Ausnahme:

- Keine Geheimnisse im Code: keine API-Schlüssel, Service-Role-Keys, Datenbank-URLs, Passwörter oder Passwort-Hashes. Schlüssel nur in Supabase-Secrets oder in der lokalen `.env` (ignoriert).
- Keine persönlichen Daten: keine echten Namen außer Platzhaltern, keine E-Mail-Adressen, keine Schule, keine Depotwerte oder ISINs von Eric, keine User-IDs, keine lokalen Pfade oder Rechnernamen.
- Beispiel- und Testdaten sind erfunden und als Beispiel markiert.
- Der Projektbrief `DAILY_APP_BRIEF.md` liegt nur lokal (`.gitignore`) und darf nicht eingecheckt werden.
- Vor jedem Commit `npm run check:public` ausführen; der Deploy bricht sonst ab.
- Commits mit der anonymen GitHub-Adresse (`user.email` ist im Repo auf die noreply-Adresse gesetzt).

## Arbeitsweise

- Oberfläche und Texte auf Deutsch (du-Form), Code und Kommentare auf Englisch.
- Design in `design/*.dc.html` ist verbindlich, Werte 1:1 übernehmen.
- Nach Änderungen: `npm test`, `npm run build`, visuell auf 390 px prüfen (`?now=…` für die Uhrzeit, Berliner Zeit).
