import { useEffect, useState } from 'preact/hooks';
import type { AlertItem, Block, DayEntry, NewsItem, Task, TaskStore, Training } from '../data/types';
import { formatAge, formatPct, formatPositions } from '../lib/format';
import { InlineState } from './Block';
import { ExternalLink } from './Market';

// News texts are always rendered as plain text (JSX escapes), never as HTML.

export function AlertCard({ alert }: { alert: AlertItem }) {
  return (
    <section class="alert" aria-labelledby="alert-title">
      <h2 class="alert__title" id="alert-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3 L22 20 H2 Z" />
          <path d="M12 10 V14" />
          <path d="M12 17 V17.1" />
        </svg>
        Auffällig · Schwelle {formatPct(alert.thresholdPct, 0)} unterschritten
      </h2>
      <div class="alert__row">
        <span class="alert__name">{alert.name}</span>
        <span class="alert__change">{formatPct(alert.changePct, 1)}</span>
      </div>
      <p class="alert__text">{alert.summary}</p>
      <ExternalLink href={alert.url}>Zum Original ↗</ExternalLink>
    </section>
  );
}

export function NewsList({ title, items, now }: { title: string; items: NewsItem[]; now: Date }) {
  return (
    <section class="section">
      <h2>{title}</h2>
      {items.length === 0 && <p class="block-state">Gerade keine neuen Meldungen zu deinen Themen.</p>}
      {items.map((n) => (
        <article key={n.id} class="news">
          <div class="news__count" aria-label={`betrifft ${formatPositions(n.positions)}`}>
            {n.positions}
          </div>
          <div class="news__body">
            <span class="news__topic">
              {n.topic} <span>· {formatPositions(n.positions)}</span>
            </span>
            <h3 class="news__title">
              {n.title}
            </h3>
            <p class="news__summary">{n.headlineOnly ? `Nur Überschrift verfügbar. ${n.summary}` : n.summary}</p>
            <span class="news__foot">
              <span class="muted">
                {n.source} · {formatAge((now.getTime() - n.publishedAt.getTime()) / 60000)}
              </span>
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                Original ↗<span class="visually-hidden"> ({n.source})</span>
              </a>
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}

export function TrainingCard({ training }: { training: Training }) {
  const t = training;
  const stateClass = { today: ' week__circle--today', planned: ' week__circle--planned', free: '' } as const;
  return (
    <section class="card">
      <div class="card-head">
        <h2>Training</h2>
        <span class="tag">aus Overload</span>
      </div>
      <div class="training-main">
        <div class="training-main__left">
          <span class="training-day">{t.dayTitle}</span>
          <span class="card-sub">
            {t.weekLabel}
            {t.plannedTime ? ` · geplant ${t.plannedTime}` : ''}
          </span>
        </div>
        <div class="training-main__right">
          <span class="training-score">
            {t.lastWeek.done} von {t.lastWeek.planned}
          </span>
          <span class="note">letzte Woche</span>
        </div>
      </div>
      <ol class="week" aria-label="Trainingswoche">
        {t.week.map((d, i) => (
          <li key={i} class="week__day">
            <span class={`week__circle${stateClass[d.state]}`} aria-current={d.state === 'today' ? 'date' : undefined}>
              {d.label}
            </span>
            <span class="week__plan">{d.plan}</span>
          </li>
        ))}
      </ol>
      <div class="stats">
        <div class="stat">
          <span class="stat__label">Streak</span>
          <span class="stat__value">{t.streakWeeks} Wo.</span>
          <span class="stat__sub">in Folge</span>
        </div>
        <div class="stat">
          <span class="stat__label">Diese Woche</span>
          <span class="stat__value">
            {t.thisWeek.done} / {t.thisWeek.planned}
          </span>
          <span class="stat__sub">Einheiten</span>
        </div>
        <div class="stat">
          <span class="stat__label">Zuletzt</span>
          <span class="stat__value">{t.last?.name ?? '—'}</span>
          <span class="stat__sub">{t.last?.day ?? ''}</span>
        </div>
      </div>
      <ExternalLink href={t.url}>In Overload öffnen ↗</ExternalLink>
    </section>
  );
}

export function DayCard({ entries }: { entries: DayEntry[] }) {
  return (
    <section class="card">
      <h2>Dein Tag</h2>
      {entries.length === 0 && <p class="block-state">Heute keine Einträge.</p>}
      {entries.map((d) => (
        <div key={d.time + d.title} class="day-row">
          <div class="day-row__time">{d.time}</div>
          <div class="day-row__body">
            <span class="day-row__title">{d.title}</span>
            <span class="day-row__sub">{d.sub}</span>
          </div>
          <span class="tag tag--small">{d.tag}</span>
        </div>
      ))}
    </section>
  );
}

export function useTasks(store: TaskStore): Block<Task[]> | undefined {
  const [block, setBlock] = useState<Block<Task[]>>();
  useEffect(() => {
    let alive = true;
    const load = () => store.list().then((b) => alive && setBlock(b));
    load();
    const unsubscribe = store.subscribe(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store]);
  return block;
}

/** "Heute erledigen": checkboxes plus "Aufgabe hinzufügen". */
export function TaskCard({ store }: { store: TaskStore }) {
  const block = useTasks(store);
  const [draft, setDraft] = useState('');
  const submit = async (e: Event) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await store.add(title);
  };
  return (
    <section class="card gap-12">
      <h2>Heute erledigen</h2>
      {block?.status === 'ok' ? (
        block.data.map((t) => (
          <label key={t.id} class="check">
            <input type="checkbox" checked={t.done} onChange={(e) => store.toggle(t.id, e.currentTarget.checked)} />
            {t.title}
          </label>
        ))
      ) : block ? (
        <InlineState block={block} />
      ) : null}
      <form class="input-row" onSubmit={submit}>
        <input
          class="input"
          type="text"
          placeholder="Aufgabe hinzufügen"
          aria-label="Aufgabe hinzufügen"
          value={draft}
          maxLength={200}
          enterKeyHint="done"
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button class="button" type="submit" disabled={block?.status !== 'ok'}>
          Neu
        </button>
      </form>
    </section>
  );
}

/** "Tag abschließen": training done, today's tasks, one line about the day. */
export function CloseDayCard({ store, training }: { store: TaskStore; training: Block<{ label: string; done: boolean }> }) {
  const block = useTasks(store);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <section class="card gap-12">
      <h2>Tag abschließen</h2>
      {training.status === 'ok' && (
        <label class="check">
          <input type="checkbox" checked={training.data.done} disabled />
          {training.data.label}
        </label>
      )}
      {block?.status === 'ok' &&
        block.data.map((t) => (
          <label key={t.id} class="check">
            <input type="checkbox" checked={t.done} onChange={(e) => store.toggle(t.id, e.currentTarget.checked)} />
            {t.done ? t.title : `${t.title}, rutscht auf morgen`}
          </label>
        ))}
      <form
        class="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          // Saved to `daily.day_notes` from M2 on.
          setSaved(note.trim().length > 0);
        }}
      >
        <input
          class="input"
          type="text"
          placeholder="Eine Zeile zum Tag"
          aria-label="Eine Zeile zum Tag"
          value={note}
          maxLength={280}
          onInput={(e) => {
            setNote(e.currentTarget.value);
            setSaved(false);
          }}
        />
        <button class="button" type="submit">
          Speichern
        </button>
      </form>
      {saved && (
        <p class="saved-note" role="status">
          Gespeichert (nur in dieser Sitzung, bis die Anmeldung da ist).
        </p>
      )}
    </section>
  );
}
