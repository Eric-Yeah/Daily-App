-- Daily App, migration 0013: "Marktstart" briefing.
-- The Edge Function "daily-briefing" writes a short market update shortly after Xetra opens (about 09:30 Berlin time)
-- into daily.briefings with kind 'open'. The table only allowed morning, afternoon and evening so far.
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

alter table daily.briefings drop constraint if exists briefings_kind_check;
alter table daily.briefings add constraint briefings_kind_check check (kind in ('morning', 'afternoon', 'evening', 'open'));

insert into daily.schema_migrations (version) values ('0013_market_open') on conflict do nothing;
