-- Daily App, migration 0006: market prices (M4).
-- Prices are market data per symbol (not per user). The Edge Function "daily-prices" writes them
-- with the service role; the app only reads them (owner only, Row Level Security).
--   price_snapshots  intraday points (about every 15 minutes), kept 14 days
--   price_daily      daily closes, kept about 400 days
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

create table if not exists daily.price_snapshots (
  symbol text not null check (char_length(symbol) between 1 and 40),
  ts     timestamptz not null,
  price  numeric(18, 6) not null check (price > 0),
  primary key (symbol, ts)
);

create table if not exists daily.price_daily (
  symbol text not null check (char_length(symbol) between 1 and 40),
  day    date not null,
  close  numeric(18, 6) not null check (close > 0),
  source text not null default 'yahoo' check (source in ('yahoo', 'eodhd')),
  primary key (symbol, day)
);

create index if not exists price_snapshots_ts_idx on daily.price_snapshots (ts);
create index if not exists price_daily_day_idx on daily.price_daily (day);

alter table daily.price_snapshots enable row level security;
alter table daily.price_daily enable row level security;

drop policy if exists owner_read on daily.price_snapshots;
create policy owner_read on daily.price_snapshots for select to authenticated using ((select daily.is_owner()));
drop policy if exists owner_read on daily.price_daily;
create policy owner_read on daily.price_daily for select to authenticated using ((select daily.is_owner()));

revoke all on daily.price_snapshots, daily.price_daily from public, anon, authenticated;
grant select on daily.price_snapshots, daily.price_daily to authenticated;
grant all on daily.price_snapshots, daily.price_daily to service_role;

insert into daily.schema_migrations (version) values ('0006_prices') on conflict do nothing;
