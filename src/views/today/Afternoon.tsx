import type { JSX } from 'preact';
import { BlockView } from '../../components/Block';
import { Header, useGreeting } from '../../components/Header';
import { Axis, ChangeTiles, DepotHeadline, ExternalLink, IndexStrip, IntradayChart, MissingNote } from '../../components/Market';
import type { DataSource } from '../../data/types';
import { formatDateLong, formatDuration, formatPct, formatTime, formatWeekday, trend } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { lastClosedTradingDay, minutesUntil, usSessionInZone, xetraStatus, type MarketStatus } from '../../lib/time';
import { useViewData } from './Today';

export function marketPill(status: MarketStatus): string {
  switch (status) {
    case 'open':
      return 'Xetra offen';
    case 'pre':
      return 'Xetra öffnet 09:00';
    case 'closed':
      return 'Xetra geschlossen';
    case 'holiday':
      return 'Börse geschlossen';
  }
}

export function Afternoon({ source, now, switcher }: { source: DataSource; now: Date; switcher: JSX.Element }) {
  const { timeZone, tradingEnd } = useSettings();
  const minuteKey = Math.floor(now.getTime() / 60000);
  const data = useViewData(() => source.afternoon(now), [source, minuteKey]);
  const title = useGreeting('Guten Nachmittag', false);
  const status = xetraStatus(now, { tradingEnd });
  const us = usSessionInZone(now, timeZone);
  const toUsOpen = minutesUntil(now, us.open, timeZone);

  return (
    <>
      <Header dateLine={`${formatDateLong(now, timeZone)} · ${formatTime(now, timeZone)}`} title={title} pill={marketPill(status)} />
      {switcher}

      <BlockView block={data?.depot} title="Depot heute" skeletonHeight={260}>
        {(d) => {
          const closeName = `${formatWeekday(d.prevCloseDay, 'UTC')}sschluss`;
          const toEnd = minutesUntil(now, tradingEnd, timeZone);
          const progress =
            status === 'open'
              ? `noch ${formatDuration(toEnd)} bis Handelsende`
              : status === 'pre'
                ? 'Handel beginnt um 09:00'
                : status === 'holiday'
                  ? 'Heute kein Handel'
                  : 'Handel beendet';
          return (
            <section class="card gap-12" aria-label="Depot heute bisher">
              <div class="card-label">
                {status === 'holiday'
                  ? `Depot · letzter Handelstag ${formatWeekday(lastClosedTradingDay(now, { tradingEnd }), 'UTC')}`
                  : 'Depot heute bisher · Kurse ca. 15 Min. verzögert'}
              </div>
              <DepotHeadline summary={d.summary} comparedTo={closeName} />
              <IntradayChart series={d.intraday} />
              <Axis labels={['09:00', '12:00', '15:00', tradingEnd]} />
              <div class="note">
                Gestrichelt: {closeName} · {progress}
              </div>
              <MissingNote count={d.missing} />
            </section>
          );
        }}
      </BlockView>

      <BlockView block={data?.indices} skeletonHeight={60} hideWhenEmpty>
        {(items) => <IndexStrip items={items} />}
      </BlockView>

      <BlockView block={data?.groups} title="Bewegung nach Gruppen">
        {(groups) => (
          <section class="card gap-12">
            <h2>Bewegung nach Gruppen</h2>
            <ChangeTiles items={groups} />
          </section>
        )}
      </BlockView>

      <BlockView block={data?.morningEvents} title="Termine von heute Morgen">
        {(events) => (
          <section class="card gap-10">
            <h2>Termine von heute Morgen</h2>
            {events.length === 0 && <p class="block-state">Heute keine wichtigen Termine.</p>}
            {events.map((e) => (
              <div key={e.time + e.title} class="result">
                <span class="result__time">{e.time}</span>
                <div class="result__body">
                  <span class="result__title">{e.title}</span>
                  <span class="result__text">{e.result}</span>
                  {e.reaction && (
                    <span class={`result__reaction ${trend(e.reaction.changePct, 1)}`}>
                      {e.reaction.label}: {formatPct(e.reaction.changePct, 1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </BlockView>

      <BlockView block={data?.usStart} title="US-Start">
        {(d) => (
          <section class="card gap-10">
            <div class="card-head card-head--baseline">
              <h2>US-Start</h2>
              <span class="countdown">{toUsOpen > 0 ? `in ${formatDuration(toUsOpen)}` : `seit ${us.open} offen`}</span>
            </div>
            <div class="card-sub">Futures vor Handelsbeginn um {us.open} Uhr</div>
            <ChangeTiles items={d.futures} mutedNames />
          </section>
        )}
      </BlockView>

      <BlockView block={data?.marketNow} hideWhenEmpty>
        {(m) => (
          <section class="card card--primary gap-8">
            <h2 class="eyebrow">Was bewegt den Markt gerade</h2>
            <p class="lead-text">{m.text}</p>
            <ExternalLink href={m.url}>Zum Original ↗</ExternalLink>
          </section>
        )}
      </BlockView>
    </>
  );
}
