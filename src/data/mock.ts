// MOCK DATA, clearly marked in the UI ("Beispieldaten"). Numbers mirror the approved mockups
// and are invented. The real Supabase source replaces this from M2/M4 on.
import {
  DEFAULT_TIME_ZONE,
  isTradingDay,
  lastClosedTradingDay,
  minutesOfDay,
  parseHHMM,
  previousTradingDay,
  zonedParts,
} from '../lib/time';
import { getSettings } from '../lib/settings';
import {
  ok,
  type AfternoonData,
  type DataSource,
  type DayNoteStore,
  type EveningData,
  type GroupMove,
  type IntradaySeries,
  type MorningData,
  type NewsItem,
  type SeriesPoint,
  type Task,
  type TaskStore,
  type Training,
  type UsIndexCurve,
} from './types';

const EXAMPLE_URL = 'https://example.com/';
const PREV_CLOSE = 48215;

// Shape of the depot curve over the Xetra session, as € deltas to the previous close
// (taken from the evening mockup's path).
const DEPOT_DELTAS = [-18.6, 18.6, -9.3, 55.8, 27.9, 102.3, 74.4, 130.2, 102.3, 148.8, 120.9, 167.4, 139.5, 186];

function sessionPoints(
  deltas: number[],
  start: string,
  end: string,
  nowMinute: number,
  toValue: (d: number) => number,
): SeriesPoint[] {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const step = (e - s) / (deltas.length - 1);
  return deltas
    .map((d, i) => ({ minute: Math.round(s + i * step), value: toValue(d) }))
    .filter((p) => p.minute <= nowMinute);
}

function depotIntraday(now: Date): IntradaySeries {
  const { timeZone, tradingEnd } = getSettings();
  const p = zonedParts(now, timeZone);
  const weekend = p.weekday > 5;
  const nowMinute = weekend ? 24 * 60 : minutesOfDay(p);
  return {
    prevClose: PREV_CLOSE,
    points: sessionPoints(DEPOT_DELTAS, '09:00', tradingEnd, nowMinute, (d) => PREV_CLOSE + d),
    sessionStart: '09:00',
    sessionEnd: tradingEnd,
  };
}

/** Close the shown session is compared with: on weekends the session is Friday, so Thursday. */
function referenceClose(now: Date): Date {
  const { tradingEnd } = getSettings();
  const today = zonedParts(now, DEFAULT_TIME_ZONE);
  return previousTradingDay(isTradingDay(today) ? now : lastClosedTradingDay(now, { tradingEnd }));
}

function summaryFrom(intraday: IntradaySeries) {
  const last = intraday.points.at(-1)?.value ?? intraday.prevClose;
  const changeAbs = last - intraday.prevClose;
  return { value: last, changeAbs, changePct: (changeAbs / intraday.prevClose) * 100 };
}

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60000);

const MORNING_GROUPS: GroupMove[] = [
  { name: 'Welt breit', sharePct: 38, changePct: 0.3 },
  { name: 'USA', sharePct: 27, changePct: 0.6 },
  { name: 'Europa', sharePct: 14, changePct: 0.1 },
  { name: 'Schwellenländer', sharePct: 12, changePct: -0.4 },
  { name: 'Halbleiter', sharePct: 5, changePct: -3.1 },
  { name: 'Sonstige Themen', sharePct: 4, changePct: -0.6 },
];

const EVENING_GROUPS: GroupMove[] = [
  { name: 'Welt breit', sharePct: 38, changePct: 0.4 },
  { name: 'USA', sharePct: 27, changePct: 0.7 },
  { name: 'Europa', sharePct: 14, changePct: 0.2 },
  { name: 'Schwellenländer', sharePct: 12, changePct: -0.3 },
  { name: 'Halbleiter', sharePct: 5, changePct: -2.4 },
  { name: 'Sonstige Themen', sharePct: 4, changePct: -0.2 },
];

function training(now: Date): Training {
  const today = zonedParts(now, getSettings().timeZone).weekday; // 1…7
  const plans = ['Pull', '', 'Push', '', 'Legs', 'Lauf', ''];
  const labels = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return {
    dayTitle: 'Pull-Tag',
    weekLabel: 'Woche 3',
    plannedTime: '16:30',
    lastWeek: { done: 4, planned: 4 },
    week: labels.map((label, i) => ({
      label,
      plan: plans[i],
      state: i + 1 === today ? 'today' : plans[i] ? 'planned' : 'free',
    })),
    streakWeeks: 3,
    thisWeek: { done: 0, planned: 4 },
    last: { name: 'Legs', day: 'Freitag' },
    url: EXAMPLE_URL,
  };
}

