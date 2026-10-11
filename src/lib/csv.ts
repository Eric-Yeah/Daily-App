// CSV import for broker exports (German format). Runs only in the browser; the file never leaves the device
// except for the rows you confirm.
import { isValidIsin, normalizeIsin } from './isin';

/** German broker exports are often Windows-1252, not UTF-8. */
export function decodeBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

const DELIMITERS = [';', ',', '\t'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Picks the delimiter that splits the first lines into the most consistent number of columns. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best: Delimiter = ';';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => parseCsv(l, d)[0]?.length ?? 0);
    const max = Math.max(0, ...counts);
    if (max < 2) continue;
    const score = counts.filter((c) => c === max).length * max;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC-4180-style parser: quotes, doubled quotes, line breaks inside quotes. */
export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

export type Field = 'name' | 'isin' | 'quantity' | 'costPerUnit' | 'costTotal';
export type Mapping = Partial<Record<Field, number>>;

const HEADER_PATTERNS: Record<Field, RegExp> = {
  isin: /^isin$/i,
  name: /^(bezeichnung|wertpapier(name|bezeichnung)?|name|titel|produkt)$/i,
  quantity: /^(st(ü|ue)ck(zahl)?([ /].*)?|stk\.?|anzahl|bestand|menge|nominale?|st\.?\/?nom\.?)$/i,
  costPerUnit: /(einstandskurs|kaufkurs|einstandspreis|ø|durchschn|mittlerer).*|.*(einstandskurs|kaufkurs)/i,
  costTotal: /^(einstandswert|kaufwert|investiert|einstand( gesamt)?|kaufsumme)(\s*(in)?\s*(eur|€))?$/i,
};

/** Index of the header row: the first row that contains an ISIN column and another known column. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const m = guessMapping(rows[i]);
    if (m.isin !== undefined && Object.keys(m).length >= 2) return i;
  }
  return 0;
}

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const order: Field[] = ['isin', 'quantity', 'costTotal', 'costPerUnit', 'name'];
  for (const field of order) {
    const idx = headers.findIndex((h, i) => HEADER_PATTERNS[field].test(h.trim()) && !Object.values(mapping).includes(i));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

/**
 * "1.234,56" → 1234.56 with decimal ","; "1,234.56" → 1234.56 with decimal ".".
 * Currency signs, spaces and units are ignored. Returns null if it is not a number.
 */
export function parseNumber(raw: string, decimal: ',' | '.' = ','): number | null {
  let s = raw.replace(/[\s €$%]|EUR|USD|Stk\.?/gi, '');
  if (!s) return null;
  const neg = /^[-−]/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[-−+]|[()]/g, '');
  const thousands = decimal === ',' ? '.' : ',';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

export interface ImportItem {
  row: number; // 1-based line in the file (for messages)
  name: string;
  isin: string;
  quantity: number;
  costPerUnit: number;
  status: 'new' | 'duplicate' | 'error';
  message?: string;
}

/**
 * Turns the data rows into import items: validates ISIN and numbers, merges repeated ISINs
 * (several lots: quantities add up, cost becomes the weighted average) and marks positions
 * that already exist.
 */
export function buildImport(
  rows: string[][],
  mapping: Mapping,
  decimal: ',' | '.',
  existingIsins: ReadonlySet<string>,
  firstRowNumber = 2,
): ImportItem[] {
  const out: ImportItem[] = [];
  const byIsin = new Map<string, ImportItem>();
  rows.forEach((r, i) => {
    const get = (f: Field) => (mapping[f] !== undefined ? (r[mapping[f]!] ?? '') : '');
    const isin = normalizeIsin(get('isin'));
    const name = get('name') || isin;
    const quantity = parseNumber(get('quantity'), decimal);
    const total = mapping.costTotal !== undefined ? parseNumber(get('costTotal'), decimal) : null;
    let cost = mapping.costPerUnit !== undefined ? parseNumber(get('costPerUnit'), decimal) : null;
    if (cost === null && total !== null && quantity) cost = total / quantity;
    const base = { row: firstRowNumber + i, name, isin, quantity: quantity ?? 0, costPerUnit: cost ?? 0 };

    let message: string | undefined;
    // Lines without ISIN and without quantity are headings or totals ("Summe"), not positions.
    if (!isin && !get('quantity')) return;
    if (!isValidIsin(isin)) message = 'ISIN fehlt oder ist ungültig';
    else if (quantity === null || quantity < 0) message = 'Stückzahl fehlt';
    else if (cost === null || cost < 0) message = 'Einstandskurs fehlt';
    if (message) {
      out.push({ ...base, status: 'error', message });
      return;
    }

    const prev = byIsin.get(isin);
    if (prev) {
      const qty = prev.quantity + base.quantity;
      prev.costPerUnit = qty > 0 ? (prev.quantity * prev.costPerUnit + base.quantity * base.costPerUnit) / qty : 0;
      prev.quantity = qty;
      prev.message = 'mehrere Zeilen zusammengefasst';
      return;
    }
    const item: ImportItem = { ...base, status: existingIsins.has(isin) ? 'duplicate' : 'new' };
    byIsin.set(isin, item);
    out.push(item);
  });
  return out;
}
