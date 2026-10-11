import { useEffect, useState } from 'preact/hooks';
import { SkeletonCard, StateCard } from '../components/Block';
import { NewsList } from '../components/Content';
import { Header } from '../components/Header';
import { loadNews, rankLive, type LiveNews } from '../data/live';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import type { Block } from '../data/types';
import { DISCLAIMER } from './Pages';

export function NewsTab() {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveNews[]>>();
  const [topic, setTopic] = useState<string | null>(null);
  const [onlyDepot, setOnlyDepot] = useState(true);
  const signedIn = !!currentSession();

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    loadNews(new Date(Date.now() - 48 * 3600000).toISOString(), 300).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, Math.floor(now.getTime() / 300000)]);

  if (!signedIn) {
    return (
      <main class="page">
        <Header dateLine="Meldungen zu deinen Themen" title="News" />
        <StateCard title="Nach der Anmeldung" message="Meldungen gibt es, sobald du angemeldet bist." />
      </main>
    );
  }

  const all = block?.status === 'ok' ? block.data : [];
  const scoped = onlyDepot ? all.filter((n) => n.positions > 0 || n.official) : all;
  const topics = [...new Set(scoped.flatMap((n) => n.topics))].sort((a, b) => a.localeCompare(b, 'de'));
  const shown = rankLive(topic ? scoped.filter((n) => n.topics.includes(topic)) : scoped);

  return (
    <main class="page">
      <Header dateLine="Letzte 48 Stunden · wichtigste zuerst" title="News" />
      {!block && <SkeletonCard height={240} />}
      {block && block.status !== 'ok' && <StateCard title="News" message={block.message} error={block.status === 'error'} />}
      {block?.status === 'ok' && (
        <>
          <div class="chips" role="group" aria-label="Filter">
            <button class={`chip${onlyDepot ? ' chip--active' : ''}`} type="button" aria-pressed={onlyDepot} onClick={() => setOnlyDepot(!onlyDepot)}>
              Nur mein Depot
            </button>
            {topics.map((t) => (
              <button key={t} class={`chip${topic === t ? ' chip--active' : ''}`} type="button" aria-pressed={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
          {shown.length ? (
            <NewsList title={`${shown.length} ${shown.length === 1 ? 'Meldung' : 'Meldungen'}`} items={shown.slice(0, 60)} now={now} />
          ) : (
            <StateCard
              title="Keine Meldungen"
              message={all.length ? 'Zu diesem Filter gibt es gerade nichts.' : 'Die Meldungen werden alle 30 Minuten abgerufen (6 bis 23 Uhr). Lege im Depot Themen fest, damit passende Meldungen gefunden werden.'}
            />
          )}
        </>
      )}
      <p class="disclaimer">
        {DISCLAIMER} Quellen: tagesschau.de, CNBC, EZB, Federal Reserve, Bundesbank und die GDELT-Nachrichtensuche. Gespeichert werden nur Titel, Anreißer und
        Link; den ganzen Artikel liest du beim Original.
      </p>
    </main>
  );
}
