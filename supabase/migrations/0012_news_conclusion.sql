-- Daily App, migration 0012: short conclusion ("Fazit", at most 3 sentences) with the possible link to the depot
-- topics, stored next to the longer summary of 0011. Older rows simply have no conclusion.
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

alter table daily.news_details add column if not exists conclusion text check (char_length(conclusion) <= 600);

insert into daily.schema_migrations (version) values ('0012_news_conclusion') on conflict do nothing;