function news(now: Date, items: [string, number, string, number][]): NewsItem[] {
  return items.map(([topic, positions, title, ageMin], i) => ({
    id: `mock-${i}`,
    topic,
    positions,
    title,
    summary: 'Beispieltext: KI-Kurzfassung in 1 bis 2 Sätzen.',
    source: 'Quelle',
    publishedAt: minutesAgo(now, ageMin),
    url: EXAMPLE_URL,
  }));
}

function usCurves(now: Date): { indices: UsIndexCurve[]; sessionStart: string; sessionEnd: string } {
  const p = zonedParts(now, getSettings().timeZone);
  const nowMinute = p.weekday > 5 ? 24 * 60 : minutesOfDay(p);
  const curve = (name: string, pcts: number[]): UsIndexCurve => {
    const points = sessionPoints(pcts, '15:30', '22:00', nowMinute, (pct) => 100 * (1 + pct / 100));
    const last = points.at(-1)?.value ?? 100;
    return { name, prevClose: 100, points, changePct: last - 100 };
  };
  return {
    sessionStart: '15:30',
    sessionEnd: '22:00',
    indices: [
      curve('S&P 500', [-0.08, 0.08, 0, 0.25, 0.17, 0.42, 0.33, 0.5, 0.42, 0.55, 0.48, 0.6, 0.56, 0.62]),
      curve('Nasdaq 100', [-0.08, 0.17, 0.04, 0.38, 0.25, 0.58, 0.46, 0.8, 0.7, 0.86, 0.78, 0.95, 0.9, 1.0]),
    ],
  };
}

