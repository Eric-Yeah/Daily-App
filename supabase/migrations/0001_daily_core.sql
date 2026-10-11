-- Daily App, migration 0001: schema "daily" with owner check, settings, tasks, day notes.
-- Runs inside the Study App's Supabase project. It only creates objects in the schema "daily"
-- and never touches the Study App's tables.
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run.
-- Safe to run twice (idempotent).

create schema if not exists daily;

create table if not exists daily.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Owner: exactly the accounts listed here may use Daily. The Study App allows
-- registrations, so "logged in" alone is not enough.
-- Filled once by hand in the SQL editor (see README), never by the app.
-- ---------------------------------------------------------------------------
create table if not exists daily.owner (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function daily.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from daily.owner where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Settings (one row per user). Device-only things (Face ID credential) stay on the device.
-- ---------------------------------------------------------------------------
create table if not exists daily.settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name     text not null default '' check (char_length(display_name) <= 40),
  time_zone        text not null default 'Europe/Berlin' check (char_length(time_zone) <= 64),
  trading_end      text not null default '17:30' check (trading_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  hide_amounts     boolean not null default false,
  lock_timeout_min integer not null default 5 check (lock_timeout_min between 0 and 1440),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tasks ("Heute erledigen"). Open tasks from earlier days roll over in the app.
-- ---------------------------------------------------------------------------
create table if not exists daily.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  day        date not null default (now() at time zone 'Europe/Berlin')::date,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tasks_user_day on daily.tasks (user_id, day);

-- ---------------------------------------------------------------------------
-- One line about the day ("Tag abschließen").
-- ---------------------------------------------------------------------------
create table if not exists daily.day_notes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  note       text not null check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: every table, own rows only, and only for the owner.
-- ---------------------------------------------------------------------------
alter table daily.schema_migrations enable row level security;
alter table daily.owner enable row level security;
alter table daily.settings enable row level security;
alter table daily.tasks enable row level security;
alter table daily.day_notes enable row level security;

drop policy if exists owner_read_self on daily.owner;
create policy owner_read_self on daily.owner
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists settings_own on daily.settings;
create policy settings_own on daily.settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

drop policy if exists tasks_own on daily.tasks;
create policy tasks_own on daily.tasks
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

drop policy if exists day_notes_own on daily.day_notes;
create policy day_notes_own on daily.day_notes
  for all to authenticated
  using (user_id = (select auth.uid()) and (select daily.is_owner()))
  with check (user_id = (select auth.uid()) and (select daily.is_owner()));

-- ---------------------------------------------------------------------------
-- Privileges. anon gets nothing at all; authenticated only what RLS then narrows down.
-- daily.owner and daily.schema_migrations are never writable from the app.
-- ---------------------------------------------------------------------------
revoke all on schema daily from public, anon;
revoke all on all tables in schema daily from public, anon, authenticated;
grant usage on schema daily to authenticated, service_role;

grant select on daily.owner to authenticated;
grant select, insert, update, delete on daily.settings, daily.tasks, daily.day_notes to authenticated;
grant all on all tables in schema daily to service_role;

revoke all on function daily.is_owner() from public, anon;
grant execute on function daily.is_owner() to authenticated, service_role;

insert into daily.schema_migrations (version) values ('0001_daily_core') on conflict do nothing;
