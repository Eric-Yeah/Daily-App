import { describe, expect, it } from 'vitest';
import { buildImport, decodeBytes, detectDelimiter, findHeaderRow, guessMapping, parseCsv, parseNumber } from './csv';
import { isValidIsin } from './isin';
import { computeDepot, costBasisOf, type PositionInput } from './portfolio';
import { cleanTopics, suggestGroupName, suggestTopics } from './topics';

describe('ISIN', () => {
  it('accepts valid ISINs (check digit)', () => {
    for (const isin of ['IE00B4L5Y983', 'IE00B5BMR087', 'IE00BKM4GZ66', 'IE00BMC38736', 'DE0005140008', 'US0378331005'])
      expect(isValidIsin(isin)).toBe(true);
    expect(isValidIsin(' ie00b4l5y983 ')).toBe(true);
  });
  it('rejects wrong check digits and formats', () => {
    expect(isValidIsin('IE00B4L5Y984')).toBe(false);
    expect(isValidIsin('IE00B4L5Y98')).toBe(false);
    expect(isValidIsin('1E00B4L5Y983')).toBe(false);
  });
});

describe('CSV', () => {
  it('decodes UTF-8 and Windows-1252', () => {
    expect(decodeBytes(new TextEncoder().encode('﻿Stück'))).toBe('Stück');
    expect(decodeBytes(new Uint8Array([0x53, 0x74, 0xfc, 0x63, 0x6b]))).toBe('Stück'); // "Stück" in Windows-1252
  });
  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('Name;Wert\n"A, B";1,5')).toBe(';');
  });
  it('parses quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('"a;b";"c ""d"""\r\n1;2\r\n', ';')).toEqual([
      ['a;b', 'c "d"'],
      ['1', '2'],
    ]);
  });
  it('parses German and English numbers', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('12,345')).toBe(12.345);
    expect(parseNumber('80,50 €')).toBe(80.5);
    expect(parseNumber('-3,1 %')).toBe(-3.1);
    expect(parseNumber('1,234.56', '.')).toBe(1234.56);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  it('finds the header row after a preamble and guesses the mapping', () => {
    const rows = parseCsv(
      'Depotübersicht;;;\nStand: 12.10.2026;;;\nBezeichnung;ISIN;Stück/Nominale;Einstandskurs in EUR\nBeispiel-ETF;IE00B4L5Y983;10,5;80,50\n',
      ';',
    );
    const h = findHeaderRow(rows);
    expect(h).toBe(2);
    expect(guessMapping(rows[h])).toEqual({ name: 0, isin: 1, quantity: 2, costPerUnit: 3 });
  });
  it('maps a total cost column when there is no per-unit cost', () => {
    expect(guessMapping(['Wertpapier', 'ISIN', 'Anzahl', 'Einstandswert'])).toEqual({ name: 0, isin: 1, quantity: 2, costTotal: 3 });
  });
  it('builds import items: validates, merges lots, marks duplicates', () => {
    const rows = [
      ['ETF A', 'IE00B4L5Y983', '10', '80,00'],
      ['ETF A', 'IE00B4L5Y983', '10', '100,00'],
      ['ETF B', 'IE00B5BMR087', '2', '500,00'],
      ['Kaputt', 'IE00B4L5Y984', '1', '1'],
      ['ETF C', 'IE00BKM4GZ66', '', '30'],
      ['', '', '', ''],
      ['Summe', '', '', '1.234,56'],
    ];
    const items = buildImport(rows, { name: 0, isin: 1, quantity: 2, costPerUnit: 3 }, ',', new Set(['IE00B5BMR087']));
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ isin: 'IE00B4L5Y983', quantity: 20, costPerUnit: 90, status: 'new' });
    expect(items[1]).toMatchObject({ isin: 'IE00B5BMR087', status: 'duplicate' });
    expect(items[2]).toMatchObject({ status: 'error', message: 'ISIN fehlt oder ist ungültig' });
    expect(items[3]).toMatchObject({ status: 'error', message: 'Stückzahl fehlt' });
  });
  it('derives the per-unit cost from a total', () => {
    const items = buildImport([['ETF', 'IE00B4L5Y983', '4', '1.000,00']], { name: 0, isin: 1, quantity: 2, costTotal: 3 }, ',', new Set());
    expect(items[0].costPerUnit).toBe(250);
  });
});

