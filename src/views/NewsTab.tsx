import { useEffect, useState } from 'preact/hooks';
import { SkeletonCard, StateCard } from '../components/Block';
import { NewsList } from '../components/Content';
import { Header } from '../components/Header';
import { WrapCard } from '../components/Wrap';
import { loadNews, type LiveNews } from '../data/live';
import { currentSession } from '../lib/auth';
import { useNow } from '../lib/clock';
import { MARKETS } from '../lib/markets';
import { useResync } from '../lib/resync';
import { activeCount, applyFilter, DEFAULT_FILTER, marketCounts, type NewsFilter } from '../lib/newsFilter';
import type { Block } from '../data/types';
import { DISCLAIMER } from './Pages';

const PAGE = 40;

export function NewsTab() {
  const now = useNow(60_000);
  const [block, setBlock] = useState<Block<LiveNews[]>>();
  const [filter, setFilter] = useState<NewsFilter>(DEFAULT_FILTER);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const signedIn = !!currentSession();
  const [attempt, setAttempt] = useState(0);
  useResync(() => setAttempt((n) => n + 1));

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    loadNews(new Date(Date.now() - 48 * 3600000).toISOString(), 800).then((b) => alive && setBlock(b));
    return () => {
      alive = false;
    };
  }, [signedIn, attempt, Math.floor(now.getTime() / 300000)]);

  const change = (patch: Partial<NewsFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setLimit(PAGE);
  };

  if (!signedIn) {
    return (
      <main class="page">
        <Header dateLine="Meldungen zu deinen Themen" title="News" />
        <StateCard title="Nach der Anmeldung" message="Meldungen gibt es, sobald du angemeldet bist." />
      </main>
    );
  }

  const all = block?.status === 'ok' ? block.data : [];
  const shown = applyFilter(all, filter, now);
  const counts = marketCounts(all);
  const topics = [...new Set(all.filter((n) => n.positions > 0).flatMap((n) => n.topics))].sort((a, b) => a.localeCompare(b, 'de'));
  const sources = [...new Set(all.map((n) => n.source))].sort((a, b) => a.localeCompare(b, 'de'));
  const active = activeCount(filter);
  const toggleMarket = (key: string) => change({ markets: filter.markets.includes(key) ? filter.markets.filter((k) => k !== key) : [...filter.markets, key] });

  return (
    <main class="page">
      <Header dateLine="Letzte 48 Stunden" title="News" />
      <WrapCard />
      {!block && <SkeletonCard height={240} />}
      {block && block.status !== 'ok' && <StateCard title="News" message={block.message} error={block.status === 'error'} />}
      {block?.status === 'ok' && (
        <>
          <div class="field">
            <label class="visually-hidden" for="news-search">
              Meldungen durchsuchen
            </label>
            <input
              id="news-search"
              class="input"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Meldungen durchsuchen"
              value={filter.query}
              onInput={(e) => change({ query: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>

          <div class="chips" role="group" aria-label="Märkte">
            {MARKETS.filter((m) => counts[m.key] || filter.markets.includes(m.key)).map((m) => (
              <button key={m.key} class={`chip${filter.markets.includes(m.key) ? ' chip--active' : ''}`} type="button" aria-pressed={filter.markets.includes(m.key)} onClick={() => toggleMarket(m.key)}>
                {m.label} <span class="chip__count">{counts[m.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <div class="filters">
            <button class="chip" type="button" aria-expanded={open} aria-controls="news-filters" onClick={() => setOpen(!open)}>
              Weitere Filter{active ? ` · ${active}` : ''} {open ? '▴' : '▾'}
            </button>
            {active > 0 && (
              <button class="link-button" type="button" onClick={() => change({ ...DEFAULT_FILTER, sort: filter.sort })}>
                Zurücksetzen
              </button>
            )}
          </div>
          {open && (
            <section class="card gap-12" id="news-filters" aria-label="Weitere Filter">
              <div class="field">
                <span class="field__label" id="lbl-hours">
                  Zeitraum
                </span>
                <div class="segmented segmented--auto" role="group" aria-labelledby="lbl-hours">
                  {([6, 24, 48] as const).map((h) => (
                    <button key={h} type="button" aria-pressed={filter.hours === h} onClick={() => change({ hours: h })}>
                      {h} Std.
                    </button>
                  ))}
                </div>
              </div>
              <div class="field">
                <span class="field__label" id="lbl-sort">
                  Sortierung
                </span>
                <div class="segmented segmented--auto" role="group" aria-labelledby="lbl-sort">
                  <button type="button" aria-pressed={filter.sort === 'importance'} onClick={() => change({ sort: 'importance' })}>
                    Wichtigste zuerst
                  </button>
                  <button type="button" aria-pressed={filter.sort === 'recent'} onClick={() => change({ sort: 'recent' })}>
                    Neueste zuerst
                  </button>
                </div>
              </div>
              <div class="field">
                <label class="field__label" for="news-source">
                  Quelle
                </label>
                <select id="news-source" class="input" value={filter.source ?? ''} onChange={(e) => change({ source: (e.currentTarget as HTMLSelectElement).value || null })}>
                  <option value="">Alle Quellen</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div class="chips" role="group" aria-label="Auswahl">
                <button class={`chip${filter.onlyDepot ? ' chip--active' : ''}`} type="button" aria-pressed={filter.onlyDepot} onClick={() => change({ onlyDepot: !filter.onlyDepot })}>
                  Nur mein Depot
                </button>
                <button class={`chip${filter.onlyImportant ? ' chip--active' : ''}`} type="button" aria-pressed={filter.onlyImportant} onClick={() => change({ onlyImportant: !filter.onlyImportant })}>
                  Nur Wichtiges
                </button>
                <button class={`chip${filter.onlyOfficial ? ' chip--active' : ''}`} type="button" aria-pressed={filter.onlyOfficial} onClick={() => change({ onlyOfficial: !filter.onlyOfficial })}>
                  Nur Notenbanken
                </button>
              </div>
              {topics.length > 0 && (
                <div class="field">
                  <span class="field__label" id="lbl-topics">
                    Themen deiner Positionen
                  </span>
                  <div class="chips" role="group" aria-labelledby="lbl-topics">
                    {topics.map((t) => (
                      <button key={t} class={`chip${filter.topic === t ? ' chip--active' : ''}`} type="button" aria-pressed={filter.topic === t} onClick={() => change({ topic: filter.topic === t ? null : t })}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {shown.length ? (
            <>
              <NewsList title={`${shown.length} ${shown.length === 1 ? 'Meldung' : 'Meldungen'}`} items={shown.slice(0, limit)} now={now} />
              {shown.length > limit && (
                <button class="button button--secondary button--wide" type="button" onClick={() => setLimit(limit + PAGE)}>
                  Mehr anzeigen ({shown.length - limit} weitere)
                </button>
              )}
            </>
          ) : (
            <StateCard
              title="Keine Meldungen"
              message={
                all.length
                  ? 'Zu diesen Filtern gibt es gerade nichts. Lockere die Filter oder tippe auf „Zurücksetzen“.'
                  : 'Die Meldungen werden alle 30 Minuten abgerufen (6 bis 23 Uhr). Lege im Depot Themen fest, damit Meldungen deinen Positionen zugeordnet werden.'
              }
            />
          )}
        </>
      )}
      <p class="disclaimer">
        {DISCLAIMER} Quellen: tagesschau.de, Handelsblatt, FAZ, DER SPIEGEL, ZEIT ONLINE, n-tv, CNBC, MarketWatch, BBC News, The Guardian, EZB, Federal Reserve, Bank of England, Bundesbank. Gespeichert
        werden nur Titel, Anreißer und Link, nie der Artikel; „Ausführlich“ speichert nur die KI-Zusammenfassung. Den ganzen Artikel liest du beim Original.
      </p>
    </main>
  );
}
