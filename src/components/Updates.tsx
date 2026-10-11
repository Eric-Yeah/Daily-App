import { useState } from 'preact/hooks';
import { RELEASES, unseenReleases } from '../lib/releaseNotes';
import { storage } from '../lib/storage';
import { applyUpdate, useUpdateAvailable } from '../lib/update';

const SEEN_KEY = 'seen-version';

/** Shown while a new version is downloaded and ready: one tap installs it. */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return (
    <section class="sheet" role="status" aria-label="Neue Version">
      <div class="sheet__text">
        <strong>Neue Version verfügbar</strong>
        <span>Aktualisiere, um die Neuerungen zu bekommen.</span>
      </div>
      <button
        class="button"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          applyUpdate();
        }}
      >
        {busy ? 'Lädt …' : 'Aktualisieren'}
      </button>
    </section>
  );
}

/** After an update: what is new, once. Dismissing remembers the version on this device. */
export function WhatsNew() {
  const [releases, setReleases] = useState(() => unseenReleases(storage.get(SEEN_KEY), __APP_VERSION__));
  const available = useUpdateAvailable();
  if (!releases.length || available) return null;
  const close = () => {
    storage.set(SEEN_KEY, __APP_VERSION__);
    setReleases([]);
  };
  return (
    <section class="sheet sheet--notes" role="dialog" aria-label={`Neu in Version ${releases[0].version}`}>
      <h2 class="sheet__title">Neu in Version {releases[0].version}</h2>
      {releases.map((r) => (
        <ReleaseNotes key={r.version} release={r} heading={releases.length > 1} />
      ))}
      <button class="button button--wide" type="button" onClick={close}>
        Verstanden
      </button>
    </section>
  );
}

function ReleaseNotes({ release, heading }: { release: (typeof RELEASES)[number]; heading: boolean }) {
  return (
    <div class="release">
      {heading && <h3 class="release__title">Version {release.version}</h3>}
      <p class="release__lead">{release.title}</p>
      <ul class="release__list">
        {release.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/** Full history, for "Mehr". */
export function ReleaseHistory() {
  return (
    <>
      {RELEASES.map((r) => (
        <details key={r.version} class="release-details">
          <summary>
            Version {r.version} · {r.date.split('-').reverse().join('.')}
          </summary>
          <ReleaseNotes release={r} heading={false} />
        </details>
      ))}
    </>
  );
}
