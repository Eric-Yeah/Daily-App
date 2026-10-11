import { describe, expect, it } from 'vitest';
import { biometricName, notificationSettingsHint, platformOf } from './device';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

describe('platformOf', () => {
  it('recognises iPhone, Mac and others', () => {
    expect(platformOf({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe('ios');
    expect(platformOf({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe('mac');
    expect(platformOf({ userAgent: WINDOWS, maxTouchPoints: 0 })).toBe('other');
  });

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    expect(platformOf({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe('ios');
  });
});

describe('wording', () => {
  it('names the right biometric unlock', () => {
    expect(biometricName('ios')).toBe('Face ID');
    expect(biometricName('mac')).toBe('Touch ID');
    expect(biometricName('other')).toBe('Face ID oder Touch ID');
  });

  it('points to the right notification settings', () => {
    expect(notificationSettingsHint('mac')).toContain('Systemeinstellungen');
    expect(notificationSettingsHint('ios')).toContain('iPhone');
  });
});
