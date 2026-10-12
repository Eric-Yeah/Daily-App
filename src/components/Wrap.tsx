import { useEffect, useState } from 'preact/hooks';
import { loadLiveBlog, loadWrap, type LiveBlogEntry, type LiveWrap, type WrapKind } from '../data/live';
import type { Block } from '../data/types';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import { formatTime, formatWeekday } from '../lib/format';
import { getSettings } from '../lib/settings';
import { readingMinutes } from '../lib/readingTime';
import { isoDate, zonedParts } from '../lib/time';
import { safeHref } from '../lib/safeUrl';

const KIND_LABEL: Record<WrapKind, string> = { morning: 'Morgen', afternoon: 'Mittag', evening: 'Abend' };
/**
 * The AI-written market overview. With `kind` it shows that overview of today (Morgen, Nachmittag, Abend),
 * without it the newest one. Long ones (3 minutes or more) start folded: headline and the three main points,
 * "Ganzen Überblick lesen" opens all sections with their sources. Hidden while loading, when nothing was written
 * yet and when signed out.
 */
export function WrapCard({ kind }: { kind?: WrapKind }) {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveWrap>>();
  const [open, setOpen] = useState(false);
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
  const minutes = readingMinutes(w.headline, w.sections);
  const folded = minutes >= 3 && !open;

  return (
    <section class="card gap-12 wrap" aria-label="Marktüberblick">
      <div class="card-label">
        Marktüberblick · {KIND_LABEL[w.kind]} · {when}
        {minutes >= 2 ? ` · ca. ${minutes} Min. Lesezeit` : ''}
      </div>
      <h2 class="wrap__headline">{w.headline}</h2>
      {folded ? (
        <>
          {w.points.length > 0 ? (
            <ul class="wrap__points">
              {w.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p class="wrap__lead">{w.sections[0].text}</p>
          )}
          <button class="button button--secondary button--wide" type="button" aria-expanded="false" onClick={() => setOpen(true)}>
            Ganzen Überblick lesen
          </button>
        </>
      ) : (
        <>
          {w.sections.map((s) => (
            <div key={s.title} class="wrap__section">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              {s.sources.length > 0 && (
                <p class="wrap__sources">
                  {s.sources.map((src) => (
                    <a key={src.url} href={safeHref(src.url)} target="_blank" rel="noopener noreferrer">
                      {src.name} ↗
                    </a>
                  ))}
                </p>
              )}
            </div>
          ))}
          {minutes >= 3 && (
            <button class="link-button" type="button" aria-expanded="true" onClick={() => setOpen(false)}>
              Zuklappen
            </button>
          )}
        </>
      )}
      <p class="wrap__note">KI-Zusammenfassung der Meldungen, keine Anlageberatung. Fehler sind möglich, bitte das Original prüfen.</p>
    </section>
  );
}

/** The afternoon live blog: today's entries, newest first, refreshed every two minutes. */
export function LiveBlogCard() {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveBlogEntry[]>>();
  const signedIn = !!currentSession();

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    loadLiveBlog(new Date()).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, Math.floor(now.getTime() / 120000)]);

  if (!block) return null;
  const tz = getSettings().timeZone;
  if (block.status !== 'ok') {
    return (
      <section class="card gap-8 block-state" aria-label="Live-Blog">
        <h2 class="block-state__title">Live-Blog</h2>
        <p>{block.message}</p>
      </section>
    );
  }
  const entries = block.data;
  return (
    <section class="card gap-12 live" aria-label="Live-Blog">
      <div class="card-label">Live-Blog · Stand {formatTime(entries[0].createdAt, tz)}</div>
      <ol class="live__list">
        {entries.map((e) => (
          <li key={e.id} class={`live__entry${e.importance >= 4 ? ' live__entry--important' : ''}`}>
            <span class="live__time">{formatTime(e.createdAt, tz)}</span>
            <div class="live__body">
              <h3>{e.headline}</h3>
              <p>{e.body}</p>
              {e.sources.length > 0 && (
                <p class="wrap__sources">
                  {e.sources.map((src) => (
                    <a key={src.url} href={safeHref(src.url)} target="_blank" rel="noopener noreferrer">
                      {src.name} ↗
                    </a>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p class="wrap__note">KI-Zusammenfassung der Meldungen, keine Anlageberatung. Fehler sind möglich, bitte das Original prüfen.</p>
    </section>
  );
}
