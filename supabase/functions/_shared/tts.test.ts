import { describe, expect, it, vi } from 'vitest';
import { CORS } from './http.ts';
import { GOOGLE_TTS_URL, googleBody, googleReason, MAX_CHARS_PER_CALL, monthStart, MONTHLY_CHAR_CAP, parseSpeechRequest, speechHandler, voiceFamily, type SpeechDeps } from './tts.ts';

describe('parseSpeechRequest', () => {
  it('accepts a normal request and tidies the text', () => {
    expect(parseSpeechRequest({ text: '  Hallo   Welt. ', voice: 'de-DE-Neural2-F', rate: 1.1 })).toEqual({ text: 'Hallo Welt.', voice: 'de-DE-Neural2-F', rate: 1.1 });
  });
  it('rejects empty, too long and unknown voices', () => {
    expect(parseSpeechRequest({ text: ' ', voice: 'de-DE-Neural2-F' })).toBeNull();
    expect(parseSpeechRequest({ text: 'a'.repeat(MAX_CHARS_PER_CALL + 1), voice: 'de-DE-Neural2-F' })).toBeNull();
    expect(parseSpeechRequest({ text: 'Hallo', voice: 'de-DE-Studio-B' })).toBeNull();
    expect(parseSpeechRequest(null)).toBeNull();
  });
  it('clamps the rate and defaults to 1', () => {
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B', rate: 9 })?.rate).toBe(2);
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B', rate: 0 })?.rate).toBe(0.5);
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B' })?.rate).toBe(1);
  });
});

describe('googleBody', () => {
  it('asks for German MP3', () => {
    expect(googleBody({ text: 'Hi', voice: 'de-DE-Chirp3-HD-Aoede', rate: 1 })).toEqual({
      input: { text: 'Hi' },
      voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Aoede' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1 },
    });
  });
  it('names the usage family', () => {
    expect(voiceFamily('de-DE-Chirp3-HD-Charon')).toBe('chirp3-hd');
    expect(voiceFamily('de-DE-Neural2-F')).toBe('neural2');
  });
});

