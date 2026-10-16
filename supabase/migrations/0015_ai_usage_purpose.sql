-- Daily App, migration 0015: AI usage per purpose.
-- ai_usage so far only knew day and model. A purpose column (live blog, summaries, wrap plan, ...) shows which
-- function spends the money. A trailing "!" on the purpose marks calls whose answer was discarded
-- (cut off at the token limit or refused): they cost money but produce nothing.
-- The old 4-argument function stays (the deployed Edge Functions call it until they are redeployed); it books as 'unknown'.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.
-- Check later: select day, purpose, requests, cost_usd from daily.ai_usage order by day desc, cost_usd desc;

alter table daily.ai_usage add column if not exists purpose text not null default '' check (char_length(purpose) <= 60);
alter table daily.ai_usage drop constraint if exists ai_usage_pkey;
alter table daily.ai_usage add primary key (day, model, purpose);

create or replace function daily.ai_usage_add(p_model text, p_in bigint, p_out bigint, p_cost numeric, p_purpose text)
returns void language sql security definer set search_path = '' as $$
  insert into daily.ai_usage as u (day, model, purpose, requests, input_tokens, output_tokens, cost_usd)
  values ((now() at time zone 'Europe/Berlin')::date, p_model, left(coalesce(p_purpose, ''), 60), 1, p_in, p_out, p_cost)
  on conflict (day, model, purpose) do update set
    requests = u.requests + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cost_usd = u.cost_usd + excluded.cost_usd;
$$;

create or replace function daily.ai_usage_add(p_model text, p_in bigint, p_out bigint, p_cost numeric)
returns void language sql security definer set search_path = '' as $$
  select daily.ai_usage_add(p_model, p_in, p_out, p_cost, 'unknown');
$$;

revoke all on function daily.ai_usage_add(text, bigint, bigint, numeric, text) from public, anon, authenticated;
grant execute on function daily.ai_usage_add(text, bigint, bigint, numeric, text) to service_role;
revoke all on function daily.ai_usage_add(text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function daily.ai_usage_add(text, bigint, bigint, numeric) to service_role;

insert into daily.schema_migrations (version) values ('0015_ai_usage_purpose') on conflict do nothing;
