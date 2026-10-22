// Google Cloud Text-to-Speech for the Edge Function "daily-speech": request checks, Google's request body and the
// request handler itself (with the database, secret and network passed in, so tts.test.ts can run it with fakes).
import { CORS, json } from './http.ts';

/** Voices the app offers (keep in sync with VOICES in src/lib/speech.ts). Neural2 and Chirp 3 HD have separate free monthly quotas. */
export const VOICES = [
  'de-DE-Neural2-F',
  'de-DE-Neural2-B',
  'de-DE-Chirp3-HD-Aoede',
  'de-DE-Chirp3-HD-Charon',
] as const;
export type Voice = (typeof VOICES)[number];

export const MAX_CHARS_PER_CALL = 700;
/** Hard cap per month over all voices, below the smallest free quota (1 million characters) of Google. */
export const MONTHLY_CHAR_CAP = 800_000;

export interface SpeechRequest {
  text: string;
  voice: Voice;
  rate: number;
}

/** The request body checked; `null` if anything is off. The rate is clamped to what Google accepts. */
export function parseSpeechRequest(body: unknown): SpeechRequest | null {
  const b = body as { text?: unknown; voice?: unknown; rate?: unknown } | null;
  if (typeof b?.text !== 'string') return null;
  const text = b.text.replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_CHARS_PER_CALL) return null;
  if (typeof b.voice !== 'string' || !(VOICES as readonly string[]).includes(b.voice)) return null;
  const rate = typeof b.rate === 'number' && Number.isFinite(b.rate) ? Math.min(2, Math.max(0.5, b.rate)) : 1;
  return { text, voice: b.voice as Voice, rate };
}

/** Body for Google's text:synthesize call (MP3 output). */
export function googleBody(req: SpeechRequest) {
  return {
    input: { text: req.text },
    voice: { languageCode: 'de-DE', name: req.voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: req.rate },
  };
}

/** The usage family booked in ai_usage.purpose (the free quotas count per family). */
export const voiceFamily = (voice: Voice): string => (voice.includes('Chirp3') ? 'chirp3-hd' : 'neural2');

/** First day of the current month in Berlin as YYYY-MM-DD (the monthly cap counts from there). */
export function monthStart(now: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-01`;
}

/** What the handler needs from the outside world (database, secret, network), so it can be tested with fakes. */
export interface SpeechDeps {
  /** The owner's user id if the request is signed in as the Daily owner, else null. */
  owner(req: Request): Promise<string | null>;
  apiKey(): string | undefined;
  charsThisMonth(): Promise<number>;
  addUsage(chars: number, family: string): Promise<void>;
  fetch: typeof fetch;
}

/** Short, non-secret reason for a failed Google call, e.g. "google 403 PERMISSION_DENIED" (shown in the app). */
export function googleReason(status: number, body: string): string {
  let code = '';
  try {
    const s = (JSON.parse(body) as { error?: { status?: unknown } }).error?.status;
    if (typeof s === 'string' && /^[A-Z_]{3,40}$/.test(s)) code = ` ${s}`;
  } catch {
    // not JSON
  }
  return `google ${status}${code}`;
}

export const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * The Edge Function "daily-speech". Answers { status: 'ok', audio: '<base64 MP3>' }, or
 * { status: 'budget' | 'no_key' } or { status: 'error', reason } (reason names the failing step, e.g. "google 403").
 */
export function speechHandler(deps: SpeechDeps): (req: Request) => Promise<Response> {
  const handle = async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method' });
    if (!(await deps.owner(req))) return json(401, { error: 'unauthorized' });

    const request = parseSpeechRequest(await req.json().catch(() => null));
    if (!request) return json(400, { error: 'request' });

    const key = deps.apiKey();
    if (!key) return json(200, { status: 'no_key' });
    if ((await deps.charsThisMonth()) + request.text.length > MONTHLY_CHAR_CAP) return json(200, { status: 'budget' });

    try {
      const res = await deps.fetch(GOOGLE_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify(googleBody(request)),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Google TTS failed', res.status, text.slice(0, 300));
        return json(200, { status: 'error', reason: googleReason(res.status, text) });
      }
      const data = (await res.json()) as { audioContent?: unknown };
      if (typeof data.audioContent !== 'string' || !data.audioContent) return json(200, { status: 'error', reason: 'google ohne Audio' });
      await deps.addUsage(request.text.length, voiceFamily(request.voice)).catch((e) => console.error('ai_usage_add failed', e));
      return json(200, { status: 'ok', audio: data.audioContent });
    } catch (e) {
      console.error('Google TTS call failed', e instanceof Error ? e.message : e);
      return json(200, { status: 'error', reason: 'google nicht erreichbar' });
    }
  };
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      return await handle(req);
    } catch (e) {
      // Always answer with CORS headers: without them the browser only reports a vague network error.
      console.error('daily-speech failed', e instanceof Error ? e.message : e);
      return json(500, { status: 'error', reason: 'server' });
    }
  };
}
