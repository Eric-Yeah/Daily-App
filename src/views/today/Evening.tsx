import type { JSX } from 'preact';
import { BlockView } from '../../components/Block';
import { CloseDayCard, NewsList } from '../../components/Content';
import { Header, useGreeting } from '../../components/Header';
import { Axis, DepotHeadline, EventList, ExternalLink, GroupBars, IntradayChart, KpiTiles, MissingNote, NumberedCard, UsMiniChart } from '../../components/Market';
import { empty, type DataSource } from '../../data/types';
import { formatDateLong, formatPct, formatTime, formatWeekday, trend } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { xetraStatus } from '../../lib/time';
import { today } from '../../data/personal';
import { marketPill } from './Afternoon';
import { useViewData } from './Today';

export function Evening({ source, now, switcher }: { source: DataSource; now: Date; switcher: JSX.Element }) {
  const { timeZone, tradingEnd } = useSettings();
  const minuteKey = Math.floor(now.getTime() / 60000);
  const data = useViewData(() => source.evening(now), [source, minuteKey]);
  const title = useGreeting('Guten Abend');
  const status = xetraStatus(now, { tradingEnd });

  return (
    <>
      <Header dateLine={`${formatDateLong(now, timeZone)} · ${formatTime(now, timeZone)}`} title={title} pill={marketPill(status)} />
      {switcher}

      <BlockView block={data?.balance} title="Tagesbilanz" skeletonHeight={360}>
        {(d) => (
          <section class="card gap-12" aria-label="Tagesbilanz">
            <div class="card-label">
              Tagesbilanz · {status === 'closed' || status === 'holiday' ? `Schlusskurse ${tradingEnd}` : 'bisher, Handel läuft'}
            </div>
            <DepotHeadline summary={d.summary} comparedTo={`${formatWeekday(d.prevCloseDay, 'UTC')}sschluss`} />
            <IntradayChart series={d.intraday} />
            <Axis labels={['09:00', '12:00', '15:00', tradingEnd]} />
            <div class="divider" />
            <GroupBars groups={d.groups} />
            <MissingNote count={d.missing} />
          </section>
        )}
      </BlockView>

      <BlockView block={data?.drivers} hideWhenEmpty>
        {(d) => (
          <NumberedCard title="Treiber des Tages" items={d.items}>
            <ExternalLink href={d.sourcesUrl}>Quellen ansehen ↗</ExternalLink>
          </NumberedCard>
        )}
      </BlockView>

      <BlockView block={data?.news} title="Neu seit heute Morgen" skeletonHeight={200}>
        {(items) => <NewsList title="Neu seit heute Morgen" items={items} now={now} />}
      </BlockView>

      <BlockView block={data?.us} title="US-Markt" skeletonHeight={200}>
        {(u) => (
          <section class="card">
            <div class="card-head card-head--baseline">
              <h2>US-Markt</h2>
              <span class="countdown">live bis {u.sessionEnd}</span>
            </div>
            {u.indices.map((i) => (
              <div key={i.name} class="group">
                <div class="group__row">
                  <span>{i.name}</span>
                  <span class={`group__change ${trend(i.changePct, 1)}`}>{formatPct(i.changePct, 1)}</span>
                </div>
                <UsMiniChart points={i.points} prevClose={i.prevClose} start={u.sessionStart} end={u.sessionEnd} changePct={i.changePct} />
              </div>
            ))}
            <Axis labels={[u.sessionStart, '18:00', '20:00', u.sessionEnd]} />
            <p class="card-sub card-sub--loose">
              Der US-Teil deiner Welt-ETFs bewegt sich heute Abend noch weiter. Das zeigt sich erst morgen im Kurs.
            </p>
          </section>
        )}
      </BlockView>

      <BlockView block={data?.outlook} title="Ausblick auf morgen">
        {(events) => <EventList title="Ausblick auf morgen" events={events} />}
      </BlockView>

      <BlockView block={data?.periods} skeletonHeight={90} hideWhenEmpty>
        {(items) => <KpiTiles items={items} columns={3} />}
      </BlockView>

      <CloseDayCard store={source.tasks} notes={source.notes} day={today(now)} training={data?.trainingDone ?? empty('')} />
    </>
  );
}
