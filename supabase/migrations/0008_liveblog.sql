-- Daily App, migration 0008: live blog for the afternoon.
-- The Edge Function "daily-news" writes short entries (service role) when important news arrives between
-- 12:00 and 22:00 Berlin time; the app only reads them (owner only, Row Level Security). Kept 30 days.
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

create table if not exists daily.liveblog_entries (
  id         bigint generated always as identity primary key,
  day        date not null,
  created_at timestamptz not null default now(),
  headline   text not null check (char_length(headline) <= 160),
  body       text not null check (char_length(body) <= 800),
  importance smallint not null default 3 check (importance between 1 and 5),
  sources    jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  item_ids   bigint[] not null default '{}'
);
create index if not exists liveblog_entries_day_idx on daily.liveblog_entries (day, created_at desc);

alter table daily.liveblog_entries enable row level security;

drop policy if exists owner_read on daily.liveblog_entries;
create policy owner_read on daily.liveblog_entries for select to authenticated using ((select daily.is_owner()));

revoke all on daily.liveblog_entries from public, anon, authenticated;
grant select on daily.liveblog_entries to authenticated;
grant all on daily.liveblog_entries to service_role;

insert into daily.schema_migrations (version) values ('0008_liveblog') on conflict do nothing;
