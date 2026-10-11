import { describe, expect, it } from 'vitest';
import { fromBase64Url, shouldLock, toBase64Url } from './lock';

describe('shouldLock', () => {
  const min = 60_000;
  it('locks after the timeout in the background', () => {
    expect(shouldLock(0, 5 * min, 5)).toBe(true);
    expect(shouldLock(0, 5 * min - 1, 5)).toBe(false);
  });
  it('locks on every return with timeout 0', () => {
    expect(shouldLock(1000, 1000, 0)).toBe(true);
  });
  it('does nothing if the app was never hidden', () => {
    expect(shouldLock(null, 10 * min, 5)).toBe(false);
  });
});

describe('base64url', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
  });
});
