import { useEffect, useState } from 'preact/hooks';
import { SkeletonCard, StateCard } from '../../components/Block';
import { Header } from '../../components/Header';
import { useDepot, type Group, type Position, type PositionDraft } from '../../data/depot';
import { formatInputNumber, parseInputNumber } from '../../lib/format';
import { isValidIsin, isValidWkn, normalizeIsin, normalizeWkn, securityId } from '../../lib/isin';
import { useSettings } from '../../lib/settings';
import { cleanTopics, suggestGroupName, suggestTopics } from '../../lib/topics';
import { aiTopicsAvailable, suggestTopicsAi } from '../../lib/topicsAi';
import { go } from '../../router';

export function PositionFormPage({ id }: { id?: string }) {
  const { block, store } = useDepot();
  if (!block) return <SkeletonCard height={400} />;
  if (block.status !== 'ok') return <StateCard title="Position" message={block.message} error />;
  const existing = id ? block.data.positions.find((p) => p.id === id) : undefined;
  if (id && !existing) return <StateCard title="Position" message="Diese Position gibt es nicht (mehr)." />;
  return <PositionForm key={id ?? 'new'} existing={existing} groups={block.data.groups} save={store.savePosition} remove={store.deletePosition} />;
}

interface Errors {
  name?: string;
  isin?: string;
  wkn?: string;
  symbol?: string;
  quantity?: string;
  cost?: string;
  threshold?: string;
  savings?: string;
  savingsDay?: string;
  form?: string;
}

