import { describe, expect, it } from 'vitest';
import { empty, failed, ok, type Block } from '../data/types';
import { keepLastGood } from './lastgood';

type D = { a: Block<number>; b: Block<string> };
const t1 = new Date('2026-10-12T08:00:00Z');

describe('keepLastGood', () => {
  it('passes data through without a previous load', () => {
    const next: D = { a: ok(1), b: failed('x') };
    expect(keepLastGood(undefined, next)).toBe(next);
  });

  it('replaces a failed block by the last good one, with its time', () => {
    const r = keepLastGood<D>({ data: { a: ok(1), b: ok('alt') }, at: t1 }, { a: ok(2), b: failed('offline') });
    expect(r.a).toEqual(ok(2));
    expect(r.b).toEqual({ status: 'ok', data: 'alt', asOf: t1.toISOString(), stale: true });
  });

  it('keeps the original time when a stale block fails again', () => {
    const t2 = new Date('2026-10-12T09:00:00Z');
    const first = keepLastGood<D>({ data: { a: ok(1), b: ok('alt') }, at: t1 }, { a: ok(2), b: failed('x') });
    const second = keepLastGood<D>({ data: first, at: t2 }, { a: ok(3), b: failed('x') });
    expect(second.b).toMatchObject({ status: 'ok', data: 'alt', asOf: t1.toISOString(), stale: true });
  });

  it('does not replace empty blocks or blocks that were not good before', () => {
    const r = keepLastGood<D>({ data: { a: ok(1), b: failed('x') }, at: t1 }, { a: empty('leer'), b: failed('y') });
    expect(r.a.status).toBe('empty');
    expect(r.b.status).toBe('error');
  });
});
