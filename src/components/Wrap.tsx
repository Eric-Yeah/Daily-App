import { useEffect, useState } from 'preact/hooks';
import { loadWrap, type LiveWrap, type WrapKind } from '../data/live';
import type { Block } from '../data/types';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import { formatTime, formatWeekday } from '../lib/format';
import { getSettings } from '../lib/settings';
import { isoDate, zonedParts } from '../lib/time';

const KIND_LABEL: Record<WrapKind, string> = { morning: 'Morgen', afternoon: 'Mittag', evening: 'Abend' };

/**
 * The AI-written market overview. With `kind` it shows that overview of today (Morgen, Nachmittag, Abend),
 * without it the newest one. Hidden while loading, when nothing was written yet and when signed out.
 */
export function WrapCard({ kind }: { kind?: WrapKind }) {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveWrap>>();
  const signedIn = !!currentSession();

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    loadWrap(new Date(), kind).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, kind, Math.floor(now.getTime() / 600000)]);

  if (block?.status !== 'ok') return null;
  const w = block.data;
  const tz = getSettings().timeZone;
  const isToday = w.day === isoDate(zonedParts(now, tz));
  const when = isToday ? formatTime(w.createdAt, tz) : formatWeekday(new Date(`${w.day}T12:00:00Z`), 'UTC');

  return (
    <section class="card gap-12 wrap" aria-label="Marktüberblick">
      <div class="card-label">
        Marktüberblick · {KIND_LABEL[w.kind]} · {when}
      </div>
      <h2 class="wrap__headline">{w.headline}</h2>
      {w.sections.map((s) => (
        <div key={s.title} class="wrap__section">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          {s.sources.length > 0 && (
            <p class="wrap__sources">
              {s.sources.map((src) => (
                <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer">
                  {src.name} ↗
                </a>
              ))}
            </p>
          )}
        </div>
      ))}
      <p class="wrap__note">KI-Zusammenfassung der Meldungen unten, keine Anlageberatung. Fehler sind möglich, bitte das Original prüfen.</p>
    </section>
  );
}
