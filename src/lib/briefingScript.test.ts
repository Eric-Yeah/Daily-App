import { describe, expect, it } from 'vitest';
import type { LiveWrap } from '../data/live';
import { empty, ok, type AfternoonData, type EveningData, type MorningData } from '../data/types';
import { afternoonScript, eveningScript, morningScript, type Extras, type ScriptContext } from './briefingScript';
import { cleanForSpeech } from './speech';

const ctx: ScriptContext = { now: new Date('2026-10-12T05:30:00Z'), timeZone: 'Europe/Berlin', name: 'Beispiel', hideAmounts: false };
const none: Extras = { wrap: null, open: null, liveBlog: null };
const wrap: LiveWrap = {
  kind: 'morning',
  day: '2026-10-12',
  createdAt: new Date('2026-10-12T05:00:00Z'),
  headline: 'Ruhiger Start',
  points: [],
  sections: [{ title: 'Zinsen', text: 'Die Zinsen sinken leicht.', sources: [{ name: 'Beispiel', url: 'https://example.com' }] }],
};

const morning = (): MorningData => ({
  weather: empty(''),
  indices: ok([
    { name: 'DAX', changePct: 0.31 },
    { name: 'Nikkei', changePct: null },
  ]),
  important: ok(['Zinsentscheid der Notenbank', 'Gewinnzahlen am Abend']),
  depot: ok({
    summary: { value: 48215, changeAbs: 201, changePct: 0.42 },
    closeDay: new Date('2026-10-09T12:00:00Z'),
    history: [],
    groups: [{ name: 'Aktien', sharePct: 60, changePct: 0.5 }],
  }),
  kpis: ok({ sinceBuy: { pct: 12.3, abs: 100 }, ytd: { pct: 4.5, abs: 50 } }),
  alert: ok(null),
  news: ok([
    { id: '1', topic: 'T', positions: 1, title: 'Titel A', summary: 'Kurzfassung A', source: 'S', publishedAt: new Date(), url: 'https://example.com' },
    { id: '2', topic: 'T', positions: 1, title: 'Titel B', summary: 'Nur Überschrift', headlineOnly: true, source: 'S', publishedAt: new Date(), url: 'https://example.com' },
  ]),
  events: ok([{ time: '14:30', title: 'US-Inflation' }]),
  training: empty(''),
  day: ok([{ time: 'Frist', title: 'Abgabe', sub: 'Deutsch', tag: 'x' }]),
});

describe('morningScript', () => {
  it('is empty until the data is there', () => {
    expect(morningScript(undefined, none, ctx, 'Guten Morgen')).toEqual([]);
  });

  it('greets by name and reads the blocks in screen order', () => {
    const labels = morningScript(morning(), { ...none, wrap }, ctx, 'Guten Morgen').map((s) => s.label);
    expect(labels).toEqual(['Einstieg', 'Indizes', 'Marktüberblick', 'Marktüberblick · Zinsen', 'Heute wichtig', 'Depot', 'Meldungen zu deinen Themen', 'Markt heute', 'Dein Tag']);
    const first = morningScript(morning(), none, ctx, 'Guten Morgen')[0].text;
    expect(first).toContain('Guten Morgen, Beispiel.');
    expect(first).toContain('Montag, 12. Oktober');
  });

  it('reads index moves as words and leaves out indices without a quote', () => {
    const text = morningScript(morning(), none, ctx, 'Guten Morgen').find((s) => s.label === 'Indizes')?.text;
    expect(text).toContain('DAX plus 0,3 Prozent');
    expect(text).not.toContain('Nikkei');
  });

  it('numbers the important items and reads summaries unless only the headline exists', () => {
    const segs = morningScript(morning(), none, ctx, 'Guten Morgen');
    expect(segs.find((s) => s.label === 'Heute wichtig')?.text).toContain('Erstens: Zinsentscheid der Notenbank.');
    const news = segs.find((s) => s.label === 'Meldungen zu deinen Themen')?.text ?? '';
    expect(news).toContain('Titel A. Kurzfassung A.');
    expect(news).toContain('Titel B.');
    expect(news).not.toContain('Nur Überschrift');
  });

  it('reads euro amounts, but only percentages when amounts are hidden', () => {
    const shown = cleanForSpeech(morningScript(morning(), none, ctx, 'Guten Morgen').find((s) => s.label === 'Depot')?.text ?? '');
    expect(shown).toContain('48.215 Euro');
    expect(shown).toContain('plus 201 Euro');
    const hidden = morningScript(morning(), none, { ...ctx, hideAmounts: true }, 'Guten Morgen').find((s) => s.label === 'Depot')?.text ?? '';
    expect(hidden).not.toMatch(/€|Euro|48\.215|201/);
    expect(hidden).toContain('plus 0,42 Prozent');
  });

  it('says "unverändert" instead of reading a zero change', () => {
    const data = { ...morning(), depot: ok({ summary: { value: 100, changeAbs: 0, changePct: 0 }, closeDay: new Date('2026-10-09T12:00:00Z'), history: [], groups: [] }) };
    const text = morningScript(data, none, ctx, 'Guten Morgen').find((s) => s.label === 'Depot')?.text ?? '';
    expect(text).toContain('unverändert gegenüber dem Vortag');
    expect(text).not.toContain('0,00');
  });

  it('reads times of the day as "um …" and deadlines as they are', () => {
    const day = morningScript(morning(), none, ctx, 'Guten Morgen').find((s) => s.label === 'Dein Tag')?.text ?? '';
    expect(day).toContain('Frist: Abgabe, Deutsch.');
    const events = morningScript(morning(), none, ctx, 'Guten Morgen').find((s) => s.label === 'Markt heute')?.text ?? '';
    expect(events).toContain('Um 14:30: US-Inflation.');
  });

  it('skips blocks that are empty or failed', () => {
    const data = { ...morning(), depot: empty<never>('x'), news: empty<never>('x'), events: empty<never>('x'), day: empty<never>('x') };
    const labels = morningScript(data, none, ctx, 'Guten Morgen').map((s) => s.label);
    expect(labels).toEqual(['Einstieg', 'Indizes', 'Heute wichtig']);
  });
});

