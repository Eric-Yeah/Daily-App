-- Savings plan per position: how much is invested every month, optionally on which day.
-- It is a note for the user's overview; nothing is booked automatically. Safe to run twice.
alter table daily.positions add column if not exists savings_amount numeric(12, 2);
alter table daily.positions add column if not exists savings_day smallint;

alter table daily.positions drop constraint if exists positions_savings_amount_check;
alter table daily.positions add constraint positions_savings_amount_check check (savings_amount > 0 and savings_amount <= 1000000);

alter table daily.positions drop constraint if exists positions_savings_day_check;
alter table daily.positions add constraint positions_savings_day_check
  check (savings_day is null or (savings_day between 1 and 28 and savings_amount is not null));

insert into daily.schema_migrations (version) values ('0010_position_savings_plan') on conflict do nothing;
