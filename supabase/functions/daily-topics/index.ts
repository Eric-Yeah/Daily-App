// Daily App – Edge Function "daily-topics" (Deno).
// Topic suggestions for depot positions, so that news can be found for them. Claude Haiku 5.5 gets only the NAMES of
// the positions (never ISINs, WKNs, amounts or groups) and answers with a few topics each, preferring the topics Daily
// knows (src/lib/topics.ts rules and _shared/newsTopics.ts). Nothing is stored; the app shows the topics as suggestions.
//
// Called by the app with the signed-in owner's session: { names: string[] } (at most 40).
// Answer: { status: 'ok', topics: string[][] } (same order as names) | { status: 'budget' | 'no_key' | 'error' }.
// Deploy: npx supabase functions deploy daily-topics --no-verify-jwt --use-api --project-ref <ref>
import { admin, CORS, json, ownerFromRequest, ownerSettings } from '../_shared/admin.ts';
import { askJson } from '../_shared/ai.ts';
import { KNOWN_TOPICS } from '../_shared/newsTopics.ts';
import { cleanName, MAX_NAMES, parseTopics, TOPICS_SCHEMA, topicsSystem, topicsUser } from '../_shared/topicSuggest.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  const owner = await ownerFromRequest(req, db);
  if (!owner) return json(401, { error: 'unauthorized' });

  const body = (await req.json().catch(() => ({}))) as { names?: unknown };
  if (!Array.isArray(body.names) || body.names.length === 0 || body.names.length > MAX_NAMES) return json(400, { error: 'names' });
  const names = body.names.map(cleanName);
  if (names.some((n) => !n)) return json(400, { error: 'names' });

  const settings = await ownerSettings(db, owner);
  const res = await askJson<unknown>(db, settings.aiBudgetUsdMonth, {
    system: topicsSystem(KNOWN_TOPICS),
    user: topicsUser(names),
    maxTokens: 200 + names.length * 60,
    schema: TOPICS_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!res.ok) return json(200, { status: res.reason === 'budget' || res.reason === 'no_key' ? res.reason : 'error' });
  return json(200, { status: 'ok', topics: parseTopics(res.data, names.length) });
});
