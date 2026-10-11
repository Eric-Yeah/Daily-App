// Daily App – Edge Function "daily-news-detail" (Deno).
// The longer AI summary of one news item (1 to 2 minutes of reading), only when the owner taps "Ausführlich".
// It reads the article page, and only if the article is freely readable and long enough, Claude Haiku 5.5 summarises it
// in its own words. Only the summary is stored (table news_details), never the article. Behind a paywall there is
// no longer version: nothing is padded or guessed.
//
// Called by the app with the signed-in owner's session: { itemId: number }.
// Answer: { status: 'ok', summary } | { status: 'no_text' | 'short' } (cached) |
//         { status: 'unreachable' | 'budget' | 'no_key' | 'error' } (not cached, can be retried).
// Deploy: npx supabase functions deploy daily-news-detail --no-verify-jwt --use-api --project-ref <ref>
import { admin, CORS, json, ownerFromRequest, ownerSettings } from '../_shared/admin.ts';
import { askJson, MODEL, RULES } from '../_shared/ai.ts';
import { classifyArticle, DETAIL_SCHEMA, detailSystem, detailUser, extractArticle, isFetchableUrl, parseDetail } from '../_shared/article.ts';

const UA = 'DailyApp/1.0 (+https://eric-yeah.github.io/Daily-App/)';

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'de,en;q=0.8' },
      signal: AbortSignal.timeout(15_000),
    });
    // A redirect must not lead somewhere we would not fetch directly.
    if (!res.ok || !isFetchableUrl(res.url)) return null;
    if (!/html/i.test(res.headers.get('content-type') ?? '')) return null;
    const text = await res.text();
    return text.length > 3_000_000 ? text.slice(0, 3_000_000) : text;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const db = admin();
  const owner = await ownerFromRequest(req, db);
  if (!owner) return json(401, { error: 'unauthorized' });

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const itemId = Number(body.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) return json(400, { error: 'itemId' });

  const { data: cached } = await db.from('news_details').select('status, summary').eq('item_id', itemId).maybeSingle();
  if (cached) return json(200, { status: cached.status, summary: cached.summary ?? undefined });

  const { data: item } = await db.from('news_items').select('id, url, title, source, lang').eq('id', itemId).maybeSingle();
  if (!item) return json(404, { error: 'not found' });
  if (!isFetchableUrl(item.url)) return json(200, { status: 'no_text' });

  const html = await fetchPage(item.url);
  if (!html) return json(200, { status: 'unreachable' });

  const article = extractArticle(html);
  const status = classifyArticle(article);
  if (status !== 'ok') {
    await db.from('news_details').upsert({ item_id: itemId, status }, { onConflict: 'item_id', ignoreDuplicates: true });
    return json(200, { status });
  }

  const settings = await ownerSettings(db, owner);
  const res = await askJson<unknown>(db, settings.aiBudgetUsdMonth, {
    system: detailSystem(RULES),
    user: detailUser(item, article.text),
    maxTokens: 1100,
    schema: DETAIL_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!res.ok) return json(200, { status: res.reason === 'budget' || res.reason === 'no_key' ? res.reason : 'error' });

  const summary = parseDetail(res.data);
  if (!summary) return json(200, { status: 'error' });
  await db.from('news_details').upsert({ item_id: itemId, status: 'ok', summary, model: MODEL }, { onConflict: 'item_id', ignoreDuplicates: true });
  return json(200, { status: 'ok', summary });
});
