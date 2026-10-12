// Release notes shown in the app ("Was ist neu"). Newest first.
// With every release: raise "version" in package.json and add an entry at the top (a test checks this).
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '0.15.0',
    date: '2026-10-12',
    title: 'Briefings anhören',
    notes: [
      'Neu: Morgen-, Nachmittags- und Abendbriefing lassen sich vorlesen. Oben unter „Heute“ steht die Taste „Briefing anhören“ mit der ungefähren Dauer. Vorgelesen werden Marktüberblick, Marktstart, Depot, Meldungen, Termine, Training und Dein Tag, je nach Tageszeit. Im Tab „News“ gibt es die Taste auch für den Marktüberblick allein.',
      'Unten über der Tab-Leiste läuft ein kleiner Player mit Pause, Weiter und Sprung zum nächsten oder vorigen Abschnitt. Er bleibt sichtbar, wenn du den Tab wechselst.',
      'Ist „Beträge ausblenden“ an, liest Daily keine Euro-Beträge vor, nur Prozente. Sperrt die Face-ID-Sperre die App, stoppt das Vorlesen.',
      'Stimme und Tempo stellst du unter Mehr → Vorlesen ein, dort gibt es auch eine Probe. Die Stimme kommt von deinem Gerät, es wird nichts übertragen und es kostet nichts.',
      'Wichtig am iPhone: Während des Vorlesens bleibt der Bildschirm an. Wird er trotzdem gesperrt oder wechselst du die App, kann iOS die Sprachausgabe anhalten. Beim Zurückkommen geht es an der Stelle weiter.',
    ],
  },
  {
    version: '0.14.2',
    date: '2026-10-12',
    title: 'Indexleiste gefüllt und laufend',
    notes: [
      'Die Leiste mit DAX, Euro Stoxx 50 und den anderen Indizes füllt jetzt auf dem Mac die ganze Breite aus, statt links halb leer zu bleiben.',
      'Auf dem Handy, wo nicht alle Kacheln nebeneinander passen, läuft die Leiste jetzt langsam im Kreis durch. Tippst du sie an (oder fährst mit der Maus darüber), hält sie an.',
      'Ist in iOS „Bewegung reduzieren“ an, bleibt sie stehen und lässt sich wie bisher seitlich wischen.',
    ],
  },
  {
    version: '0.14.1',
    date: '2026-10-12',
    title: 'Besser auf Mac und iPad',
    notes: [
      'Die Kurven füllen jetzt auf jedem Bildschirm die ganze Kartenbreite. Auf dem Mac blieb die Tageskurve vorher klein in der Mitte stehen, während die Uhrzeiten darunter über die volle Breite liefen.',
      'Die Uhrzeiten unter den Kurven stehen jetzt an der richtigen Stelle (12:00 genau dort, wo 12 Uhr auf der Kurve liegt, auch bei den US-Kurven).',
      'Auf dem Mac reagieren Schaltflächen und Karten beim Darüberfahren mit der Maus.',
      'Auf dem iPad hochkant und in schmalen Mac-Fenstern geht die Tab-Leiste jetzt über die ganze Breite.',
      'Auf dem Handy sieht alles aus wie bisher.',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-10-12',
    title: 'Interaktive Kurven',
    notes: [
      'Neu: Die Kurven lassen sich jetzt erkunden. Fahre mit dem Finger (oder der Maus) über eine Kurve, dann zeigt Daily dir an dieser Stelle Uhrzeit bzw. Tag, den Depotwert und die Veränderung. Das gilt für den Verlauf am Morgen, die Tageskurve von Nachmittag und Abend und die kleinen US-Kurven.',
      'Bei der Tageskurve ist die Veränderung die zum Vortagsschluss, beim Morgenverlauf die zum Tag davor. Bei den US-Kurven siehst du nur die Veränderung, keine Indexstände.',
      'Mit Blenden von Beträgen siehst du auch hier keine Euro-Werte, nur Zeit und Prozent. Mit der Tastatur geht es mit den Pfeiltasten, mit Pos1 und Ende springst du zum Anfang oder Ende.',
      'Nach oben und unten scrollen kannst du wie gewohnt, auch wenn dein Finger auf einer Kurve startet.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-10-12',
    title: 'Karten einklappen und Themen per KI vorschlagen',
    notes: [
      'Neu: Marktüberblick, Marktstart und Live-Blog lassen sich einklappen. Tippe oben auf die Zeile mit dem Pfeil, dann bleibt nur die Überschrift stehen. Die Karten sind standardmäßig offen; was du einklappst, bleibt auf diesem Gerät eingeklappt, bis du es wieder aufklappst. Der Marktüberblick gilt dabei überall gleich (Heute und News).',
      'Der Marktüberblick ist jetzt immer ganz offen (vorher war er bei langen Texten automatisch gekürzt, mit „Ganzen Überblick lesen“).',
      'Neu: Beim Anlegen einer Position schlägt die KI (Claude Haiku 5.5) Themen vor, zusätzlich zu den bisherigen Vorschlägen aus dem Namen. Mit „Alle übernehmen“ nimmst du alle auf einmal. Auch beim CSV-Import bekommen neue Positionen jetzt Themen von der KI.',
      'Datenschutz: Die KI bekommt dafür nur den Namen der Position, nie ISIN, WKN, Stückzahl, Kurs oder Gruppe. Klappt die KI nicht (kein Budget, offline), bleiben die Vorschläge aus dem Namen.',
      'Hinweis: Die Themenvorschläge brauchen die neu veröffentlichte Edge Function daily-topics; bis dahin gibt es nur die Vorschläge aus dem Namen.',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-10-12',
    title: 'Sicherheitsprüfung',
    notes: [
      'Daily wurde komplett auf Sicherheitslücken geprüft: Datenbank, Server-Funktionen, App und Repository. Ohne deine Anmeldung kommt niemand an deine Daten, auch nicht mit einem eigenen Konto im Projekt der Study App.',
      'Links aus Meldungen und Briefings öffnet Daily nur noch, wenn es normale Webadressen sind.',
      'Daily startet nicht mehr, wenn eine fremde Seite es unsichtbar einbettet (Schutz gegen untergeschobene Klicks).',
      'Beim Laden eines Artikels für „Ausführlich“ prüft der Server jetzt jede Weiterleitung einzeln.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-10-12',
    title: 'Marktstart-Update und aufgeräumte News',
    notes: [
      'Neu: Kurz nach der Eröffnung in Frankfurt (ab etwa 9:30 Uhr, nur Montag bis Freitag) erscheint auf „Heute“ die Karte „Marktstart“. Sie zeigt, wie DAX, MDAX, Euro Stoxx 50 und die US-Futures stehen, welche großen deutschen Werte am stärksten gewinnen oder verlieren und, wenn eine Meldung die Firma nennt, warum. Ohne passende Meldung steht kein Grund da.',
      'Die Zahlen kommen direkt aus den Kursdaten, nur der kurze Text und die Gründe sind eine KI-Zusammenfassung der Meldungen. Es gibt dazu keine Push-Nachricht.',
      'News: Unwichtiges ist jetzt standardmäßig ausgeblendet (Sport, Ratgeber, Vermischtes und alles, was die KI als wenig relevant einstuft). Meldungen zu deinem Depot und von Notenbanken bleiben. Unter „Weitere Filter“ holt „Auch Unwichtiges“ alles zurück.',
      'News zu deinen Themen: Der Filter war zu streng. Daily erkennt Zusammenhänge jetzt breiter (zum Beispiel Börsen- und Zollmeldungen bei „Welt“ und „USA“, Rechenzentren bei „KI“) und lässt die KI zusätzlich prüfen, welche deiner Themen eine Meldung sinngemäß berührt. Dafür sieht die KI die Namen deiner Themen, nie Positionen, ISINs oder Beträge.',
      'Hinweis: Das Marktstart-Update braucht einmalig eine Datenbank-Änderung (Migration 0013) und neu veröffentlichte Edge Functions; bis dahin erscheint die Karte nicht.',
    ],
  },
  {
    version: '0.11.2',
    date: '2026-10-12',
    title: 'Kurssymbol auch für ETFs per WKN',
    notes: [
      'Behoben: Die Symbolsuche per WKN fand für ETFs nichts. Daily nimmt jetzt neben der Xetra-Notierung auch die deutsche Sammelnotierung, sie hat bei ETFs dasselbe Kürzel.',
      'Der Hinweis im Depot-Formular passt jetzt dazu: Das Kurssymbol wird aus der WKN gesucht, nur wenn nichts gefunden wird, trägst du es selbst ein.',
    ],
  },
  {
    version: '0.11.1',
    date: '2026-10-12',
    title: 'Kurse auch für Positionen nur mit WKN',
    notes: [
      'Behoben: Positionen, die du nur mit WKN (ohne ISIN) angelegt hast, bekamen keine Kurse. Daily findet das Symbol jetzt selbst über die WKN (Xetra-Notierung).',
      'Die Kurse erscheinen nach dem nächsten Abruf, der alle 30 Minuten zu Handelszeiten läuft.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-10-11',
    title: 'Direkt zu Face ID, mit Entsperr-Animation',
    notes: [
      'Beim Öffnen fragt Daily jetzt sofort nach Face ID (am Mac Touch ID), du musst nicht mehr zuerst auf „Entsperren“ tippen. Klappt das beim Öffnen nicht von allein, steht der Knopf wie bisher da.',
      'Wenn du schon einen Passkey eingerichtet hast, startet auch die Anmeldung von selbst mit Face ID. Dann reicht ein Blick, ohne zusätzlichen Tipp auf „Mit Face ID anmelden“.',
      'Neu: Beim Entsperren geht das Schloss auf, wird grün, und die App blendet sanft ein. Bei eingeschalteter Einstellung „Bewegung reduzieren“ entfällt die Animation.',
    ],
  },
  {
    version: '0.10.1',
    date: '2026-10-11',
    title: 'Ausführliche News bleiben stehen',
    notes: [
      'Behoben: Eine ausführliche Zusammenfassung war nach Tabwechsel oder Neuladen scheinbar weg und musste neu angefordert werden. Sie war gespeichert, die App hat sie nur nicht angezeigt.',
      'Jetzt kommt sie mit der Meldung zurück (eingeklappt, ein Tipp öffnet sie) und bleibt, solange die Meldung in der Liste steht, also bis zu 48 Stunden. Ein erneuter Abruf kostet nichts.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-10-11',
    title: 'Fazit zu jeder ausführlichen News',
    notes: [
      'Unter der ausführlichen Zusammenfassung steht jetzt ein kurzes Fazit mit höchstens 3 Sätzen: Was ist die Kernaussage, und was könnte sie für die Themen deines Depots bedeuten?',
      'Für den Bezug zum Depot sieht die KI nur die Themen deiner Positionen, die im Artikel vorkommen (zum Beispiel „USA“), nie Namen, ISINs oder Beträge. Das Fazit beschreibt mögliche Zusammenhänge, sagt aber keinen Kurs voraus und gibt keine Empfehlung.',
      'Schon erstellte ausführliche Zusammenfassungen behalten ihren Stand und haben kein Fazit.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-11',
    title: 'Ausführliche News',
    notes: [
      'Neu bei jeder Meldung: „Ausführlich (1 bis 2 Min.)“. Ein Tipp, und die KI liest den Artikel und fasst ihn in eigenen Worten auf etwa 100 bis 300 Wörter zusammen. Die Kurzfassung bleibt wie sie ist.',
      'Die Zusammenfassung entsteht nur auf Tipp und wird danach gespeichert, ein Artikel kostet also höchstens einmal etwa 0,1 Cent. Gespeichert wird nur die Zusammenfassung, nie der Artikel.',
      'Hinter einer Bezahlschranke gibt es keine ausführliche Fassung: Die App sagt das offen, statt eine Überschrift aufzublasen oder etwas zu raten. Bei kurzen Artikeln reicht die Kurzfassung.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-11',
    title: 'Daily am Mac',
    notes: [
      'Daily läuft jetzt auch am Mac: In breiten Fenstern steht die Navigation links, der Inhalt bleibt gut lesbar. Das iPhone-Layout ändert sich nicht.',
      'Dein Stand ist auf iPhone und Mac derselbe, weil beide dasselbe Konto lesen. Kommst du ins Fenster zurück, laden Aufgaben, Depot, News und Einstellungen vom anderen Gerät automatisch neu, auch ohne dass du die App neu startest.',
      'CSV-Import: Dateien aus Numbers und Excel am Mac werden erkannt (UTF-8, „CSV (Macintosh)“, „Unicode-Text“), Umlaute stimmen. Du kannst die Datei auch ins Fenster ziehen.',
      'Die Sperre heißt je nach Gerät Face ID oder Touch ID. Sie gilt pro Gerät: Am Mac einmal unter „Mehr → Sicherheit“ einrichten, genauso den Passkey.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-11',
    title: 'Klarere Tageszeit-Leiste',
    notes: [
      'Die Leiste oben auf „Heute“ zeigt jetzt Symbole: Sonnenaufgang für Morgen, Sonne für Nachmittag, Mond für Abend.',
      'Die gewählte Tageszeit hat eine eigene Farbe (Orange, Blau, Violett) und ist dadurch sofort erkennbar.',
      'Ein grüner Punkt markiert die Tageszeit, die gerade wirklich ist. Schaust du dir eine andere an, steht darunter „Jetzt ist …“ und ein Tipp bringt dich zurück.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-11',
    title: 'Sparpläne im Depot',
    notes: [
      'Neu: Sparplan je Position. Im Positionsformular trägst du ein, wie viel du jeden Monat investierst, und optional an welchem Tag (1 bis 28).',
      'In der Depot-Liste steht der Sparplan bei der Position, und oben siehst du die Summe aller Sparpläne pro Monat. Mit „Beträge verbergen“ werden auch diese Beträge ausgeblendet.',
      'Der Sparplan ist eine Notiz für deine Übersicht: Stückzahl und Einstand ändern sich nicht automatisch. Nach einer Ausführung beim Broker passt du die Position an oder importierst die CSV neu.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-11',
    title: 'WKN im Depot',
    notes: [
      'Positionen kannst du jetzt mit der WKN anlegen, entweder zusätzlich zur ISIN oder allein, wenn du die ISIN gerade nicht zur Hand hast. Eine von beiden brauchst du.',
      'Im CSV-Import erkennt die App eine WKN-Spalte. Zeilen, die nur eine WKN haben, werden übernommen, und eine schon vorhandene Position wird auch über die WKN erkannt.',
      'Das Kurssymbol wird weiterhin über die ISIN gefunden. Hat eine Position nur eine WKN, trägst du das Kurssymbol im Formular selbst ein oder ergänzt die ISIN.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-11',
    title: 'Langer Marktüberblick und Live-Blog am Nachmittag',
    notes: [
      'Neu: der Live-Blog im Nachmittag. Zwischen 12 und 22 Uhr schreibt die KI kurze Einträge zu neuen, wichtigen Meldungen, mit Uhrzeit und Quellen. Die Seite aktualisiert sich alle zwei Minuten.',
      'Der Marktüberblick am Morgen und am Abend ist deutlich länger, bis zu etwa 5 bis 7 Minuten Lesezeit, mit den wichtigsten Themen zuerst. In der Tagesansicht siehst du zuerst die Überschrift und die drei wichtigsten Punkte, „Ganzen Überblick lesen“ klappt den ganzen Text auf.',
      'Wie lang der Überblick wird, hängt von den Meldungen ab. An ruhigen Tagen wie am Wochenende ist er kürzer, aufgefüllt wird nicht.',
      'Die Zusammenfassungen sind länger: Meldungen bekommen 2 bis 3 Sätze.',
      '„Was bewegt den Markt gerade“ und „Treiber des Tages“ kommen aus demselben KI-Aufruf wie der Marktüberblick.',
      'Günstiger im Betrieb: Die KI rechnet ohne zusätzliches Nachdenken und fasst Meldungen in größeren Paketen zusammen. Die Web-Suche ist abgeschaltet, die nicht funktionierende GDELT-Suche entfernt.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-11',
    title: 'Marktüberblick, Suche und mehr Filter',
    notes: [
      'Neu: der Marktüberblick. Zu Morgen, Mittag und Abend schreibt die KI einen kompakten Überblick über die Märkte, mit den letzten Indexständen, den wichtigsten Meldungen und den Terminen. Unter jedem Absatz stehen die Quellen zum Nachlesen.',
      'Du findest ihn oben in der jeweiligen Tagesansicht und im Tab News (dort der neueste).',
      'Im Tab News kannst du jetzt suchen und nach Märkten filtern: Deutschland, Europa, USA, Asien, Rohstoffe, Zinsen, Krypto, Tech & KI und Unternehmen.',
      'Unter „Weitere Filter“: Zeitraum (6, 24 oder 48 Stunden), Sortierung, einzelne Quelle, „Nur Wichtiges“, „Nur Notenbanken“ und die Themen deiner Positionen.',
      'Die Liste lädt jetzt in Schritten („Mehr anzeigen“).',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-10-11',
    title: 'Mehr Quellen und mehr Meldungen',
    notes: [
      'Viele neue Quellen: Handelsblatt, FAZ, DER SPIEGEL, ZEIT ONLINE, n-tv, MarketWatch, BBC News, The Guardian und die Bank of England kommen dazu.',
      'Es erscheinen jetzt auch allgemeine Marktmeldungen, nicht nur Meldungen zu deinen Themen. Passende Meldungen sind weiter mit „betrifft N Positionen“ markiert.',
      'Im Tab News ist „Nur mein Depot“ nicht mehr voreingestellt. Tippe es an, wenn du nur deine Themen sehen willst.',
      'Behoben: Seit Tagen kamen kaum neue Meldungen, weil fast alles herausgefiltert wurde.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-11',
    title: 'Echte Kurse, Face-ID-Anmeldung und Hinweise zu neuen Versionen',
    notes: [
      'Echte Kurse: Depotwert, Tageskurve, Gruppen, Indizes und US-Markt kommen jetzt aus echten Kursen (ca. 15 Minuten verzögert).',
      'Positionen ohne Kurs werden gezählt und nicht eingerechnet. Es wird nie geschätzt.',
      'Anmeldung mit Face ID (Passkey) unter Mehr → Sicherheit. Das Passwort bleibt als Rückfall.',
      'Offline: Daily zeigt den letzten Stand mit Uhrzeit und lädt von selbst neu, sobald das Internet zurück ist.',
      'Hinweis, wenn eine neue Version da ist, und diese Seite mit den Neuerungen.',
      'Bessere Bedienung mit VoiceOver und Pfeiltasten.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-11',
    title: 'Erste Version',
    notes: [
      'Morgen, Nachmittag und Abend mit Depot, Meldungen, Terminen und Aufgaben.',
      'Anmeldung, Face-ID-Sperre, Depot mit CSV-Import, Meldungen mit KI-Kurzfassung, Briefings und Push.',
      'Training aus Overload und „Dein Tag“ aus der Study App.',
    ],
  },
];

/** "0.10.1" vs "0.9.0": negative, zero or positive like a comparator. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Releases the user has not seen yet (newest first): everything after `lastSeen` up to `current`.
 * Without a stored version only the current release is shown, not the whole history.
 */
export function unseenReleases(lastSeen: string | null, current: string, all: Release[] = RELEASES): Release[] {
  const upToCurrent = all.filter((r) => compareVersions(r.version, current) <= 0);
  if (!lastSeen) return upToCurrent.slice(0, 1);
  return upToCurrent.filter((r) => compareVersions(r.version, lastSeen) > 0);
}
