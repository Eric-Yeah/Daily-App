import { describe, expect, it } from 'vitest';
import { visibleTasks, type TaskRow } from './personal';

const row = (id: string, day: string, done: boolean, created = '2026-10-01T08:00:00Z'): TaskRow => ({
  id,
  title: id,
  day,
  done,
  created_at: created,
});

describe('visibleTasks', () => {
  const today = '2026-10-12';
  it('shows today and rolls over open tasks from earlier days', () => {
    const rows = [
      row('heute-offen', today, false),
      row('heute-fertig', today, true),
      row('gestern-offen', '2026-10-11', false),
      row('gestern-fertig', '2026-10-11', true),
      row('morgen', '2026-10-13', false),
    ];
    expect(visibleTasks(rows, today).map((t) => t.id).sort()).toEqual(['gestern-offen', 'heute-fertig', 'heute-offen']);
  });
  it('lists open tasks first, then by creation time', () => {
    const rows = [
      row('b', today, true, '2026-10-12T07:00:00Z'),
      row('c', today, false, '2026-10-12T09:00:00Z'),
      row('a', today, false, '2026-10-12T08:00:00Z'),
    ];
    expect(visibleTasks(rows, today).map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });
});
