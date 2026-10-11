-- A position is identified by ISIN, WKN or both. The WKN is optional; the ISIN is no longer required.
-- Safe to run twice.
alter table daily.positions add column if not exists wkn text;
alter table daily.positions alter column isin drop not null;

alter table daily.positions drop constraint if exists positions_wkn_check;
alter table daily.positions add constraint positions_wkn_check check (wkn ~ '^[A-Z0-9]{6}$');

alter table daily.positions drop constraint if exists positions_isin_or_wkn;
alter table daily.positions add constraint positions_isin_or_wkn check (isin is not null or wkn is not null);

-- Same WKN only once per user (several NULLs stay allowed).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'positions_user_id_wkn_key') then
    alter table daily.positions add constraint positions_user_id_wkn_key unique (user_id, wkn);
  end if;
end $$;

insert into daily.schema_migrations (version) values ('0009_position_wkn') on conflict do nothing;