describe('afternoonScript and eveningScript', () => {
  it('afternoon reads the live blog (newest three), the depot and what moves the market', () => {
    const data: AfternoonData = {
      depot: ok({ summary: { value: 1, changeAbs: -5, changePct: -0.1 }, prevCloseDay: new Date('2026-10-09T12:00:00Z'), intraday: { prevClose: 1, points: [], sessionStart: '09:00', sessionEnd: '17:30' } }),
      indices: empty(''),
      groups: empty(''),
      morningEvents: empty(''),
      usStart: ok({ futures: [{ name: 'S&P 500', changePct: -0.4 }] }),
      marketNow: ok({ text: 'Der Markt wartet ab', url: 'https://example.com' }),
    };
    const entry = (n: number) => ({ id: n, createdAt: new Date(), headline: `Meldung ${n}`, body: `Text ${n}`, importance: 1, sources: [] });
    const segs = afternoonScript(data, { ...none, liveBlog: [1, 2, 3, 4].map(entry) }, { ...ctx, name: '' }, 'Guten Nachmittag');
    expect(segs.map((s) => s.label)).toEqual(['Einstieg', 'Live-Blog', 'Depot heute', 'US-Start', 'Was bewegt den Markt']);
    expect(segs[0].text.startsWith('Guten Nachmittag.')).toBe(true);
    const live = segs[1].text;
    expect(live).toContain('Meldung 3.');
    expect(live).not.toContain('Meldung 4');
    expect(segs[2].text).toContain('minus 0,10 Prozent');
    expect(segs[3].text).toContain('S&P 500 minus 0,4 Prozent');
  });

  it('evening starts with the market overview and ends with the training', () => {
    const data: EveningData = {
      balance: empty(''),
      drivers: ok({ items: ['Erster Treiber', 'Zweiter Treiber'], sourcesUrl: 'https://example.com' }),
      news: empty(''),
      us: empty(''),
      outlook: ok([{ time: '08:00', title: 'Arbeitsmarkt' }]),
      periods: ok([{ label: 'Woche', pct: 1.2, sub: '' }]),
      trainingDone: ok({ label: 'Training erledigt', done: true }),
    };
    const segs = eveningScript(data, { ...none, wrap: { ...wrap, kind: 'evening' } }, ctx, 'Guten Abend');
    expect(segs.map((s) => s.label)).toEqual(['Einstieg', 'Marktüberblick', 'Marktüberblick · Zinsen', 'Treiber des Tages', 'Ausblick auf morgen', 'Zeiträume', 'Training']);
    expect(segs[3].text).toContain('Zweitens: Zweiter Treiber.');
    expect(segs[5].text).toContain('Woche plus 1,2 Prozent');
  });
});
