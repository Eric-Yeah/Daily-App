import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { compareVersions, RELEASES, unseenReleases } from './releaseNotes';

describe('release notes', () => {
  it('has an entry for the version in package.json, as the newest one', () => {
    expect(RELEASES[0].version).toBe(pkg.version);
    expect(RELEASES[0].notes.length).toBeGreaterThan(0);
  });

  it('is sorted newest first without duplicates', () => {
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  const all = [
    { version: '0.3.0', date: '', title: '', notes: ['c'] },
    { version: '0.2.0', date: '', title: '', notes: ['b'] },
    { version: '0.1.0', date: '', title: '', notes: ['a'] },
  ];
  it('shows only the current release on the first start', () => {
    expect(unseenReleases(null, '0.3.0', all).map((r) => r.version)).toEqual(['0.3.0']);
  });
  it('shows everything since the last seen version, nothing when up to date', () => {
    expect(unseenReleases('0.1.0', '0.3.0', all).map((r) => r.version)).toEqual(['0.3.0', '0.2.0']);
    expect(unseenReleases('0.3.0', '0.3.0', all)).toEqual([]);
  });
  it('ignores releases newer than the running version', () => {
    expect(unseenReleases('0.1.0', '0.2.0', all).map((r) => r.version)).toEqual(['0.2.0']);
  });
});
