-- Daily App, migration 0002: depot (groups and positions) and the default loss threshold.
-- Only stores what the app needs: name, ISIN, quantity, cost per unit. No account numbers,
-- no broker credentials.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

alter table daily.settings
  add column if not exists loss_threshold_pct numeric(5, 2) not null default -3
  check (loss_threshold_pct between -50 and 0);

-- ---------------------------------------------------------------------------
-- Groups ("Welt breit", "USA", …): name, colour, order.
-- ---------------------------------------------------------------------------
create table if not exists daily.groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null default '#8DB8FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Positions. A position can only point to a group of the same user.
-- ---------------------------------------------------------------------------
create table if not exists daily.positions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  isin               text not null check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  ticker             text check (char_length(ticker) <= 20),
  exchange           text check (char_length(exchange) <= 20),
  provider_symbol    text check (char_length(provider_symbol) <= 40),
  quantity           numeric(18, 6) not null check (quantity >= 0),
  cost_per_unit      numeric(18, 6) not null check (cost_per_unit >= 0),
  currency           text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  group_id           uuid,
  loss_threshold_pct numeric(5, 2) check (loss_threshold_pct between -50 and 0),
  topics             text[] not null default '{}'
                     check (cardinality(topics) <= 12 and char_length(array_to_string(topics, ',')) <= 400),
  manual_price       numeric(18, 6) check (manual_price > 0),
  manual_price_at    timestamptz,
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, isin),
  foreign key (group_id, user_id) references daily.groups (id, user_id) on delete set null (group_id)
);
create index if not exists positions_user on daily.positions (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: own rows only, and only for the owner (same as 0001).
-- ---------------------------------------------------------------------------
alter table daily.groups enable row level security;
alter table daily.positions enable row level security;

drop policy if exists groups_own on daily.groups;
create policy groups_own on daily.groups
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

drop policy if exists positions_own on daily.positions;
create policy positions_own on daily.positions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

revoke all on daily.groups, daily.positions from public, anon, authenticated;
grant select, insert, update, delete on daily.groups, daily.positions to authenticated;
grant all on daily.groups, daily.positions to service_role;

insert into daily.schema_migrations (version) values ('0002_depot') on conflict do nothing;
