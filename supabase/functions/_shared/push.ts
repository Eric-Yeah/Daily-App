// Web Push without libraries (same approach as the Study App): RFC 8291 payload encryption (aes128gcm)
// and RFC 8292 VAPID. The key pair is created on first use and stored in daily.push_keys (service_role only).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

const SUBJECT = 'https://eric-yeah.github.io/Daily-App/';
// Only the big push services are ever contacted.
const HOSTS =
  /^https:\/\/([a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};
const cat = (...a: Uint8Array[]) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encryptPayload(text: string, p256dh: string, auth: string) {
  const ua = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const data = cat(enc.encode(text), new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data));
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, 4096);
  return cat(salt, head, new Uint8Array([asPub.length]), asPub, ct);
}

async function vapidAuth(endpoint: string, priv: JsonWebKey, pub: string) {
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

/** Public VAPID key; creates the key pair on first use. */
export async function vapidKeys(db: SupabaseClient): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const { data } = await db.from('push_keys').select('public_key, private_jwk').eq('id', 1).maybeSingle();
  if (data) return { publicKey: data.public_key as string, privateJwk: data.private_jwk as JsonWebKey };
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKey = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  await db.from('push_keys').insert({ id: 1, public_key: publicKey, private_jwk: privateJwk });
  // Read back: if two calls raced, both use the stored pair.
  const { data: stored } = await db.from('push_keys').select('public_key, private_jwk').eq('id', 1).single();
  return { publicKey: stored!.public_key as string, privateJwk: stored!.private_jwk as JsonWebKey };
}

export interface PushMessage {
  title: string;
  body: string; // never numbers: the lock screen is public
  url: string;
  tag?: string;
}

/** Sends to all subscriptions (optionally of one user). Removes subscriptions the service no longer knows. */
export async function sendPush(db: SupabaseClient, msg: PushMessage, userId?: string): Promise<{ sent: number; removed: number }> {
  const { publicKey, privateJwk } = await vapidKeys(db);
  let q = db.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (userId) q = q.eq('user_id', userId);
  const { data: subs } = await q;
  let sent = 0;
  let removed = 0;
  for (const s of subs ?? []) {
    if (!HOSTS.test(s.endpoint)) continue;
    try {
      const body = await encryptPayload(JSON.stringify(msg), s.p256dh, s.auth);
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuth(s.endpoint, privateJwk, publicKey),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '3600',
          Urgency: 'normal',
        },
        body,
      });
      if (res.status === 404 || res.status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        removed++;
      } else if (res.ok) sent++;
      else console.error('push failed', res.status);
    } catch (e) {
      console.error('push error', e instanceof Error ? e.message : e);
    }
  }
  return { sent, removed };
}
