import type { JSX } from 'preact';
import { BlockView } from '../../components/Block';
import { AlertCard, DayCard, NewsList, TaskCard, TrainingCard } from '../../components/Content';
import { Header, useGreeting } from '../../components/Header';
import { ListenButton } from '../../components/Listen';
import { MarketOpenCard, useMarketOpen } from '../../components/MarketOpen';
import { useWrap, WrapCard } from '../../components/Wrap';
import { DepotHeadline, EventList, GroupBars, IndexStrip, KpiTiles, MissingNote, NumberedCard, Sparkline } from '../../components/Market';
import type { DataSource } from '../../data/types';
import { morningScript, okData } from '../../lib/briefingScript';
import { formatDateLong, formatNumber, formatWeekday } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { useViewData, ViewState } from './Today';

export function Morning({ source, now, switcher }: { source: DataSource; now: Date; switcher: JSX.Element }) {
  const { timeZone, displayName, hideAmounts } = useSettings();
  const minuteKey = Math.floor(now.getTime() / 60000);
  const view = useViewData('morning', () => source.morning(now), [source, minuteKey]);
  const data = view.data;
  const title = useGreeting('Guten Morgen');
  const wrap = useWrap('morning');
  const open = useMarketOpen();
  const script = morningScript(
    data,
    { wrap: okData(wrap.block), open: okData(open.block), liveBlog: null },
    { now, timeZone, name: displayName, hideAmounts },
    'Guten Morgen',
  );
  const weather = data?.weather.status === 'ok' ? data.weather.data : null;

  return (
    <>
      <Header
        dateLine={formatDateLong(now, timeZone)}
        title={title}
        pill={weather ? `${formatNumber(weather.tempC)}° · ${weather.text}` : undefined}
      />
      {switcher}
      <ViewState view={view}>
      <ListenButton id="morning" title="Morgenbriefing" script={script} pending={!data || wrap.pending || open.pending} />

      <BlockView block={data?.indices} skeletonHeight={60} hideWhenEmpty>
        {(items) => <IndexStrip items={items} />}
      </BlockView>

      <MarketOpenCard />

      <WrapCard kind="morning" />

      <BlockView block={data?.important} hideWhenEmpty>
        {(items) => (items.length > 0 ? <NumberedCard title="Heute wichtig" items={items} /> : null)}
      </BlockView>

      <BlockView block={data?.depot} title="Depot" skeletonHeight={300}>
        {(d) => (
          <section class="card" aria-label="Depot gesamt">
            <div class="card-label">Depot gesamt · Schlusskurse {formatWeekday(d.closeDay, 'UTC')}</div>
            <DepotHeadline summary={d.summary} comparedTo="Vortag" />
            <Sparkline history={d.history} />
            <div class="divider" />
            <GroupBars groups={d.groups} />
            <MissingNote count={d.missing} />
          </section>
        )}
      </BlockView>

      <BlockView block={data?.kpis} skeletonHeight={90} hideWhenEmpty>
        {(k) => (
          <KpiTiles
            items={[
              { label: 'Seit Kauf', pct: k.sinceBuy.pct, abs: k.sinceBuy.abs, sub: '' },
              { label: 'Seit Jahresanfang', pct: k.ytd.pct, abs: k.ytd.abs, sub: '' },
            ]}
          />
        )}
      </BlockView>

      <BlockView block={data?.alert} hideWhenEmpty>
        {(alert) => (alert ? <AlertCard alert={alert} /> : null)}
      </BlockView>

      <BlockView block={data?.news} title="Meldungen zu deinen Themen" skeletonHeight={200}>
        {(items) => <NewsList title="Meldungen zu deinen Themen" items={items} now={now} />}
      </BlockView>

      <BlockView block={data?.events} title="Markt heute">
        {(events) => <EventList title="Markt heute" events={events} />}
      </BlockView>

      <BlockView block={data?.training} title="Training" skeletonHeight={260}>
        {(t) => <TrainingCard training={t} />}
      </BlockView>

      <BlockView block={data?.day} title="Dein Tag">
        {(entries) => <DayCard entries={entries} />}
      </BlockView>

      <TaskCard store={source.tasks} />
      </ViewState>
    </>
  );
}
