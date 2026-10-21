import { useEffect, useState } from 'preact/hooks';
import { loadLiveBlog, loadWrap, type LiveBlogEntry, type LiveWrap, type WrapKind } from '../data/live';
import type { Block } from '../data/types';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import { formatTime, formatWeekday } from '../lib/format';
import { getSettings } from '../lib/settings';
import { readingMinutes } from '../lib/readingTime';
import { useCollapsed } from '../lib/collapsed';
import { LIVE_BLOG_ENABLED } from '../lib/features';
import { FoldHead } from './Fold';
import { ListenButton } from './Listen';
import { wrapSegments } from '../lib/briefingScript';
import { isoDate, zonedParts } from '../lib/time';
import { safeHref } from '../lib/safeUrl';

const KIND_LABEL: Record<WrapKind, string> = { morning: 'Morgen', afternoon: 'Mittag', evening: 'Abend' };

/** What a self-loading card has so far: `pending` while a signed-in load is still running (nothing to wait for when signed out). */
export interface Loaded<T> {
  block: Block<T> | undefined;
  pending: boolean;
}

/** The market overview of today (or the newest one without `kind`), refreshed every ten minutes. */
export function useWrap(kind?: WrapKind): Loaded<LiveWrap> {
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

  return { block, pending: signedIn && !block };
}

/** The afternoon live blog: today's entries, newest first, refreshed every two minutes. */
export function useLiveBlog(): Loaded<LiveBlogEntry[]> {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveBlogEntry[]>>();
  const signedIn = !!currentSession();

  useEffect(() => {
    if (!signedIn || !LIVE_BLOG_ENABLED) return;
    let alive = true;
    loadLiveBlog(new Date()).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, Math.floor(now.getTime() / 120000)]);

  return { block, pending: LIVE_BLOG_ENABLED && signedIn && !block };
}

/**
 * The AI-written market overview. With `kind` it shows that overview of today (Morgen, Nachmittag, Abend),
 * without it the newest one. It starts open; folding it (tap on the label line) shows only the headline and is
 * remembered on this device until it is opened again. Hidden while loading, when nothing was written yet and
 * when signed out.
 */
export function WrapCard({ kind }: { kind?: WrapKind }) {
  const now = useNow(60_000);
  const { block } = useWrap(kind);
  const [collapsed, setCollapsed] = useCollapsed('wrap');

  if (block?.status !== 'ok') return null;
  const w = block.data;
  const tz = getSettings().timeZone;
  const isToday = w.day === isoDate(zonedParts(now, tz));
  const when = isToday ? formatTime(w.createdAt, tz) : formatWeekday(new Date(`${w.day}T12:00:00Z`), 'UTC');
  const minutes = readingMinutes(w.headline, w.sections);

  return (
    <section class="card gap-12 wrap" aria-label="Marktüberblick">
      <FoldHead
        label={`Marktüberblick · ${KIND_LABEL[w.kind]} · ${when}${minutes >= 2 ? ` · ca. ${minutes} Min. Lesezeit` : ''}`}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <h2 class="wrap__headline">{w.headline}</h2>
      {!collapsed && (
        <>
          {!kind && <ListenButton id="wrap" title="Marktüberblick" script={wrapSegments(w)} pending={false} secondary />}
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
          <p class="wrap__note">KI-Zusammenfassung der Meldungen, keine Anlageberatung. Fehler sind möglich, bitte das Original prüfen.</p>
        </>
      )}
    </section>
  );
}

/** The afternoon live blog card. */
export function LiveBlogCard() {
  const { block } = useLiveBlog();
  const [collapsed, setCollapsed] = useCollapsed('liveblog');

  if (!LIVE_BLOG_ENABLED || !block) return null;
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
      <FoldHead label={`Live-Blog · Stand ${formatTime(entries[0].createdAt, tz)}`} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      {collapsed && <h2 class="wrap__headline">{entries[0].headline}</h2>}
      {!collapsed && (
        <>
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
        </>
      )}
    </section>
  );
}
