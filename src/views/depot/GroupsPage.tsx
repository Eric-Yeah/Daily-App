import { useState } from 'preact/hooks';
import { SkeletonCard, StateCard } from '../../components/Block';
import { Header } from '../../components/Header';
import { useDepot, type DepotStore, type Group } from '../../data/depot';
import { DEFAULT_GROUPS } from '../../lib/topics';

const COLORS = ['#8DB8FF', '#6FDCAA', '#B5D2FF', '#FFC983', '#D7A6FF', '#FF9C93', '#7FE3D4', '#C5D1DE'];

export function GroupsPage() {
  const { block, store } = useDepot();
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');

  if (!block) return <SkeletonCard height={300} />;
  if (block.status !== 'ok') return <StateCard title="Gruppen" message={block.message} error />;
  const { groups, positions } = block.data;

  const report = (err: string | null) => setMessage(err ?? '');

  const add = async (e: Event) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const err = await store.saveGroup({ name, color: COLORS[groups.length % COLORS.length], sort: groups.length });
    report(err);
    if (!err) setDraft('');
  };

  const addDefaults = async () => {
    for (const [i, g] of DEFAULT_GROUPS.entries()) {
      if (!groups.some((x) => x.name === g.name)) report(await store.saveGroup({ ...g, sort: groups.length + i }));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const order = [...groups];
    const [g] = order.splice(index, 1);
    order.splice(index + dir, 0, g);
    for (const [i, x] of order.entries()) if (x.sort !== i) await store.saveGroup({ ...x, sort: i });
  };

  return (
    <main class="page">
      <Header dateLine="Depot" title="Gruppen" />
      <p class="card-sub card-sub--loose">
        Gruppen bündeln deine Positionen, zum Beispiel nach Region. Die Morgenansicht zeigt pro Gruppe Anteil und Tagesänderung.
      </p>

      {groups.length === 0 && (
        <section class="card gap-12">
          <h2>Noch keine Gruppen</h2>
          <button class="button button--wide" type="button" onClick={addDefaults}>
            Standard-Gruppen anlegen
          </button>
          <p class="note">Welt breit, USA, Europa, Schwellenländer, Branchen und Themen. Du kannst sie danach umbenennen oder löschen.</p>
        </section>
      )}

      {groups.length > 0 && (
        <section class="card gap-12">
          <ul class="plain-list group-list">
            {groups.map((g, i) => (
              <GroupRow
                key={g.id}
                group={g}
                count={positions.filter((p) => p.groupId === g.id).length}
                first={i === 0}
                last={i === groups.length - 1}
                store={store}
                onMove={(dir) => move(i, dir)}
                report={report}
              />
            ))}
          </ul>
        </section>
      )}

      <form class="card gap-12" onSubmit={add}>
        <h2>Neue Gruppe</h2>
        <div class="input-row">
          <input class="input" value={draft} maxLength={40} placeholder="z. B. Halbleiter" aria-label="Name der neuen Gruppe" onInput={(e) => setDraft(e.currentTarget.value)} />
          <button class="button" type="submit" disabled={!draft.trim()}>
            Anlegen
          </button>
        </div>
      </form>

      {message && (
        <p class="form-error" role="alert">
          {message}
        </p>
      )}
      <a class="button button--secondary button--wide" href="#/depot">
        Fertig
      </a>
    </main>
  );
}

function GroupRow({
  group,
  count,
  first,
  last,
  store,
  onMove,
  report,
}: {
  group: Group;
  count: number;
  first: boolean;
  last: boolean;
  store: DepotStore;
  onMove: (dir: -1 | 1) => void;
  report: (err: string | null) => void;
}) {
  const [name, setName] = useState(group.name);
  const rename = async () => {
    const n = name.trim();
    if (!n || n === group.name) return setName(group.name);
    report(await store.saveGroup({ ...group, name: n }));
  };
  const remove = async () => {
    const text = count ? `„${group.name}“ löschen? ${count} Position(en) stehen danach ohne Gruppe da.` : `„${group.name}“ löschen?`;
    if (confirm(text)) report(await store.deleteGroup(group.id));
  };
  return (
    <li class="group-edit">
      <div class="input-row">
        <input class="input" value={name} maxLength={40} aria-label="Name der Gruppe" onInput={(e) => setName(e.currentTarget.value)} onBlur={rename} />
        <button class="icon-button" type="button" aria-label={`${group.name} nach oben`} disabled={first} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button class="icon-button" type="button" aria-label={`${group.name} nach unten`} disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
      </div>
      <div class="swatches" role="radiogroup" aria-label={`Farbe für ${group.name}`}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            class="swatch"
            role="radio"
            aria-checked={group.color.toUpperCase() === c}
            aria-label={`Farbe ${c}`}
            style={{ background: c }}
            onClick={async () => report(await store.saveGroup({ ...group, color: c }))}
          />
        ))}
      </div>
      <div class="group-edit__foot">
        <span class="note">{count === 1 ? '1 Position' : `${count} Positionen`}</span>
        <button class="link-button link-button--danger" type="button" onClick={remove}>
          Löschen
        </button>
      </div>
    </li>
  );
}
