// "Dein Tag" from the Study App: timetable and substitutions (last Lanis fetch there) and exams.
// The Study App stores the parsed timetable and the substitution list as JSON in public.lanis_snapshots.
import type { DayEntry } from '../data/types';

export interface TimetablePeriod {
  period: number;
  start: string;
  end: string;
}
export interface TimetableLesson {
  weekday: number; // 0 = Monday … 4 = Friday
  period: number;
  span: number;
  start: string;
  end: string;
  abbr: string;
}
export interface Timetable {
  validFrom: string | null;
  periods: TimetablePeriod[];
  lessons: TimetableLesson[];
}
export interface Substitution {
  date: string;
  periods: number[];
  kind: 'cancelled' | 'substitute' | 'room' | 'other';
  subject: string | null;
  subjectOld: string | null;
  room: string | null;
  roomOld: string | null;
  substitute: string | null;
  note: string | null;
}
export interface Exam {
  title: string;
  date: string;
  subject: string | null;
}

const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export function inDaysText(n: number): string {
  if (n <= 0) return 'heute';
  if (n === 1) return 'morgen';
  return `in ${n} Tagen`;
}

function isTimetable(v: unknown): v is Timetable {
  return !!v && Array.isArray((v as Timetable).lessons) && Array.isArray((v as Timetable).periods);
}

const KIND_TEXT: Record<Substitution['kind'], string> = {
  cancelled: 'Entfall',
  substitute: 'Vertretung',
  room: 'Raumänderung',
  other: 'Änderung',
};

export function buildStudyDay(timetable: unknown, substitutions: unknown, exams: Exam[], today: string): DayEntry[] {
  const out: DayEntry[] = [];

  if (isTimetable(timetable) && weekdayOf(today) <= 4 && !(timetable.validFrom && today < timetable.validFrom)) {
    const lessons = timetable.lessons.filter((l) => l.weekday === weekdayOf(today)).sort((a, b) => a.period - b.period);
    if (lessons.length) {
      const first = lessons[0];
      const last = lessons[lessons.length - 1];
      const count = lessons.reduce((n, l) => n + (l.span || 1), 0);
      out.push({ time: first.start, title: 'Schule', sub: `${count} Stunden, bis ${last.end}`, tag: 'Schule' });
    }
  }

  if (Array.isArray(substitutions)) {
    const periods = isTimetable(timetable) ? new Map(timetable.periods.map((p) => [p.period, p.start])) : new Map<number, string>();
    for (const s of substitutions as Substitution[]) {
      if (!s || s.date !== today) continue;
      const first = Math.min(...(s.periods?.length ? s.periods : [0]));
      const subject = s.subject ?? s.subjectOld ?? '';
      const detail =
        s.kind === 'room' && s.room
          ? `Raum ${s.roomOld ? `${s.roomOld} → ` : ''}${s.room}`
          : [s.substitute ? `bei ${s.substitute}` : '', s.note ?? ''].filter(Boolean).join(' · ');
      out.push({
        time: periods.get(first) ?? (first ? `${first}. Std.` : '—'),
        title: `${KIND_TEXT[s.kind] ?? 'Änderung'}${subject ? `: ${subject}` : ''}`,
        sub: detail || 'laut Vertretungsplan',
        tag: 'Vertretung',
      });
    }
  }

  for (const e of [...exams].sort((a, b) => a.date.localeCompare(b.date))) {
    const d = daysBetween(today, e.date);
    if (d < 0 || d > 14) continue;
    const title = e.subject && !e.title.toLowerCase().includes(e.subject.toLowerCase()) ? `${e.subject}: ${e.title}` : e.title;
    out.push({ time: 'Frist', title, sub: inDaysText(d), tag: 'Study' });
  }
  return out;
}
