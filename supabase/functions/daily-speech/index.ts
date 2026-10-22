// Daily App – Edge Function "daily-speech" (Deno).
// Reads a short text aloud with Google Cloud Text-to-Speech and returns it as MP3 (base64). The app calls it chunk
// by chunk while a briefing is played. Only the signed-in owner may call it. The Google API key lives only in the
// Supabase secret DAILY_GOOGLE_TTS_API_KEY. A monthly character cap (below Google's free quota) is counted in
// daily.ai_usage (model 'google-tts', input_tokens = characters, cost 0).
//
// Called with { text, voice, rate }. Answer: { status: 'ok', audio: '<base64 mp3>' } | { status: 'budget' | 'no_key' }
// | { status: 'error', reason }. The logic is speechHandler in _shared/tts.ts (tested in tts.test.ts).
// Deploy: npx supabase functions deploy daily-speech --no-verify-jwt --use-api --project-ref <ref>
import { admin, ownerFromRequest } from '../_shared/admin.ts';
import { monthStart, speechHandler } from '../_shared/tts.ts';

const MODEL = 'google-tts';
const db = admin();

Deno.serve(
  speechHandler({
    owner: (req) => ownerFromRequest(req, db),
    apiKey: () => Deno.env.get('DAILY_GOOGLE_TTS_API_KEY'),
    async charsThisMonth() {
      const { data } = await db.from('ai_usage').select('input_tokens').eq('model', MODEL).gte('day', monthStart(new Date()));
      return (data ?? []).reduce((s: number, r: { input_tokens: number | string }) => s + Number(r.input_tokens), 0);
    },
    async addUsage(chars, family) {
      const { error } = await db.rpc('ai_usage_add', { p_model: MODEL, p_in: chars, p_out: 0, p_cost: 0, p_purpose: family });
      if (error) throw new Error(error.message);
    },
    fetch: (input, init) => fetch(input, init),
  }),
);