function createMockTasks(): TaskStore {
  let tasks: Task[] = [
    { id: 't1', title: 'Aufgabe eins', done: false },
    { id: 't2', title: 'Aufgabe zwei', done: true },
    { id: 't3', title: 'Aufgabe drei', done: false },
  ];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    async list() {
      return ok(tasks);
    },
    async add(title) {
      tasks = [...tasks, { id: `t${Date.now()}`, title, done: false }];
      emit();
    },
    async toggle(id, done) {
      tasks = tasks.map((t) => (t.id === id ? { ...t, done } : t));
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createMockNotes(): DayNoteStore {
  const notes = new Map<string, string>();
  return {
    async get(day) {
      return ok(notes.get(day) ?? '');
    },
    async set(day, note) {
      notes.set(day, note);
      return true;
    },
  };
}

export function createMockSource(): DataSource {
  return {
    kind: 'mock',
    tasks: createMockTasks(),
    notes: createMockNotes(),

    async morning(now): Promise<MorningData> {
      const { tradingEnd } = getSettings();
      return {
        weather: ok({ tempC: 14, text: 'bewölkt' }),
        indices: ok([
          { name: 'DAX', changePct: 0.2 },
          { name: 'S&P 500', changePct: 0.5 },
          { name: 'MSCI World', changePct: 0.3 },
          { name: 'Nasdaq 100', changePct: 0.7 },
          { name: 'MSCI EM', changePct: -0.4 },
        ]),
        important: ok([
          'Halbleiter-ETF liegt unter deiner Schwelle (−3,1 %)',
          'US-Inflationsdaten um 14:30 Uhr',
          'Deutsch-Klausur in 3 Tagen',
        ]),
        depot: ok({
          summary: { value: 48215, changeAbs: 201, changePct: 0.42 },
          closeDay: lastClosedTradingDay(now, { tradingEnd }),
          history: [47380, 47520, 47440, 47760, 47680, 47950, 47870, 48140, 48060],
          groups: MORNING_GROUPS,
        }),
        kpis: ok({ sinceBuy: { pct: 12.8, abs: 5480 }, ytd: { pct: 9.1, abs: 4020 } }),
        alert: ok({
          name: 'Halbleiter-ETF',
          changePct: -3.1,
          thresholdPct: -3,
          summary:
            'Beispieltext: Kurzfassung der Meldung, die die Bewegung am ehesten erklärt, in 1 bis 2 Sätzen in der Sprache der Quelle.',
          url: EXAMPLE_URL,
        }),
        news: ok(
          news(now, [
            ['USA · Zinsen', 5, 'Beispiel: Anleger warten auf US-Inflationsdaten', 120],
            ['Halbleiter', 2, 'Beispiel: Chipwerte unter Druck', 240],
            ['Schwellenländer', 1, 'Beispiel: Währungen geben nach', 360],
          ]),
        ),
        events: ok([
          { time: '09:00', title: 'Einkaufsmanagerindex Eurozone' },
          { time: '14:30', title: 'US-Inflationsdaten' },
          { time: '16:00', title: 'Rede eines Notenbankers' },
          { time: '20:00', title: 'Quartalszahlen eines Top-Holdings' },
        ]),
        training: ok(training(now)),
        day: ok([
          { time: '07:45', title: 'Schule', sub: 'Stundenplan aus Lanis', tag: 'Schule' },
          { time: '13:30', title: 'Lernen: Deutsch', sub: '90 Minuten Fokus-Timer', tag: 'Study' },
          { time: 'Frist', title: 'Deutsch-Klausur', sub: 'in 3 Tagen', tag: 'Study' },
        ]),
      };
    },

    async afternoon(now): Promise<AfternoonData> {
      const intraday = depotIntraday(now);
      return {
        depot: ok({
          summary: summaryFrom(intraday),
          prevCloseDay: referenceClose(now),
          intraday,
        }),
        indices: ok([
          { name: 'DAX', changePct: 0.1 },
          { name: 'Euro Stoxx 50', changePct: 0.2 },
          { name: 'MSCI World', changePct: 0.3 },
          { name: 'S&P-500-Future', changePct: 0.2 },
          { name: 'MSCI EM', changePct: -0.4 },
        ]),
        groups: ok([
          { name: 'Welt breit', sharePct: 38, changePct: 0.3 },
          { name: 'USA', sharePct: 27, changePct: 0.4 },
          { name: 'Europa', sharePct: 14, changePct: 0.1 },
          { name: 'Schwellenländer', sharePct: 12, changePct: -0.4 },
          { name: 'Halbleiter', sharePct: 5, changePct: -2.6 },
          { name: 'Sonstige Themen', sharePct: 4, changePct: -0.3 },
        ]),
        morningEvents: ok([
          {
            time: '14:30',
            title: 'US-Inflationsdaten',
            result: 'Beispieltext: Ergebnis in einem Satz und wie der Markt seitdem reagiert hat.',
            reaction: { label: 'DAX seit 14:30', changePct: -0.3 },
          },
        ]),
        usStart: ok({
          futures: [
            { name: 'S&P 500', changePct: 0.2 },
            { name: 'Nasdaq 100', changePct: 0.3 },
          ],
        }),
        marketNow: ok({
          text: 'Beispieltext: Ein bis zwei Sätze der KI-Zusammenfassung zur aktuellen Lage, in der Sprache der Quelle.',
          url: EXAMPLE_URL,
        }),
      };
    },

    async evening(now): Promise<EveningData> {
      const intraday = depotIntraday(now);
      return {
        balance: ok({
          summary: summaryFrom(intraday),
          prevCloseDay: referenceClose(now),
          intraday,
          groups: EVENING_GROUPS,
        }),
        drivers: ok({
          items: [
            'Beispieltext: Haupttreiber des Tages in einem Satz',
            'Beispieltext: Reaktion auf die Inflationsdaten',
            'Beispieltext: Warum die Halbleiter nachgaben',
          ],
          sourcesUrl: EXAMPLE_URL,
        }),
        news: ok(
          news(now, [
            ['Halbleiter', 2, 'Beispiel: Chipwerte nach Zahlen unter Druck', 60],
            ['USA · Zinsen', 5, 'Beispiel: Notenbanker äußert sich zur Zinspolitik', 120],
          ]),
        ),
        us: ok(usCurves(now)),
        outlook: ok([
          { time: '08:00', title: 'Deutsche Konjunkturdaten' },
          { time: '10:30', title: 'Einkaufsmanagerindex Großbritannien' },
          { time: '20:00', title: 'Quartalszahlen eines Top-Holdings' },
        ]),
        periods: ok([
          { label: 'Woche', pct: 0.4, sub: 'seit Montag' },
          { label: 'Monat', pct: 1.9, sub: new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: DEFAULT_TIME_ZONE }).format(now) },
          { label: 'Jahr', pct: 9.5, sub: 'seit Januar' },
        ]),
        trainingDone: ok({ label: 'Pull-Training erledigt', done: true }),
      };
    },
  };
}
