import type { LiveBlogEntry, LiveMarketOpen, LiveWrap } from '../data/live';
import type { AfternoonData, Block, EveningData, GroupMove, IndexQuote, MorningData, NewsItem } from '../data/types';
import { formatDateLong, formatEuro, formatWeekday, spokenPct, trend } from './format';
import type { Segment } from './speech';

// The text that is read aloud, built from the same data the screen shows. Pure functions: what comes out is
// what the voice reads (symbols like % or € are turned into words later, see `cleanForSpeech`).

export interface ScriptContext {
  now: Date;
  timeZone: string;
  name: string;
  /** "Beträge ausblenden": no euro amounts are read, only percentages. */
  hideAmounts: boolean;
}

/** What the views load on their own besides their data block: null = not available (hidden on screen too). */
export interface Extras {
  wrap: LiveWrap | null;
  open: LiveMarketOpen | null;
  liveBlog: LiveBlogEntry[] | null;
}

const MAX_NEWS = 4;
const MAX_LIVE = 3;
const ORDINALS = ['Erstens', 'Zweitens', 'Drittens', 'Viertens', 'Fünftens'];

export const okData = <T>(b: Block<T> | undefined): T | null => (b?.status === 'ok' ? b.data : null);
const seg = (label: string, ...parts: (string | null | undefined | false)[]): Segment[] => {
  const text = parts.filter(Boolean).join(' ');
  return text ? [{ label, text }] : [];
};
/** Adds the sentence end if the text has none, so lists read as separate sentences. */
const sentence = (t: string): string => (/[.!?…:]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

function intro(greeting: string, what: string, c: ScriptContext): Segment[] {
  const who = c.name ? `${greeting}, ${c.name}.` : `${greeting}.`;
  return seg('Einstieg', who, `Hier ist dein ${what} für ${formatDateLong(c.now, c.timeZone)}.`);
}

const MAX_SPOKEN_INDICES = 5; // the strip is long; read the first few indices, but always the oil prices

function indexLine(indices: IndexQuote[] | null): Segment[] {
  const quoted = (indices ?? []).filter((i) => i.changePct !== null);
  const picked = [...quoted.filter((i) => !i.price).slice(0, MAX_SPOKEN_INDICES), ...quoted.filter((i) => i.price)];
  const list = picked.map((i) => `${i.name} ${spokenPct(i.changePct as number, 1)}`);
  return list.length ? seg('Indizes', 'Die Märkte im Überblick:', `${list.join(', ')}.`) : [];
}

function groupLine(groups: GroupMove[] | null): string | null {
  const list = (groups ?? []).map((g) => `${g.name} ${spokenPct(g.changePct, 1)}`);
  return list.length ? `Nach Gruppen: ${list.join(', ')}.` : null;
}

function newsSegment(title: string, items: NewsItem[] | null): Segment[] {
  const picked = (items ?? []).slice(0, MAX_NEWS);
  if (!picked.length) return [];
  return seg(title, `${title}.`, ...picked.map((n) => `${sentence(n.title)} ${!n.headlineOnly && n.summary ? sentence(n.summary) : ''}`.trim()));
}

function eventsSegment(title: string, events: { time: string; title: string }[] | null): Segment[] {
  if (!events?.length) return [];
  return seg(title, `${title}.`, ...events.map((e) => sentence(`Um ${e.time}: ${e.title}`)));
}

export function wrapSegments(wrap: LiveWrap | null): Segment[] {
  if (!wrap) return [];
  return [
    { label: 'Marktüberblick', text: sentence(wrap.headline) },
    ...wrap.sections.map((s) => ({ label: `Marktüberblick · ${s.title}`, text: `${sentence(s.title)} ${sentence(s.text)}` })),
  ];
}

function openSegments(open: LiveMarketOpen | null): Segment[] {
  if (!open) return [];
  const movers = (title: string, list: LiveMarketOpen['gainers']) =>
    list.length ? `${title}: ${list.map((m) => `${m.name} ${spokenPct(m.changePct, 1)}`).join(', ')}.` : null;
  return seg(
    'Marktstart',
    'Der Marktstart.',
    open.headline && sentence(open.headline),
    open.text && sentence(open.text),
    movers('Größte Gewinner', open.gainers),
    movers('Größte Verlierer', open.losers),
  );
}

function depotSentence(
  summary: { value: number; changeAbs: number; changePct: number },
  comparedTo: string,
  hideAmounts: boolean,
): string {
  if (trend(summary.changePct, 2) === 'flat') {
    return hideAmounts ? `Dein Depot ist unverändert gegenüber ${comparedTo}.` : `Dein Depot ist ${formatEuro(summary.value)} wert, unverändert gegenüber ${comparedTo}.`;
  }
  const pct = spokenPct(summary.changePct, 2);
  return hideAmounts
    ? `Dein Depot steht bei ${pct} gegenüber ${comparedTo}.`
    : `Dein Depot ist ${formatEuro(summary.value)} wert, ${formatEuro(summary.changeAbs, { signed: true })}, also ${pct} gegenüber ${comparedTo}.`;
}

export function morningScript(data: MorningData | undefined, extras: Extras, c: ScriptContext, greeting: string): Segment[] {
  if (!data) return [];
  const out: Segment[] = [...intro(greeting, 'Morgenbriefing', c), ...indexLine(okData(data.indices)), ...openSegments(extras.open), ...wrapSegments(extras.wrap)];

  const important = okData(data.important);
  if (important?.length) {
    out.push(...seg('Heute wichtig', 'Heute wichtig.', ...important.map((t, i) => `${ORDINALS[i] ?? 'Außerdem'}: ${sentence(t)}`)));
  }

  const depot = okData(data.depot);
  const kpis = okData(data.kpis);
  if (depot) {
    const closeDay = formatWeekday(depot.closeDay, 'UTC');
    out.push(
      ...seg(
        'Depot',
        depotSentence(depot.summary, `dem Vortag (Schlusskurse vom ${closeDay})`, c.hideAmounts),
        groupLine(depot.groups),
        kpis && `Seit Kauf ${spokenPct(kpis.sinceBuy.pct, 1)}, seit Jahresanfang ${spokenPct(kpis.ytd.pct, 1)}.`,
      ),
    );
  }

  const alert = okData(data.alert);
  if (alert) out.push(...seg('Auffällig', `Achtung: ${alert.name} ${spokenPct(alert.changePct, 1)}.`, sentence(alert.summary)));

  out.push(...newsSegment('Meldungen zu deinen Themen', okData(data.news)));
  out.push(...eventsSegment('Markt heute', okData(data.events)));

  const t = okData(data.training);
  if (t) {
    out.push(
      ...seg(
        'Training',
        `Training: ${sentence(t.dayTitle)}`,
        sentence(`${t.weekLabel}${t.plannedTime ? `, geplant um ${t.plannedTime}` : ''}`),
        `${t.lastWeekLabel.charAt(0).toUpperCase()}${t.lastWeekLabel.slice(1)}: ${sentence(t.lastWeekValue)}`,
      ),
    );
  }

  const day = okData(data.day);
  if (day?.length) {
    out.push(...seg('Dein Tag', 'Dein Tag.', ...day.map((d) => sentence(`${/\d/.test(d.time) ? `Um ${d.time}` : d.time}: ${d.title}${d.sub ? `, ${d.sub}` : ''}`))));
  }
  return out;
}

export function afternoonScript(data: AfternoonData | undefined, extras: Extras, c: ScriptContext, greeting: string): Segment[] {
  if (!data) return [];
  const out: Segment[] = [...intro(greeting, 'Nachmittagsbriefing', c), ...openSegments(extras.open)];

  const live = (extras.liveBlog ?? []).slice(0, MAX_LIVE);
  if (live.length) out.push(...seg('Live-Blog', 'Das Neueste aus dem Live-Blog.', ...live.map((e) => `${sentence(e.headline)} ${sentence(e.body)}`)));

  const depot = okData(data.depot);
  if (depot) {
    out.push(...seg('Depot heute', depotSentence(depot.summary, `dem Schlusskurs vom ${formatWeekday(depot.prevCloseDay, 'UTC')}`, c.hideAmounts)));
  }
  out.push(...indexLine(okData(data.indices)));
  const groups = groupLine(okData(data.groups));
  if (groups) out.push(...seg('Gruppen', groups));

  const results = okData(data.morningEvents);
  if (results?.length) {
    out.push(
      ...seg(
        'Termine von heute Morgen',
        'Die Termine von heute Morgen.',
        ...results.map((e) => `${sentence(`Um ${e.time}: ${e.title}`)} ${sentence(e.result)} ${e.reaction ? `${e.reaction.label} ${spokenPct(e.reaction.changePct, 1)}.` : ''}`.trim()),
      ),
    );
  }

  const us = okData(data.usStart);
  if (us?.futures.length) {
    const list = us.futures.filter((f) => f.changePct !== null).map((f) => `${f.name} ${spokenPct(f.changePct as number, 1)}`);
    if (list.length) out.push(...seg('US-Start', 'US-Start, die Futures vor Handelsbeginn:', `${list.join(', ')}.`));
  }

  const now = okData(data.marketNow);
  if (now) out.push(...seg('Was bewegt den Markt', 'Was bewegt den Markt gerade.', sentence(now.text)));
  return out;
}

export function eveningScript(data: EveningData | undefined, extras: Extras, c: ScriptContext, greeting: string): Segment[] {
  if (!data) return [];
  const out: Segment[] = [...intro(greeting, 'Abendbriefing', c), ...wrapSegments(extras.wrap)];

  const balance = okData(data.balance);
  if (balance) {
    out.push(
      ...seg(
        'Tagesbilanz',
        depotSentence(balance.summary, `dem Schlusskurs vom ${formatWeekday(balance.prevCloseDay, 'UTC')}`, c.hideAmounts),
        groupLine(balance.groups),
      ),
    );
  }

  const drivers = okData(data.drivers);
  if (drivers?.items.length) out.push(...seg('Treiber des Tages', 'Die Treiber des Tages.', ...drivers.items.map((t, i) => `${ORDINALS[i] ?? 'Außerdem'}: ${sentence(t)}`)));

  out.push(...newsSegment('Neu seit heute Morgen', okData(data.news)));

  const us = okData(data.us);
  if (us?.indices.length) {
    out.push(...seg('US-Markt', 'Der US-Markt:', `${us.indices.map((i) => `${i.name} ${spokenPct(i.changePct, 1)}`).join(', ')}.`));
  }

  out.push(...eventsSegment('Ausblick auf morgen', okData(data.outlook)));

  const periods = okData(data.periods);
  if (periods?.length) out.push(...seg('Zeiträume', 'Dein Depot über die Zeit:', `${periods.map((p) => `${p.label} ${spokenPct(p.pct, 1)}`).join(', ')}.`));

  const training = okData(data.trainingDone);
  if (training) out.push(...seg('Training', sentence(training.label)));
  return out;
}
