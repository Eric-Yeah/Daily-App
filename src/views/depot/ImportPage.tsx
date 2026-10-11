import { useMemo, useState } from 'preact/hooks';
import { SkeletonCard, StateCard } from '../../components/Block';
import { Header } from '../../components/Header';
import { useDepot, type Group, type ImportResult } from '../../data/depot';
import { buildImport, decodeBytes, detectDelimiter, findHeaderRow, guessMapping, parseCsv, type Field, type Mapping } from '../../lib/csv';
import { formatEuro, formatQuantity } from '../../lib/format';
import { suggestGroupName, suggestTopics } from '../../lib/topics';

const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'isin', label: 'ISIN', required: true },
  { key: 'quantity', label: 'Stückzahl', required: true },
  { key: 'costPerUnit', label: 'Einstandskurs je Stück' },
  { key: 'costTotal', label: 'oder: Einstandswert gesamt' },
];

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
  firstRowNumber: number;
}

export function ImportPage() {
  const { block, store } = useDepot();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [decimal, setDecimal] = useState<',' | '.'>(',');
  const [duplicates, setDuplicates] = useState<'update' | 'skip'>('update');
  const [groupMode, setGroupMode] = useState<string>('auto');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const existing = useMemo(
    () => new Set(block?.status === 'ok' ? block.data.positions.map((p) => p.isin) : []),
    [block],
  );
  const items = useMemo(
    () => (parsed ? buildImport(parsed.rows, mapping, decimal, existing, parsed.firstRowNumber) : []),
    [parsed, mapping, decimal, existing],
  );

  if (!block) return <SkeletonCard height={300} />;
  if (block.status !== 'ok') return <StateCard title="CSV-Import" message={block.message} error />;
  const groups = block.data.groups;

  const readFile = async (file: File | undefined) => {
    setError('');
    setResult(null);
    if (!file) return;
    if (file.size > 2_000_000) return setError('Die Datei ist zu groß (höchstens 2 MB).');
    const text = decodeBytes(new Uint8Array(await file.arrayBuffer()));
    const all = parseCsv(text, detectDelimiter(text));
    if (all.length < 2) return setError('In der Datei stehen keine Zeilen. Ist es eine CSV-Datei?');
    const h = findHeaderRow(all);
    const m = guessMapping(all[h]);
    setParsed({ fileName: file.name, headers: all[h], rows: all.slice(h + 1), firstRowNumber: h + 2 });
    setMapping(m);
    // German exports use a decimal comma; switch to point only if the numbers clearly use it.
    const sample = all.slice(h + 1, h + 30).flatMap((r) => [m.quantity, m.costPerUnit, m.costTotal].map((i) => (i === undefined ? '' : r[i] ?? '')));
    setDecimal(sample.some((v) => /\d,\d/.test(v)) || !sample.some((v) => /\d\.\d{1,2}$/.test(v)) ? ',' : '.');
  };

  const assign = (name: string): { groupId: string | null; topics: string[] } => {
    const topics = suggestTopics(name);
    if (groupMode === 'auto') {
      const g = suggestGroupName(topics);
      return { groupId: groups.find((x: Group) => x.name === g)?.id ?? null, topics };
    }
    return { groupId: groupMode || null, topics };
  };

  const counts = {
    fresh: items.filter((i) => i.status === 'new').length,
    dupes: items.filter((i) => i.status === 'duplicate').length,
    errors: items.filter((i) => i.status === 'error').length,
  };
  const toImport = counts.fresh + (duplicates === 'update' ? counts.dupes : 0);
  const mappingOk = mapping.isin !== undefined && mapping.quantity !== undefined && (mapping.costPerUnit !== undefined || mapping.costTotal !== undefined);

  const run = async () => {
    setBusy(true);
    const r = await store.importItems(items, duplicates, (i) => assign(i.name));
    setBusy(false);
    if (typeof r === 'string') setError(r);
    else {
      setResult(r);
      setParsed(null);
    }
  };

  return (
    <main class="page">
      <Header dateLine="Depot" title="CSV-Import" />

      {result && (
        <section class="card gap-12" role="status">
          <h2>Import fertig</h2>
          <p class="card-sub card-sub--loose">
            {result.created} neu angelegt, {result.updated} aktualisiert, {result.skipped} übersprungen.
          </p>
          <a class="button button--wide" href="#/depot">
            Zum Depot
          </a>
        </section>
      )}

      {!parsed && !result && (
        <section class="card gap-12">
          <h2>Datei wählen</h2>
          <p class="card-sub card-sub--loose">
            Exportiere dein Depot bei deinem Broker als CSV (Depotübersicht oder Bestand). Die Datei wird nur hier auf dem Gerät gelesen.
            Gespeichert werden nur Name, ISIN, Stückzahl und Einstandskurs der Zeilen, die du bestätigst.
          </p>
          <label class="button button--wide file-button">
            CSV-Datei auswählen
            <input class="visually-hidden" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => readFile(e.currentTarget.files?.[0])} />
          </label>
        </section>
      )}

      {parsed && (
        <>
          <section class="card gap-12">
            <h2>Spalten zuordnen</h2>
            <p class="card-sub">
              {parsed.fileName} · {parsed.rows.length} Zeilen. Prüfe, welche Spalte was enthält.
            </p>
            {FIELDS.map((f) => (
              <label key={f.key} class="setting">
                <span>
                  {f.label}
                  {f.required && <span class="setting__hint">Pflicht</span>}
                </span>
                <select
                  class="input"
                  value={mapping[f.key] === undefined ? '' : String(mapping[f.key])}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    const next = { ...mapping };
                    if (v === '') delete next[f.key];
                    else next[f.key] = Number(v);
                    setMapping(next);
                  }}
                >
                  <option value="">—</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={String(i)}>
                      {h || `Spalte ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label class="setting">
              <span>Dezimaltrennzeichen</span>
              <select class="input" value={decimal} onChange={(e) => setDecimal(e.currentTarget.value as ',' | '.')}>
                <option value=",">Komma (1.234,56)</option>
                <option value=".">Punkt (1,234.56)</option>
              </select>
            </label>
          </section>

          <section class="card gap-12">
            <h2>Optionen</h2>
            <label class="setting">
              <span>
                Schon vorhandene ISIN
                <span class="setting__hint">Gruppe und Themen bleiben beim Aktualisieren erhalten.</span>
              </span>
              <select class="input" value={duplicates} onChange={(e) => setDuplicates(e.currentTarget.value as 'update' | 'skip')}>
                <option value="update">aktualisieren</option>
                <option value="skip">überspringen</option>
              </select>
            </label>
            <label class="setting">
              <span>
                Gruppe für neue Positionen
                <span class="setting__hint">„Automatisch“ ordnet nach dem Namen zu, wenn es die Gruppe gibt.</span>
              </span>
              <select class="input" value={groupMode} onChange={(e) => setGroupMode(e.currentTarget.value)}>
                <option value="auto">automatisch</option>
                <option value="">ohne Gruppe</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section class="card gap-8">
            <h2>Vorschau</h2>
            <p class="card-sub">
              {counts.fresh} neu · {counts.dupes} schon vorhanden · {counts.errors} mit Fehler
            </p>
            {!mappingOk && <p class="form-error">Bitte mindestens ISIN, Stückzahl und einen Einstandswert zuordnen.</p>}
            <ul class="plain-list preview-list">
              {items.slice(0, 200).map((i) => (
                <li key={`${i.row}-${i.isin}`} class="preview-row">
                  <span class={`status status--${i.status}`}>{i.status === 'new' ? 'Neu' : i.status === 'duplicate' ? 'Schon da' : 'Fehler'}</span>
                  <span class="preview-row__main">
                    <span class="position-row__name">{i.name}</span>
                    <span class="position-row__sub mono">
                      {i.status === 'error'
                        ? `Zeile ${i.row}: ${i.message}`
                        : `${i.isin} · ${formatQuantity(i.quantity)} Stk. · Ø ${formatEuro(i.costPerUnit, { decimals: 2 })}${i.message ? ` · ${i.message}` : ''}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {error && (
            <p class="form-error" role="alert">
              {error}
            </p>
          )}
          <div class="actions actions--2">
            <button class="button button--secondary" type="button" onClick={() => setParsed(null)}>
              Andere Datei
            </button>
            <button class="button" type="button" disabled={!mappingOk || toImport === 0 || busy} onClick={run}>
              {busy ? 'Importiere …' : `${toImport} übernehmen`}
            </button>
          </div>
        </>
      )}

      {!parsed && error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      {!parsed && !result && (
        <a class="button button--secondary button--wide" href="#/depot">
          Zurück zum Depot
        </a>
      )}
    </main>
  );
}