describe('topics', () => {
  it('suggests topics from fund names', () => {
    expect(suggestTopics('iShares Core MSCI World UCITS ETF')).toEqual(['Welt', 'USA', 'Industrieländer']);
    expect(suggestTopics('iShares Core MSCI EM IMI')).toContain('Schwellenländer');
    expect(suggestTopics('VanEck Semiconductor UCITS ETF')).toEqual(['Halbleiter', 'Technologie']);
    expect(suggestTopics('Irgendwas')).toEqual([]);
  });
  it('cleans topics', () => {
    expect(cleanTopics([' USA ', 'usa', '<b>KI</b>', ''])).toEqual(['USA', 'bKI/b']);
  });
  it('suggests a group', () => {
    expect(suggestGroupName(['Welt', 'USA'])).toBe('Welt breit');
    expect(suggestGroupName(['Halbleiter'])).toBe('Branchen und Themen');
    expect(suggestGroupName([])).toBeNull();
  });
});

describe('computeDepot', () => {
  const groups = [
    { id: 'g1', name: 'Welt breit', color: '#8DB8FF', sort: 0 },
    { id: 'g2', name: 'Halbleiter', color: '#D7A6FF', sort: 1 },
  ];
  const pos = (id: string, q: number, cost: number, last: number, prev: number, groupId: string | null, yearStart?: number): PositionInput => ({
    id,
    name: id,
    quantity: q,
    costPerUnit: cost,
    groupId,
    lossThresholdPct: null,
    price: { last, prevClose: prev, yearStart },
  });

  it('computes value, day change, since buy and YTD', () => {
    const r = computeDepot([pos('a', 10, 80, 100, 99, 'g1', 90), pos('b', 5, 200, 190, 200, 'g2', 150)], groups);
    expect(r.value).toBe(1950);
    expect(r.prevValue).toBe(1990);
    expect(r.changeAbs).toBe(-40);
    expect(r.changePct).toBeCloseTo((-40 / 1990) * 100, 10);
    expect(r.costBasis).toBe(1800);
    expect(r.sinceBuyAbs).toBe(150);
    expect(r.ytdAbs).toBe(1950 - 1650);
  });

  it('computes group shares and value-weighted group change', () => {
    const r = computeDepot([pos('a', 10, 80, 100, 99, 'g1'), pos('c', 10, 80, 50, 50, 'g1'), pos('b', 5, 200, 190, 200, 'g2')], groups);
    const welt = r.groups.find((g) => g.id === 'g1')!;
    expect(welt.value).toBe(1500);
    expect(welt.sharePct).toBeCloseTo((1500 / 2450) * 100, 10);
    expect(welt.changePct).toBeCloseTo((10 / 1490) * 100, 10);
    expect(r.groups.map((g) => g.name)).toEqual(['Welt breit', 'Halbleiter']);
  });

  it('flags positions below their threshold (default −3 %)', () => {
    const p = pos('b', 5, 200, 193, 200, 'g2'); // −3.5 %
    const q = { ...pos('a', 10, 80, 98, 100, 'g1'), lossThresholdPct: -1.5 }; // −2 % with own threshold −1.5
    const r = computeDepot([p, q, pos('c', 1, 1, 99, 100, null)], groups);
    expect(r.alerts.map((a) => a.positionId)).toEqual(['b', 'a']);
  });

  it('never estimates: positions without price are listed as missing', () => {
    const r = computeDepot([pos('a', 10, 80, 100, 100, 'g1'), { ...pos('x', 3, 10, 0, 0, null), price: null }], groups);
    expect(r.value).toBe(1000);
    expect(r.missing).toEqual(['x']);
    expect(r.groups.map((g) => g.id)).toEqual(['g1']);
  });

  it('YTD is unknown if a year-start price is missing; empty depot is zero', () => {
    expect(computeDepot([pos('a', 1, 1, 2, 2, null)], []).ytdPct).toBeNull();
    const empty = computeDepot([], []);
    expect(empty.value).toBe(0);
    expect(empty.changePct).toBe(0);
  });

  it('cost basis works without prices', () => {
    expect(costBasisOf([{ quantity: 10, costPerUnit: 80.5 }, { quantity: 2, costPerUnit: 500 }])).toBe(1805);
  });
});
