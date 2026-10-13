-- supabase-only (needs pg_cron; skipped by the local database tests)
-- Daily App, migration 0014: run the news and price jobs on the full and half hour (:00 and :30)
-- instead of :05/:35 and :02/:32. Only the schedule changes; the calls stay as they were (0005, 0007).
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.
-- Check later: select jobname, schedule, active from cron.job where jobname like 'daily-%';

select cron.alter_job((select jobid from cron.job where jobname = 'daily-news'), schedule := '0,30 * * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'daily-prices'), schedule := '0,30 * * * *');

insert into daily.schema_migrations (version) values ('0014_cron_half_hours') on conflict do nothing;
