import { describe, expect, it } from 'vitest';
import { buildStudyDay } from './studyday';
import { buildTraining } from './training';

describe('buildTraining', () => {
  const today = '2026-10-14'; // Wednesday
  const rows = [
    { date: '2026-10-14', sessions: 1, minutes: 55, kinds: ['gym'] },
    { date: '2026-10-12', sessions: 1, minutes: 40, kinds: ['run'] },
    { date: '2026-10-09', sessions: 2, minutes: 90, kinds: ['gym', 'run'] }, // last week Friday
    { date: '2026-10-01', sessions: 1, minutes: 50, kinds: ['gym'] }, // two weeks ago
    { date: '2026-09-20', sessions: 1, minutes: 50, kinds: ['gym'] }, // gap week before → streak stops
  ];

  it('summarises this week, last week, streak and last training', () => {
    const t = buildTraining(rows, today);
    expect(t.dayTitle).toBe('Heute trainiert');
    expect(t.weekLabel).toBe('Gym · 55 Min.');
    expect(t.thisWeek.done).toBe(2);
    expect(t.lastWeekValue).toBe('2 Einheiten');
    expect(t.streakWeeks).toBe(3);
    expect(t.last).toEqual({ name: 'Gym', day: 'heute' });
  });

  it('marks done days and today in the week strip', () => {
    const t = buildTraining(rows, today);
    expect(t.week.map((d) => d.state)).toEqual(['today', 'free', 'today', 'free', 'free', 'free', 'free']);
    expect(t.week[0].plan).toBe('Lauf');
    const t2 = buildTraining(rows.slice(1), today);
    expect(t2.week[2].state).toBe('planned'); // today, not trained yet
    expect(t2.dayTitle).toBe('Heute noch frei');
    expect(t2.weekLabel).toBe('zuletzt Lauf · Montag');
  });

  it('handles no data', () => {
    const t = buildTraining([], today);
    expect(t.dayTitle).toBe('Noch keine Daten');
    expect(t.streakWeeks).toBe(0);
    expect(t.last).toBeNull();
  });
});

describe('buildStudyDay', () => {
  const timetable = {
    validFrom: '2026-09-01',
    periods: [
      { period: 1, start: '07:45', end: '08:30' },
      { period: 3, start: '09:35', end: '10:20' },
      { period: 6, start: '12:15', end: '13:00' },
    ],
    lessons: [
      { weekday: 2, period: 1, span: 2, start: '07:45', end: '09:15', abbr: 'M' },
      { weekday: 2, period: 6, span: 1, start: '12:15', end: '13:00', abbr: 'D' },
      { weekday: 3, period: 1, span: 1, start: '07:45', end: '08:30', abbr: 'E' },
    ],
  };
  const subs = [
    { date: '2026-10-14', periods: [3, 4], kind: 'cancelled', subject: 'PH', subjectOld: null, room: null, roomOld: null, substitute: null, note: 'Aufgaben im Kursordner' },
    { date: '2026-10-14', periods: [6], kind: 'room', subject: 'D', subjectOld: null, room: 'B204', roomOld: 'A101', substitute: null, note: null },
    { date: '2026-10-15', periods: [1], kind: 'cancelled', subject: 'E', subjectOld: null, room: null, roomOld: null, substitute: null, note: null },
  ];
  const exams = [
    { title: 'Klausur', date: '2026-10-17', subject: 'Deutsch' },
    { title: 'Mathe-Klausur', date: '2026-11-30', subject: 'Mathe' },
  ];

  it('builds school, substitutions and deadlines for today', () => {
    expect(buildStudyDay(timetable, subs, exams, '2026-10-14')).toEqual([
      { time: '07:45', title: 'Schule', sub: '3 Stunden, bis 13:00', tag: 'Schule' },
      { time: '09:35', title: 'Entfall: PH', sub: 'Aufgaben im Kursordner', tag: 'Vertretung' },
      { time: '12:15', title: 'Raumänderung: D', sub: 'Raum A101 → B204', tag: 'Vertretung' },
      { time: 'Frist', title: 'Deutsch: Klausur', sub: 'in 3 Tagen', tag: 'Study' },
    ]);
  });

  it('shows no school on weekends and tolerates missing data', () => {
    expect(buildStudyDay(timetable, subs, [], '2026-10-17')).toEqual([]);
    expect(buildStudyDay(null, null, [{ title: 'Bio-Test', date: '2026-10-15', subject: null }], '2026-10-14')).toEqual([
      { time: 'Frist', title: 'Bio-Test', sub: 'morgen', tag: 'Study' },
    ]);
  });
});
