// Shapes the views render. Every block can independently be ok, empty or failed,
// so one missing source never blanks the whole page.

export type Block<T> =
  | { status: 'ok'; data: T; asOf?: string }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

export const ok = <T>(data: T, asOf?: string): Block<T> => ({ status: 'ok', data, asOf });
export const empty = <T>(message: string): Block<T> => ({ status: 'empty', message });
export const failed = <T>(message: string): Block<T> => ({ status: 'error', message });

export interface IndexQuote {
  name: string;
  changePct: number | null; // null = no quote; shown as "—"
}

export interface GroupMove {
  name: string;
  sharePct: number;
  changePct: number;
}

export interface DepotSummary {
  value: number;
  changeAbs: number;
  changePct: number;
}

export interface SeriesPoint {
  minute: number; // minutes since midnight in the display zone
  value: number;
}

export interface IntradaySeries {
  prevClose: number;
  points: SeriesPoint[];
  sessionStart: string; // "09:00"
  sessionEnd: string; // "17:30"
}

export interface NewsItem {
  id: string;
  topic: string;
  positions: number;
  title: string;
  summary: string;
  headlineOnly?: boolean;
  source: string;
  publishedAt: Date;
  url: string;
}

export interface AlertItem {
  name: string;
  changePct: number;
  thresholdPct: number;
  summary: string;
  url: string;
}

export interface MarketEvent {
  time: string; // "14:30"
  title: string;
}

export type WeekDayState = 'today' | 'planned' | 'free';

export interface Training {
  dayTitle: string;
  weekLabel: string;
  plannedTime?: string;
  lastWeek: { done: number; planned: number };
  week: { label: string; plan: string; state: WeekDayState }[];
  streakWeeks: number;
  thisWeek: { done: number; planned: number };
  last: { name: string; day: string } | null;
  url: string;
}

export interface DayEntry {
  time: string; // "07:45" or "Frist"
  title: string;
  sub: string;
  tag: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
}

export interface Kpi {
  label: string;
  pct: number;
  sub: string;
}

export interface MorningEventResult {
  time: string;
  title: string;
  result: string;
  reaction: { label: string; changePct: number } | null;
}

export interface UsIndexCurve {
  name: string;
  changePct: number;
  prevClose: number;
  points: SeriesPoint[];
}

export interface MorningData {
  weather: Block<{ tempC: number; text: string }>;
  indices: Block<IndexQuote[]>;
  important: Block<string[]>;
  depot: Block<{ summary: DepotSummary; closeDay: Date; history: number[]; groups: GroupMove[] }>;
  kpis: Block<{ sinceBuy: { pct: number; abs: number }; ytd: { pct: number; abs: number } }>;
  alert: Block<AlertItem | null>;
  news: Block<NewsItem[]>;
  events: Block<MarketEvent[]>;
  training: Block<Training>;
  day: Block<DayEntry[]>;
}

export interface AfternoonData {
  depot: Block<{ summary: DepotSummary; prevCloseDay: Date; intraday: IntradaySeries }>;
  indices: Block<IndexQuote[]>;
  groups: Block<GroupMove[]>;
  morningEvents: Block<MorningEventResult[]>;
  usStart: Block<{ futures: IndexQuote[] }>;
  marketNow: Block<{ text: string; url: string }>;
}

export interface EveningData {
  balance: Block<{ summary: DepotSummary; prevCloseDay: Date; intraday: IntradaySeries; groups: GroupMove[] }>;
  drivers: Block<{ items: string[]; sourcesUrl: string }>;
  news: Block<NewsItem[]>;
  us: Block<{ indices: UsIndexCurve[]; sessionStart: string; sessionEnd: string }>;
  outlook: Block<MarketEvent[]>;
  periods: Block<Kpi[]>;
  trainingDone: Block<{ label: string; done: boolean }>;
}

export interface DataSource {
  kind: 'mock' | 'none' | 'live';
  morning(now: Date): Promise<MorningData>;
  afternoon(now: Date): Promise<AfternoonData>;
  evening(now: Date): Promise<EveningData>;
  tasks: TaskStore;
  notes: DayNoteStore;
}

export interface DayNoteStore {
  get(day: string): Promise<Block<string>>;
  set(day: string, note: string): Promise<boolean>;
}

export interface TaskStore {
  list(): Promise<Block<Task[]>>;
  add(title: string): Promise<void>;
  toggle(id: string, done: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
}
