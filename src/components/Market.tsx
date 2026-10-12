import type { ComponentChildren } from 'preact';
import type { DepotSummary, GroupMove, IndexQuote, IntradaySeries, Kpi, MarketEvent, SeriesPoint } from '../data/types';
import { sessionChart, sparkline } from '../lib/chart';
import { formatEuro, formatPct, formatPctArrow, MISSING, spokenPct, trend } from '../lib/format';
import { useSettings } from '../lib/settings';
import { safeHref } from '../lib/safeUrl';

/** A percent change: shown with sign (and arrow), read out as words, so the direction is not only a colour. */
function Pct({ value, decimals = 1, withArrow = false }: { value: number | null; decimals?: number; withArrow?: boolean }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">{MISSING}</span>
        <span class="visually-hidden">kein Kurs</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true">{withArrow ? formatPctArrow(value, decimals) : formatPct(value, decimals)}</span>
      <span class="visually-hidden">{spokenPct(value, decimals)}</span>
    </>
  );
}

const trendClass = (v: number | null, decimals = 1) => (v === null ? 'flat' : trend(v, decimals));

export function IndexStrip({ items }: { items: IndexQuote[] }) {
  return (
    <ul class="index-strip" aria-label="Indizes">
      {items.map((i) => (
        <li key={i.name} class="index-tile">
          <span class="index-tile__name">{i.name}</span>
          <span class={`index-tile__change ${trendClass(i.changePct)}`}>
            <Pct value={i.changePct} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Big value + change pill + "+201 € gegenüber …" line. */
export function DepotHeadline({ summary, comparedTo }: { summary: DepotSummary; comparedTo: string }) {
  const { hideAmounts } = useSettings();
  const t = trend(summary.changePct, 2);
  return (
    <>
      <div class="depot-row">
        <div class="depot-value">{formatEuro(summary.value, { hidden: hideAmounts })}</div>
        <div class={`change-pill ${t}`}>
          <Pct value={summary.changePct} decimals={2} withArrow />
        </div>
      </div>
      <div class="depot-sub">
        {formatEuro(summary.changeAbs, { signed: true, hidden: hideAmounts })} gegenüber {comparedTo}
      </div>
    </>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const p = sparkline(values);
  const first = values[0];
  const last = values.at(-1);
  const label =
    values.length > 1 && first > 0 && last !== undefined
      ? `Verlauf der letzten ${values.length} Schlusskurse: ${spokenPct(((last - first) / first) * 100)} seit dem ersten`
      : 'Verlauf der Schlusskurse';
  return (
    <svg class="chart" viewBox="0 0 320 64" height="64" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={p.area} fill="#8DB8FF" fill-opacity="0.14" />
      <path
        d={p.line}
        fill="none"
        stroke="#8DB8FF"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Depot intraday curve: dashed previous close, filled area, marker, dotted remainder. */
export function IntradayChart({ series }: { series: IntradaySeries }) {
  const c = sessionChart(series.points, series.prevClose, { start: series.sessionStart, end: series.sessionEnd }, { height: 110, top: 22, bottom: 70 });
  const last = series.points.at(-1);
  const label = last
    ? `Tageskurve des Depots: aktuell ${spokenPct(((last.value - series.prevClose) / series.prevClose) * 100, 2)} gegenüber dem Vortagsschluss`
    : 'Tageskurve des Depots';
  return (
    <svg class="chart" viewBox="0 0 320 110" height="110" role="img" aria-label={label}>
      <line x1="0" y1={c.baselineY} x2="320" y2={c.baselineY} stroke="#4A5B70" stroke-width="1.5" stroke-dasharray="4 5" />
      {c.end && (
        <>
          <path d={c.area} fill="#8DB8FF" fill-opacity="0.14" />
          <path d={c.line} fill="none" stroke="#8DB8FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx={Math.max(4.5, Math.min(316, c.end.x))} cy={c.end.y} r="4.5" fill="#8DB8FF" />
          {c.open && (
            <line x1={c.end.x} y1={c.end.y} x2="320" y2={c.end.y} stroke="#3A4A5F" stroke-width="1.5" stroke-dasharray="2 5" />
          )}
        </>
      )}
    </svg>
  );
}

/** Small per-index curve for the US session (evening view). */
export function UsMiniChart({ points, prevClose, start, end, changePct, name }: {
  name?: string;
  points: SeriesPoint[];
  prevClose: number;
  start: string;
  end: string;
  changePct: number;
}) {
  const c = sessionChart(points, prevClose, { start, end }, { height: 44, top: 8, bottom: 38 });
  const color = trend(changePct, 1) === 'neg' ? '#FF9C93' : trend(changePct, 1) === 'pos' ? '#6FDCAA' : '#A9B8C9';
  return (
    <svg class="chart" viewBox="0 0 320 44" height="44" role="img" aria-label={`Tageskurve${name ? ` ${name}` : ''}: ${spokenPct(changePct, 1)}`}>
      <line x1="0" y1={c.baselineY} x2="320" y2={c.baselineY} stroke="#4A5B70" stroke-width="1.5" stroke-dasharray="4 5" />
      {c.end && (
        <>
          <path d={c.line} fill="none" stroke={color} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          {c.open && (
            <line x1={c.end.x} y1={c.end.y} x2="320" y2={c.end.y} stroke="#3A4A5F" stroke-width="1.5" stroke-dasharray="2 5" />
          )}
        </>
      )}
    </svg>
  );
}

export function Axis({ labels }: { labels: string[] }) {
  return (
    <div class="axis" aria-hidden="true">
      {labels.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}

export function GroupBars({ groups }: { groups: GroupMove[] }) {
  return (
    <ul class="groups">
      {groups.map((g) => {
        const t = trend(g.changePct, 1);
        return (
          <li key={g.name} class="group">
            <div class="group__row">
              <span>
                {g.name} <span class="group__share">· {Math.round(g.sharePct)} %</span>
              </span>
              <span class={`group__change ${t}`}>
                <Pct value={g.changePct} />
              </span>
            </div>
            <div class="bar" aria-hidden="true">
              <div class={`bar__fill ${t}`} style={{ width: `${Math.min(100, Math.max(0, g.sharePct))}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ChangeTiles({ items, mutedNames = false }: { items: { name: string; changePct: number | null }[]; mutedNames?: boolean }) {
  return (
    <ul class="tiles-2">
      {items.map((g) => (
        <li key={g.name} class="tile">
          <span class={`tile__name${mutedNames ? ' tile__name--muted' : ''}`}>{g.name}</span>
          <span class={`tile__value ${trendClass(g.changePct)}`}>
            <Pct value={g.changePct} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function KpiTiles({ items, columns = 2 }: { items: (Kpi & { abs?: number })[]; columns?: 2 | 3 }) {
  const { hideAmounts } = useSettings();
  return (
    <div class={`kpis${columns === 3 ? ' kpis--3' : ''}`}>
      {items.map((k) => (
        <div key={k.label} class="kpi">
          <span class="kpi__label">{k.label}</span>
          <span class={`kpi__value ${trend(k.pct, 1)}`}>
            <Pct value={k.pct} />
          </span>
          <span class="kpi__sub">{k.abs !== undefined ? formatEuro(k.abs, { signed: true, hidden: hideAmounts }) : k.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function EventList({ title, events }: { title: string; events: MarketEvent[] }) {
  return (
    <section class="card gap-12">
      <h2>{title}</h2>
      {events.length === 0 ? (
        <p class="block-state">Keine wichtigen Termine.</p>
      ) : (
        events.map((e) => (
          <div key={e.time + e.title} class="event">
            <span class="event__time">{e.time}</span>
            <span class="event__title">{e.title}</span>
          </div>
        ))
      )}
    </section>
  );
}

/** Blue card with numbered points ("Heute wichtig", "Treiber des Tages"). */
export function NumberedCard({ title, items, children }: { title: string; items: string[]; children?: ComponentChildren }) {
  return (
    <section class="card card--primary gap-12">
      <h2 class="eyebrow">{title}</h2>
      <ol class="numbered-list">
        {items.map((text, i) => (
          <li key={i} class="numbered">
            <span class="numbered__n" aria-hidden="true">
              {i + 1}
            </span>
            <span class="lead-text">{text}</span>
          </li>
        ))}
      </ol>
      {children}
    </section>
  );
}

export function ExternalLink({ href, children, class: className = 'link-strong' }: { href: string; children: ComponentChildren; class?: string }) {
  return (
    <a class={className} href={safeHref(href)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Hint under a depot card: positions without a price are left out of the numbers, never estimated. */
export function MissingNote({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <div class="note" role="note">
      {count === 1 ? '1 Position ohne Kurs, nicht eingerechnet.' : `${count} Positionen ohne Kurs, nicht eingerechnet.`}
    </div>
  );
}
