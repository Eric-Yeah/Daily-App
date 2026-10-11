-- supabase-only (needs pg_cron and pg_net; skipped by the local database tests)
-- Daily App, migration 0007: schedule the price job.
--   daily-prices  every 30 minutes (the function itself checks Berlin time: Xetra Mon–Fri until
--                 trading end, US indices 15:30–22:05, daily closes once after trading end)
-- The call carries the secret from Supabase Vault (daily.cron_secret()); it never leaves the database.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.
-- Check later: select jobname, schedule, active from cron.job where jobname = 'daily-prices';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'daily-prices',
  '2,32 * * * *',
  $$
  select net.http_post(
    url := 'https://mhyunfeirajnmbrpdojm.supabase.co/functions/v1/daily-prices',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-daily-cron', daily.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

insert into daily.schema_migrations (version) values ('0007_cron_prices') on conflict do nothing;