function PositionForm({
  existing,
  groups,
  save,
  remove,
}: {
  existing?: Position;
  groups: Group[];
  save: (p: PositionDraft) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}) {
  const { lossThresholdPct } = useSettings();
  const [name, setName] = useState(existing?.name ?? '');
  const [isin, setIsin] = useState(existing?.isin ?? '');
  const [wkn, setWkn] = useState(existing?.wkn ?? '');
  const [symbol, setSymbol] = useState(existing?.providerSymbol ?? '');
  const [quantity, setQuantity] = useState(formatInputNumber(existing?.quantity));
  const [cost, setCost] = useState(formatInputNumber(existing?.costPerUnit));
  const [savings, setSavings] = useState(formatInputNumber(existing?.savingsAmount));
  const [savingsDay, setSavingsDay] = useState(existing?.savingsDay ? String(existing.savingsDay) : '');
  const [groupId, setGroupId] = useState<string>(existing?.groupId ?? '');
  const [threshold, setThreshold] = useState(formatInputNumber(existing?.lossThresholdPct));
  const [topics, setTopics] = useState<string[]>(existing?.topics ?? []);
  const [topicDraft, setTopicDraft] = useState('');
  const [archived, setArchived] = useState(existing?.archived ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const [aiTopics, setAiTopics] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  // The AI (Claude Haiku) suggests topics from the name once typing pauses. Positions that already have topics and an
  // unchanged name are left alone. Without login (demo) or when the AI is unavailable, only the rule-based ones show.
  useEffect(() => {
    const n = name.trim();
    if (n.length < 4 || !aiTopicsAvailable() || (existing && existing.topics.length > 0 && n === existing.name)) {
      setAiTopics([]);
      return;
    }
    let alive = true;
    setAiBusy(true);
    const timer = setTimeout(() => {
      suggestTopicsAi([n]).then(([list]) => {
        if (!alive) return;
        setAiTopics(list);
        setAiBusy(false);
      });
    }, 800);
    return () => {
      alive = false;
      clearTimeout(timer);
      setAiBusy(false);
    };
  }, [name]);

  const taken = new Set(topics.map((t) => t.toLowerCase()));
  const suggestions = cleanTopics([...suggestTopics(name), ...aiTopics]).filter((t) => !taken.has(t.toLowerCase()));
  const groupHint = !existing && !groupId ? suggestGroupName([...topics, ...suggestTopics(name), ...aiTopics]) : null;
  const hintGroup = groupHint ? groups.find((g) => g.name === groupHint) : undefined;

  const addTopic = (t: string) => {
    setTopics(cleanTopics([...topics, t]));
    setTopicDraft('');
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const q = parseInputNumber(quantity);
    const c = parseInputNumber(cost);
    const sp = savings.trim() ? parseInputNumber(savings) : null;
    const spDay = savingsDay.trim() ? Number(savingsDay.trim()) : null;
    const th = threshold.trim() ? parseInputNumber(threshold) : null;
    const next: Errors = {};
    if (!name.trim()) next.name = 'Bitte einen Namen eingeben.';
    if (!isin.trim() && !wkn.trim()) next.isin = 'Bitte eine ISIN oder eine WKN eingeben.';
    else {
      if (isin.trim() && !isValidIsin(isin)) next.isin = 'Diese ISIN ist ungültig (12 Zeichen, Prüfziffer stimmt nicht).';
      if (wkn.trim() && !isValidWkn(wkn)) next.wkn = 'Diese WKN ist ungültig (6 Zeichen, Ziffern und Buchstaben).';
    }
    const isinValue = isin.trim() ? normalizeIsin(isin) : null;
    const wknValue = wkn.trim() ? normalizeWkn(wkn) : null;
    const sym = symbol.trim();
    if (sym && !/^[A-Za-z0-9.^=-]{1,40}$/.test(sym)) next.symbol = 'Nur Buchstaben, Ziffern und . ^ = - erlaubt.';
    if (q === null || q < 0) next.quantity = 'Bitte eine Stückzahl eingeben, z. B. 12,5.';
    if (c === null || c < 0) next.cost = 'Bitte den Einstandskurs je Stück eingeben, z. B. 80,50.';
    if (savings.trim() && (sp === null || sp <= 0 || sp > 1_000_000)) next.savings = 'Bitte einen Betrag pro Monat eingeben, z. B. 50.';
    else if (savingsDay.trim() && !savings.trim()) next.savingsDay = 'Der Tag gehört zu einem Sparplan: trag oben den Betrag ein.';
    else if (spDay !== null && (!Number.isInteger(spDay) || spDay < 1 || spDay > 28)) next.savingsDay = 'Ein Tag zwischen 1 und 28.';
    if (threshold.trim() && (th === null || th > 0 || th < -50)) next.threshold = 'Eine Zahl zwischen −50 und 0, z. B. −5.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const err = await save({
      id: existing?.id,
      name: name.trim().slice(0, 120),
      isin: isinValue,
      wkn: wknValue,
      quantity: q!,
      costPerUnit: c!,
      currency: existing?.currency ?? 'EUR',
      groupId: groupId || null,
      lossThresholdPct: th,
      topics: cleanTopics(topics),
      manualPrice: existing?.manualPrice ?? null,
      savingsAmount: sp,
      savingsDay: sp === null ? null : spDay,
      // a changed ISIN with an untouched symbol means the old symbol no longer fits: it is found again automatically
      providerSymbol: sym && !(existing && isinValue !== existing.isin && sym === existing.providerSymbol) ? sym : null,
      archived,
    });
    setBusy(false);
    if (err) setErrors({ form: err });
    else go('depot');
  };

  const del = async () => {
    if (!existing || !confirm(`„${existing.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    const err = await remove(existing.id);
    if (err) setErrors({ form: err });
    else go('depot');
  };

  return (
    <form class="page" onSubmit={submit} noValidate>
      <Header dateLine={existing ? securityId(existing) : 'Neue Position'} title={existing ? 'Position bearbeiten' : 'Position anlegen'} />

      <section class="card gap-12">
        <Field label="Name" error={errors.name}>
          <input class="input" value={name} maxLength={120} onInput={(e) => setName(e.currentTarget.value)} placeholder="z. B. iShares Core MSCI World" />
        </Field>
        <Field label="ISIN" error={errors.isin}>
          <input
            class="input mono"
            value={isin}
            maxLength={14}
            autocapitalize="characters"
            spellcheck={false}
            onInput={(e) => setIsin(e.currentTarget.value.toUpperCase())}
            onBlur={() => isin && !isValidIsin(isin) && setErrors({ ...errors, isin: 'Diese ISIN ist ungültig.' })}
            placeholder="IE00B4L5Y983"
          />
        </Field>
        <Field label="WKN (optional, wenn die ISIN fehlt)" error={errors.wkn}>
          <input
            class="input mono"
            value={wkn}
            maxLength={8}
            autocapitalize="characters"
            spellcheck={false}
            onInput={(e) => setWkn(e.currentTarget.value.toUpperCase())}
            onBlur={() => wkn && !isValidWkn(wkn) && setErrors({ ...errors, wkn: 'Diese WKN ist ungültig.' })}
            placeholder="A0RPWH"
          />
        </Field>
        <Field label="Kurssymbol (leer = automatisch per ISIN oder WKN)" error={errors.symbol}>
          <input
            class="input mono"
            value={symbol}
            maxLength={40}
            autocapitalize="characters"
            spellcheck={false}
            onInput={(e) => setSymbol(e.currentTarget.value.toUpperCase())}
            placeholder={isin.trim() || !wkn.trim() ? 'wird automatisch gefunden' : 'z. B. EUNL.DE'}
          />
        </Field>
        {!isin.trim() && wkn.trim() && !symbol.trim() && (
          <p class="note">Das Kurssymbol wird aus der WKN gesucht. Findet Daily keins, trag es hier selbst ein oder ergänze die ISIN.</p>
        )}
        <div class="field-row">
          <Field label="Stückzahl" error={errors.quantity}>
            <input class="input mono" inputMode="decimal" value={quantity} onInput={(e) => setQuantity(e.currentTarget.value)} placeholder="12,5" />
          </Field>
          <Field label="Einstand je Stück (€)" error={errors.cost}>
            <input class="input mono" inputMode="decimal" value={cost} onInput={(e) => setCost(e.currentTarget.value)} placeholder="80,50" />
          </Field>
        </div>
      </section>

      <section class="card gap-12">
        <h2>Sparplan</h2>
        <p class="card-sub">Investierst du jeden Monat einen festen Betrag? Das ist nur eine Notiz für deine Übersicht, gebucht wird nichts automatisch.</p>
        <div class="field-row">
          <Field label="Betrag pro Monat (€)" error={errors.savings}>
            <input class="input mono" inputMode="decimal" value={savings} onInput={(e) => setSavings(e.currentTarget.value)} placeholder="leer = kein Sparplan" />
          </Field>
          <Field label="Ausführung am (optional)" error={errors.savingsDay}>
            <input class="input mono" inputMode="numeric" value={savingsDay} maxLength={2} onInput={(e) => setSavingsDay(e.currentTarget.value)} placeholder="1–28" />
          </Field>
        </div>
      </section>

      <section class="card gap-12">
        <Field label="Gruppe">
          <select class="input" value={groupId} onChange={(e) => setGroupId(e.currentTarget.value)}>
            <option value="">Ohne Gruppe</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {hintGroup && (
          <button class="chip chip--suggest" type="button" onClick={() => setGroupId(hintGroup.id)}>
            Vorschlag: {hintGroup.name}
          </button>
        )}
        {groups.length === 0 && (
          <p class="note">
            Noch keine Gruppen. <a href="#/depot/gruppen">Gruppen anlegen</a>
          </p>
        )}
        <Field label={`Eigene Verlustschwelle in % (leer = Standard ${formatInputNumber(lossThresholdPct)} %)`} error={errors.threshold}>
          <input class="input mono" inputMode="decimal" value={threshold} onInput={(e) => setThreshold(e.currentTarget.value)} placeholder={formatInputNumber(lossThresholdPct)} />
        </Field>
      </section>

      <section class="card gap-12">
        <h2>Themen</h2>
        <p class="card-sub">Für die Suche nach passenden Meldungen. Index, Region, Branche oder große Einzelwerte.</p>
        {topics.length > 0 && (
          <ul class="chips plain-list">
            {topics.map((t) => (
              <li key={t}>
                <button class="chip" type="button" aria-label={`Thema ${t} entfernen`} onClick={() => setTopics(topics.filter((x) => x !== t))}>
                  {t} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && (
          <ul class="chips plain-list" aria-label="Vorschläge">
            {suggestions.map((t) => (
              <li key={t}>
                <button class="chip chip--suggest" type="button" onClick={() => addTopic(t)}>
                  + {t}
                </button>
              </li>
            ))}
            {suggestions.length > 1 && (
              <li>
                <button class="chip chip--suggest" type="button" onClick={() => setTopics(cleanTopics([...topics, ...suggestions]))}>
                  Alle übernehmen
                </button>
              </li>
            )}
          </ul>
        )}
        {aiBusy && (
          <p class="note" role="status">
            Die KI sucht passende Themen zum Namen …
          </p>
        )}
        {!aiBusy && aiTopics.length > 0 && <p class="note">Vorschläge aus dem Namen und von der KI (nur der Name wird gesendet). Tippen übernimmt sie.</p>}
        <div class="input-row">
          <input
            class="input"
            value={topicDraft}
            maxLength={30}
            placeholder="Thema hinzufügen"
            aria-label="Thema hinzufügen"
            onInput={(e) => setTopicDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (topicDraft.trim()) addTopic(topicDraft);
              }
            }}
          />
          <button class="button button--secondary" type="button" disabled={!topicDraft.trim()} onClick={() => addTopic(topicDraft)}>
            Hinzufügen
          </button>
        </div>
      </section>

      {existing && (
        <section class="card gap-8">
          <label class="setting">
            <span>
              Archiviert
              <span class="setting__hint">Verkauft oder ruht: bleibt gespeichert, zählt aber nicht mehr mit.</span>
            </span>
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.currentTarget.checked)} />
          </label>
        </section>
      )}

      {errors.form && (
        <p class="form-error" role="alert">
          {errors.form}
        </p>
      )}
      <div class="actions actions--2">
        <a class="button button--secondary" href="#/depot">
          Abbrechen
        </a>
        <button class="button" type="submit" disabled={busy}>
          {busy ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
      {existing && (
        <button class="link-button link-button--danger" type="button" onClick={del}>
          Position löschen
        </button>
      )}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: preact.ComponentChildren }) {
  return (
    <label class="field">
      <span class="field__label">{label}</span>
      {children}
      {error && <span class="form-error">{error}</span>}
    </label>
  );
}
