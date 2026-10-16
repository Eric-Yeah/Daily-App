// Google Cloud Text-to-Speech helpers for the Edge Function "daily-speech" (pure parts, tested in tts.test.ts).

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
