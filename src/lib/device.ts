// Which kind of device runs the app: only used to word hints correctly (Face ID on the iPhone,
// Touch ID on the Mac). Nothing here changes behaviour or is sent anywhere.
export type Platform = 'ios' | 'mac' | 'other';

interface PlatformInput {
  userAgent: string;
  maxTouchPoints: number;
}

/** iPadOS 13+ reports itself as a Mac; a Mac has no touch screen, so touch points tell them apart. */
export function platformOf({ userAgent, maxTouchPoints }: PlatformInput): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh|Mac OS X/.test(userAgent)) return maxTouchPoints > 1 ? 'ios' : 'mac';
  return 'other';
}

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return platformOf({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });
}

/** Name of the biometric unlock on this device. */
export function biometricName(p: Platform = platform()): string {
  return p === 'mac' ? 'Touch ID' : p === 'ios' ? 'Face ID' : 'Face ID oder Touch ID';
}

/** Where to allow or re-allow notifications for Daily on this device. */
export function notificationSettingsHint(p: Platform = platform()): string {
  if (p === 'mac') return 'Mac: Systemeinstellungen → Mitteilungen → Safari bzw. Daily → Mitteilungen erlauben.';
  if (p === 'ios') return 'iPhone: Einstellungen → Mitteilungen → Daily → Mitteilungen erlauben.';
  return 'Erlaube Mitteilungen für diese Seite in den Browser-Einstellungen.';
}
