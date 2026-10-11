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
    version: '0.2.1',
    date: '2026-10-11',
    title: 'Mehr Nachrichtenquellen',
    notes: [
      'Neue Quellen bei den Meldungen: ZEIT ONLINE (mit vielen dpa-Meldungen), Handelsblatt, SPIEGEL, FAZ, BBC News und MarketWatch.',
      'Reuters und dpa selbst bieten keine freien Feeds an und sind deshalb nicht dabei.',
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
