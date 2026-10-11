import { useState } from 'preact/hooks';
import { StateCard, SkeletonCard } from '../../components/Block';
import { Header } from '../../components/Header';
import { useDepot, type Group, type Position } from '../../data/depot';
import { formatEuro, formatQuantity } from '../../lib/format';
import { costBasisOf } from '../../lib/portfolio';
import { useSettings } from '../../lib/settings';
import { DEFAULT_GROUPS } from '../../lib/topics';

export function DepotHome() {
  const { block, store } = useDepot();
  const { hideAmounts } = useSettings();
  const [showArchived, setShowArchived] = useState(false);

  if (!block) {
    return (
      <main class="page">
        <Header dateLine="Positionen und Gruppen" title="Depot" />
        <SkeletonCard height={200} />
      </main>
    );
  }
  if (block.status !== 'ok') {
    return (
      <main class="page">
        <Header dateLine="Positionen und Gruppen" title="Depot" />
        <StateCard title="Depot" message={block.message} error={block.status === 'error'} />
      </main>
    );
  }

  const { groups, positions } = block.data;
  const active = positions.filter((p) => !p.archived);
  const archived = positions.filter((p) => p.archived);
  const total = costBasisOf(active);
  const dateLine = active.length
    ? `${active.length} ${active.length === 1 ? 'Position' : 'Positionen'} · Einstand ${formatEuro(total, { hidden: hideAmounts })}`
    : 'Positionen und Gruppen';

  const sections: { group: Group | null; items: Position[] }[] = [
    ...groups.map((g) => ({ group: g, items: active.filter((p) => p.groupId === g.id) })),
    { group: null, items: active.filter((p) => !p.groupId || !groups.some((g) => g.id === p.groupId)) },
  ].filter((s) => s.items.length > 0);

  const addDefaultGroups = async () => {
    for (const [i, g] of DEFAULT_GROUPS.entries()) {
      if (!groups.some((x) => x.name === g.name)) await store.saveGroup({ ...g, sort: groups.length + i });
    }
  };

  return (
    <main class="page">
      <Header dateLine={dateLine} title="Depot" />

      <nav class="actions" aria-label="Depot-Aktionen">
        <a class="button" href="#/depot/neu">
          + Position
        </a>
        <a class="button button--secondary" href="#/depot/import">
          CSV-Import
        </a>
        <a class="button button--secondary" href="#/depot/gruppen">
          Gruppen
        </a>
      </nav>

      {active.length === 0 ? (
        <section class="card gap-12">
          <h2>Noch keine Positionen</h2>
          <p class="card-sub card-sub--loose">
            Am schnellsten geht es mit der CSV-Datei deines Brokers: Depot exportieren, hier importieren, Spalten prüfen.
            Die Datei wird nur auf deinem Gerät gelesen. Gespeichert werden nur Name, ISIN, Stückzahl und Einstandskurs.
          </p>
          <a class="button button--wide" href="#/depot/import">
            CSV importieren
          </a>
          <a class="button button--wide button--secondary" href="#/depot/neu">
            Position von Hand anlegen
          </a>
          {groups.length === 0 && (
            <button class="link-button" type="button" onClick={addDefaultGroups}>
              Standard-Gruppen anlegen (Welt breit, USA, Europa …)
            </button>
          )}
        </section>
      ) : (
        <>
          <p class="note">Kurse und Tagesänderungen siehst du im Tab „Heute“. Die Kursabfrage läuft zu Handelszeiten alle 30 Minuten.</p>
          {sections.map((s) => (
            <PositionSection key={s.group?.id ?? 'none'} group={s.group} items={s.items} hidden={hideAmounts} />
          ))}
        </>
      )}

      {archived.length > 0 && (
        <>
          <button class="link-button" type="button" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Archivierte ausblenden' : `Archivierte anzeigen (${archived.length})`}
          </button>
          {showArchived && <PositionSection group={{ id: 'archiv', name: 'Archiviert', color: '#A9B8C9', sort: 0 }} items={archived} hidden={hideAmounts} />}
        </>
      )}
    </main>
  );
}

function PositionSection({ group, items, hidden }: { group: Group | null; items: Position[]; hidden: boolean }) {
  return (
    <section class="card gap-8" aria-label={group?.name ?? 'Ohne Gruppe'}>
      <div class="card-head">
        <h2 class="group-title">
          <span class="dot" style={{ background: group?.color ?? '#A9B8C9' }} aria-hidden="true" />
          {group?.name ?? 'Ohne Gruppe'}
        </h2>
        <span class="note mono">{formatEuro(costBasisOf(items), { hidden })}</span>
      </div>
      <ul class="plain-list position-list">
        {items.map((p) => (
          <li key={p.id}>
            <a class="position-row" href={`#/depot/p/${p.id}`}>
              <span class="position-row__main">
                <span class="position-row__name">{p.name}</span>
                <span class="position-row__sub">
                  <span class="mono">{p.isin}</span> · <span class="nowrap">{formatQuantity(p.quantity)} Stk.</span> ·{' '}
                  <span class="nowrap">Ø {formatEuro(p.costPerUnit, { decimals: 2, hidden })}</span>
                </span>
              </span>
              <span class="position-row__value mono">{formatEuro(p.quantity * p.costPerUnit, { hidden })}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
