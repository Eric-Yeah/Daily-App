// Daily App – Edge Function "daily-speech" (Deno).
// Reads a short text aloud with Google Cloud Text-to-Speech and returns it as MP3 (base64). The app calls it chunk
// by chunk while a briefing is played. Only the signed-in owner may call it. The Google API key lives only in the
// Supabase secret DAILY_GOOGLE_TTS_API_KEY. A monthly character cap (below Google's free quota) is counted in
// daily.ai_usage (model 'google-tts', input_tokens = characters, cost 0).
//
// Called with { text, voice, rate }. Answer: { status: 'ok', audio: '<base64 mp3>' } | { status: 'budget' | 'no_key' | 'error' }.
// Deploy: npx supabase functions deploy daily-speech --no-verify-jwt --use-api --project-ref <ref>
import { admin, CORS, json, ownerFromRequest } from '../_shared/admin.ts';
import { googleBody, MONTHLY_CHAR_CAP, parseSpeechRequest, voiceFamily } from '../_shared/tts.ts';

const MODEL = 'google-tts';

async function charsThisMonth(db: ReturnType<typeof admin>): Promise<number> {
  const first = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(new Date()) + '-01';
  const { data } = await db.from('ai_usage').select('input_tokens').eq('model', MODEL).gte('day', first);
  return (data ?? []).reduce((s: number, r: { input_tokens: number | string }) => s + Number(r.input_tokens), 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  const owner = await ownerFromRequest(req, db);
  if (!owner) return json(401, { error: 'unauthorized' });

  const request = parseSpeechRequest(await req.json().catch(() => null));
  if (!request) return json(400, { error: 'request' });

  const key = Deno.env.get('DAILY_GOOGLE_TTS_API_KEY');
  if (!key) return json(200, { status: 'no_key' });
  if ((await charsThisMonth(db)) + request.text.length > MONTHLY_CHAR_CAP) return json(200, { status: 'budget' });

  try {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify(googleBody(request)),
    });
    if (!res.ok) {
      console.error('Google TTS failed', res.status, (await res.text()).slice(0, 300));
      return json(200, { status: 'error' });
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return json(200, { status: 'error' });
    await db.rpc('ai_usage_add', { p_model: MODEL, p_in: request.text.length, p_out: 0, p_cost: 0, p_purpose: voiceFamily(request.voice) });
    return json(200, { status: 'ok', audio: data.audioContent });
  } catch (e) {
    console.error('Google TTS call failed', e instanceof Error ? e.message : e);
    return json(200, { status: 'error' });
  }
});
