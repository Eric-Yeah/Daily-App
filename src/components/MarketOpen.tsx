import { useEffect, useState } from 'preact/hooks';
import { loadMarketOpen, type LiveMarketOpen, type OpenMover } from '../data/live';
import type { Block } from '../data/types';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import { formatPct, formatTime, spokenPct, trend } from '../lib/format';
import { getSettings } from '../lib/settings';
import { ChangeTiles } from './Market';

function Movers({ title, items }: { title: string; items: OpenMover[] }) {
  if (!items.length) return null;
  return (
    <div class="movers">
      <h3>{title}</h3>
      <ul>
        {items.map((m) => (
          <li key={m.name} class="mover">
            <span class="mover__name">{m.name}</span>
            <span class={`mover__pct ${trend(m.changePct, 1)}`}>
              <span aria-hidden="true">{formatPct(m.changePct, 1)}</span>
              <span class="visually-hidden">{spokenPct(m.changePct, 1)}</span>
            </span>
            {m.reason && (
              <span class="mover__reason">
                {m.reason}
                {m.source && (
                  <>
                    {' '}
                    <a href={m.source.url} target="_blank" rel="noopener noreferrer">
                      {m.source.name} ↗
                    </a>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Marktstart": the short update shortly after Xetra opens (about 09:30) with the index moves, the biggest winners and
 * losers among large German shares and, where the news explain it, why. Hidden until it was written and when signed out.
 */
export function MarketOpenCard() {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveMarketOpen>>();
  const signedIn = !!currentSession();

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    loadMarketOpen(new Date()).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, Math.floor(now.getTime() / 300000)]);

  if (block?.status !== 'ok') return null;
  return <MarketOpenView m={block.data} />;
}

export function MarketOpenView({ m }: { m: LiveMarketOpen }) {
  const tz = getSettings().timeZone;
  return (
    <section class="card gap-12 wrap" aria-label="Marktstart">
      <div class="card-label">Marktstart · Kurse von {formatTime(m.asOf, tz)} Uhr</div>
      {m.headline && <h2 class="wrap__headline">{m.headline}</h2>}
      {m.indices.length > 0 && <ChangeTiles items={m.indices} />}
      {m.text && <p class="wrap__lead">{m.text}</p>}
      <Movers title="Größte Gewinner" items={m.gainers} />
      <Movers title="Größte Verlierer" items={m.losers} />
      {!m.gainers.length && !m.losers.length && <p class="wrap__lead">Noch keine großen Bewegungen unter den großen deutschen Werten.</p>}
      <p class="wrap__note">
        Auswahl: große deutsche Werte, Kurse ca. 15 Min. verzögert.{m.text ? ' Text und Gründe sind eine KI-Zusammenfassung der Meldungen, keine Anlageberatung; Fehler sind möglich, bitte das Original prüfen.' : ''}
      </p>
    </section>
  );
}
