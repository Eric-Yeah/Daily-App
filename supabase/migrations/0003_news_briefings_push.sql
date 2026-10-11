-- Daily App, migration 0003: news, AI usage, market events, briefings, Web Push.
-- Server-written tables (news, events, AI usage, briefings, push keys) are written only by the
-- Edge Functions (service_role). The owner can read them. Nothing here is readable without login.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

-- Settings: AI budget and push times ("HH:MM" in the user's time zone, null = off).
alter table daily.settings add column if not exists ai_budget_usd_month numeric(6, 2) not null default 1
  check (ai_budget_usd_month between 0 and 50);
alter table daily.settings add column if not exists push_morning text default '07:00'
  check (push_morning is null or push_morning ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table daily.settings add column if not exists push_afternoon text default null
  check (push_afternoon is null or push_afternoon ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table daily.settings add column if not exists push_evening text default '17:45'
  check (push_evening is null or push_evening ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- ---------------------------------------------------------------------------
-- News: only title, teaser, link, source, time. Never the full article.
-- ---------------------------------------------------------------------------
create table if not exists daily.news_items (
  id           bigint generated always as identity primary key,
  url          text not null unique check (char_length(url) <= 1000 and url ~ '^https?://'),
  title        text not null check (char_length(title) <= 400),
  teaser       text check (char_length(teaser) <= 600),
  source       text not null check (char_length(source) <= 100),
  lang         text check (lang in ('de', 'en')),
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now(),
  feed         text not null check (char_length(feed) <= 40),
  topics       text[] not null default '{}',
  official     boolean not null default false
);
create index if not exists news_items_published on daily.news_items (published_at desc);

create table if not exists daily.news_summaries (
  item_id       bigint primary key references daily.news_items (id) on delete cascade,
  summary       text not null check (char_length(summary) <= 700),
  importance    smallint not null check (importance between 1 and 5),
  headline_only boolean not null default false,
  model         text not null check (char_length(model) <= 60),
  created_at    timestamptz not null default now()
);

-- Which positions a news item concerns ("betrifft N Positionen").
create table if not exists daily.news_links (
  item_id     bigint not null references daily.news_items (id) on delete cascade,
  position_id uuid not null references daily.positions (id) on delete cascade,
  primary key (item_id, position_id)
);

-- ---------------------------------------------------------------------------
-- Market events (rate decisions, data releases) from official calendars.
-- ---------------------------------------------------------------------------
create table if not exists daily.market_events (
  id         bigint generated always as identity primary key,
  starts_at  timestamptz not null,
  title      text not null check (char_length(title) <= 200),
  importance smallint not null default 3 check (importance between 1 and 5),
  region     text check (char_length(region) <= 10),
  source     text not null check (char_length(source) <= 100),
  source_url text check (source_url ~ '^https://'),
  unique (source, starts_at, title)
);
create index if not exists market_events_starts on daily.market_events (starts_at);

-- ---------------------------------------------------------------------------
-- AI usage per day and model (for the hard cost limit and the display under "Mehr").
-- ---------------------------------------------------------------------------
create table if not exists daily.ai_usage (
  day           date not null,
  model         text not null check (char_length(model) <= 60),
  requests      integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd      numeric(10, 5) not null default 0,
  primary key (day, model)
);

-- Atomic add, called by the Edge Functions only.
create or replace function daily.ai_usage_add(p_model text, p_in bigint, p_out bigint, p_cost numeric)
returns void language sql security definer set search_path = '' as $$
  insert into daily.ai_usage as u (day, model, requests, input_tokens, output_tokens, cost_usd)
  values ((now() at time zone 'Europe/Berlin')::date, p_model, 1, p_in, p_out, p_cost)
  on conflict (day, model) do update set
    requests = u.requests + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cost_usd = u.cost_usd + excluded.cost_usd;
$$;

-- ---------------------------------------------------------------------------
-- Briefings, generated ahead of time so the app has content immediately.
-- ---------------------------------------------------------------------------
create table if not exists daily.briefings (
  kind       text not null check (kind in ('morning', 'afternoon', 'evening')),
  day        date not null,
  content    jsonb not null,
  created_at timestamptz not null default now(),
  pushed_at  timestamptz,
  primary key (kind, day)
);

-- ---------------------------------------------------------------------------
-- Web Push. The VAPID key pair is created by the Edge Function itself on first use;
-- only the public key is readable for the app. Subscriptions belong to the owner.
-- ---------------------------------------------------------------------------
create table if not exists daily.push_keys (
  id          integer primary key default 1 check (id = 1),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists daily.push_subscriptions (
  endpoint   text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Secret for the scheduled calls (pg_cron → Edge Functions). Generated inside the database,
-- kept in Supabase Vault, never shown to anyone. Readable only by service_role.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'daily_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'daily_cron_secret',
      'Daily App: Kennung für geplante Aufrufe der Edge Functions'
    );
  end if;
end $$;

create or replace function daily.cron_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'daily_cron_secret' limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and privileges.
-- ---------------------------------------------------------------------------
alter table daily.news_items enable row level security;
alter table daily.news_summaries enable row level security;
alter table daily.news_links enable row level security;
alter table daily.market_events enable row level security;
alter table daily.ai_usage enable row level security;
alter table daily.briefings enable row level security;
alter table daily.push_keys enable row level security;
alter table daily.push_subscriptions enable row level security;

drop policy if exists owner_read on daily.news_items;
create policy owner_read on daily.news_items for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.news_summaries;
create policy owner_read on daily.news_summaries for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.news_links;
create policy owner_read on daily.news_links for select to authenticated using (
  (select daily.is_owner())
  and exists (select 1 from daily.positions p where p.id = position_id and p.user_id = (select auth.uid()))
);
drop policy if exists owner_read on daily.market_events;
create policy owner_read on daily.market_events for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.ai_usage;
create policy owner_read on daily.ai_usage for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.briefings;
create policy owner_read on daily.briefings for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.push_keys;
create policy owner_read on daily.push_keys for select to authenticated using ((select daily.is_owner()));

drop policy if exists push_subscriptions_own on daily.push_subscriptions;
create policy push_subscriptions_own on daily.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

revoke all on daily.news_items, daily.news_summaries, daily.news_links, daily.market_events, daily.ai_usage,
  daily.briefings, daily.push_keys, daily.push_subscriptions from public, anon, authenticated;
grant select on daily.news_items, daily.news_summaries, daily.news_links, daily.market_events, daily.ai_usage,
  daily.briefings to authenticated;
grant select (public_key) on daily.push_keys to authenticated;
grant select, insert, delete on daily.push_subscriptions to authenticated;
grant all on daily.news_items, daily.news_summaries, daily.news_links, daily.market_events, daily.ai_usage,
  daily.briefings, daily.push_keys, daily.push_subscriptions to service_role;

revoke all on function daily.ai_usage_add(text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function daily.ai_usage_add(text, bigint, bigint, numeric) to service_role;
revoke all on function daily.cron_secret() from public, anon, authenticated;
grant execute on function daily.cron_secret() to service_role;

insert into daily.schema_migrations (version) values ('0003_news_briefings_push') on conflict do nothing;