describe('monthStart', () => {
  it('is the first of the month in Berlin', () => {
    expect(monthStart(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-01');
    // 31 Oct 23:30 UTC is already 1 November in Berlin
    expect(monthStart(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });
});

describe('googleReason', () => {
  it('names the HTTP status and Google\'s error code, nothing else', () => {
    expect(googleReason(403, JSON.stringify({ error: { code: 403, message: 'API key not valid. Beispiel', status: 'PERMISSION_DENIED' } }))).toBe('google 403 PERMISSION_DENIED');
    expect(googleReason(500, 'oops')).toBe('google 500');
  });
});

// ---------- the Edge Function handler, with a faked Google API and database ----------

const MP3_BASE64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAAfwAAMGAA'; // start of a real MP3 (example)

function setup(over: Partial<SpeechDeps> & { google?: () => Response | Promise<Response> } = {}) {
  const usage: [number, string][] = [];
  const googleCalls: { url: string; init: RequestInit }[] = [];
  const deps: SpeechDeps = {
    owner: async (req) => (req.headers.get('authorization') === 'Bearer owner-token' ? 'owner-id' : null),
    apiKey: () => 'example-key',
    charsThisMonth: async () => 0,
    addUsage: async (chars, family) => void usage.push([chars, family]),
    fetch: (async (url: string, init: RequestInit) => {
      googleCalls.push({ url, init });
      return over.google ? over.google() : new Response(JSON.stringify({ audioContent: MP3_BASE64 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch,
    ...over,
  };
  return { handler: speechHandler(deps), usage, googleCalls };
}

const post = (body: unknown, token = 'owner-token') =>
  new Request('https://example-project.supabase.co/functions/v1/daily-speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, apikey: 'example-anon', 'x-client-info': 'supabase-js-web/2', 'content-type': 'application/json', origin: 'https://eric-yeah.github.io' },
    body: JSON.stringify(body),
  });
const good = { text: 'Guten Morgen. Hier ist dein Morgenbriefing.', voice: 'de-DE-Neural2-F', rate: 1 };

describe('speechHandler (daily-speech)', () => {
  it('answers the CORS preflight for the headers supabase-js sends', async () => {
    const { handler } = setup();
    const res = await handler(new Request('https://example-project.supabase.co/functions/v1/daily-speech', { method: 'OPTIONS', headers: { origin: 'https://eric-yeah.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,apikey,content-type,x-client-info' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://eric-yeah.github.io');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    const allowed = (res.headers.get('Access-Control-Allow-Headers') ?? '').split(',').map((h) => h.trim());
    for (const h of ['authorization', 'apikey', 'content-type', 'x-client-info']) expect(allowed).toContain(h);
  });

  it('returns the MP3 as base64 in { status, audio } and books the characters', async () => {
    const { handler, usage, googleCalls } = setup();
    const res = await handler(post(good));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CORS['Access-Control-Allow-Origin']);
    expect(await res.json()).toEqual({ status: 'ok', audio: MP3_BASE64 });
    expect(usage).toEqual([[good.text.length, 'neural2']]);
    expect(googleCalls).toHaveLength(1);
    expect(googleCalls[0].url).toBe(GOOGLE_TTS_URL);
    expect((googleCalls[0].init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('example-key');
    expect(JSON.parse(String(googleCalls[0].init.body))).toEqual(googleBody({ text: good.text, voice: 'de-DE-Neural2-F', rate: 1 }));
  });

  it('refuses everyone but the owner, without calling Google', async () => {
    const { handler, googleCalls } = setup();
    const res = await handler(post(good, 'someone-else'));
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CORS['Access-Control-Allow-Origin']);
    expect(googleCalls).toHaveLength(0);
  });

  it('rejects a bad request body and other methods', async () => {
    const { handler } = setup();
    expect((await handler(post({ text: '', voice: 'de-DE-Neural2-F' }))).status).toBe(400);
    expect((await handler(post({ text: 'Hallo', voice: 'en-US-Wavenet-A' }))).status).toBe(400);
    expect((await handler(new Request('https://example-project.supabase.co/functions/v1/daily-speech', { method: 'GET' }))).status).toBe(405);
  });

  it('says no_key without the secret and budget at the monthly cap', async () => {
    expect(await (await setup({ apiKey: () => undefined }).handler(post(good))).json()).toEqual({ status: 'no_key' });
    const capped = setup({ charsThisMonth: async () => MONTHLY_CHAR_CAP - 5 });
    expect(await (await capped.handler(post(good))).json()).toEqual({ status: 'budget' });
    expect(capped.googleCalls).toHaveLength(0);
  });

  it('reports a failing Google call with its reason and books nothing', async () => {
    const denied = setup({ google: () => new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Beispiel' } }), { status: 403 }) });
    expect(await (await denied.handler(post(good))).json()).toEqual({ status: 'error', reason: 'google 403 PERMISSION_DENIED' });
    expect(denied.usage).toEqual([]);
    const empty = setup({ google: () => new Response('{}', { status: 200 }) });
    expect(await (await empty.handler(post(good))).json()).toEqual({ status: 'error', reason: 'google ohne Audio' });
    const offline = setup({ google: () => Promise.reject(new TypeError('network')) });
    expect(await (await offline.handler(post(good))).json()).toEqual({ status: 'error', reason: 'google nicht erreichbar' });
  });

  it('still answers with CORS headers when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = setup({ charsThisMonth: () => Promise.reject(new Error('db down')) });
    const res = await handler(post(good));
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CORS['Access-Control-Allow-Origin']);
    expect(await res.json()).toEqual({ status: 'error', reason: 'server' });
    spy.mockRestore();
  });

  it('keeps the audio when booking the usage fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = setup({ addUsage: () => Promise.reject(new Error('rpc')) });
    expect(await (await handler(post(good))).json()).toEqual({ status: 'ok', audio: MP3_BASE64 });
    spy.mockRestore();
  });
});
