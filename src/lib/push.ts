// Web Push in the app: subscribe this device, store the subscription in daily.push_subscriptions.
// On the iPhone this only works in the app added to the Home Screen (iOS 16.4 or newer).
import { fromBase64Url } from './lock';
import { daily, supabase } from './supabase';

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone(): boolean {
  return (
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

async function vapidKey(): Promise<string> {
  const { data, error } = await supabase().functions.invoke('daily-briefing', { body: { op: 'key' } });
  if (error || !data?.publicKey) throw new Error('key');
  return data.publicKey as string;
}

export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return 'Dieses Gerät oder dieser Browser kann keine Benachrichtigungen.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Benachrichtigungen wurden nicht erlaubt. Du kannst das in den Einstellungen des iPhones ändern.';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(await vapidKey()) }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await daily()
      .from('push_subscriptions')
      .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint', ignoreDuplicates: true });
    return error ? 'Gerät konnte nicht gespeichert werden.' : null;
  } catch {
    return 'Einschalten gerade nicht möglich. Versuch es gleich nochmal.';
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await daily().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<string> {
  const { data, error } = await supabase().functions.invoke('daily-briefing', { body: { op: 'test' } });
  if (error) return 'Test gerade nicht möglich.';
  return (data?.sent ?? 0) > 0 ? 'Test gesendet. Er sollte gleich erscheinen.' : 'Kein Gerät erreicht. Schalte die Benachrichtigungen neu ein.';
}

/** AI costs this month (USD), from daily.ai_usage. */
export async function aiSpentThisMonth(): Promise<number | null> {
  const first = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(new Date()) + '-01';
  const { data, error } = await daily().from('ai_usage').select('cost_usd').gte('day', first);
  if (error) return null;
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}
