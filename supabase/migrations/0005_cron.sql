-- supabase-only (needs pg_cron and pg_net; skipped by the local database tests)
-- Daily App, migration 0005: schedule the Edge Functions.
--   daily-news      every 30 minutes (the function itself skips the night, 23:00–06:00 Berlin)
--   daily-briefing  every 15 minutes (creates briefings and sends pushes at the chosen times)
-- The calls carry the secret from Supabase Vault (daily.cron_secret()); it never leaves the database.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.
-- Check later: select jobname, schedule, active from cron.job where jobname like 'daily-%';
--              select status, return_message, start_time from cron.job_run_details order by start_time desc limit 20;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'daily-news',
  '5,35 * * * *',
  $$
  select net.http_post(
    url := 'https://mhyunfeirajnmbrpdojm.supabase.co/functions/v1/daily-news',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-daily-cron', daily.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

select cron.schedule(
  'daily-briefing',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://mhyunfeirajnmbrpdojm.supabase.co/functions/v1/daily-briefing',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-daily-cron', daily.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

insert into daily.schema_migrations (version) values ('0005_cron') on conflict do nothing;
