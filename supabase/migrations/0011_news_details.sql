-- Daily App, migration 0011: longer AI summary of a news item ("Ausführlich", 1 to 2 minutes of reading).
-- The Edge Function "daily-news-detail" writes it (service role) when the owner taps the button; the result is
-- cached here so every article is summarised at most once. Only our own summary is stored, never the article text.
-- status: ok = summary present; no_text = no freely readable article (paywall or page without text);
--         short = article too short for a longer version. The last two are cached so nothing is fetched twice.
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

create table if not exists daily.news_details (
  item_id    bigint primary key references daily.news_items (id) on delete cascade,
  status     text not null check (status in ('ok', 'no_text', 'short')),
  summary    text check (char_length(summary) <= 3000),
  model      text check (char_length(model) <= 60),
  created_at timestamptz not null default now(),
  check ((status = 'ok') = (summary is not null))
);

alter table daily.news_details enable row level security;

drop policy if exists owner_read on daily.news_details;
create policy owner_read on daily.news_details for select to authenticated using ((select daily.is_owner()));

revoke all on daily.news_details from public, anon, authenticated;
grant select on daily.news_details to authenticated;
grant all on daily.news_details to service_role;

insert into daily.schema_migrations (version) values ('0011_news_details') on conflict do nothing;
