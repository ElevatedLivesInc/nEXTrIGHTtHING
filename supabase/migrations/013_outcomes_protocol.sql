-- 013_outcomes_protocol: outcomes tracking for Mission Control. Additive only.
-- Safe to run more than once. /outcomes works before this runs; callback time
-- and the daily trend start recording once it has.

-- 1. Callback time: stamp the first time an inquiry leaves "new".
alter table public.intake_requests add column if not exists first_contact_at timestamptz;

create or replace function public.set_first_contact_at() returns trigger language plpgsql as $$
begin
  if new.first_contact_at is null
     and coalesce(old.status,'new') = 'new'
     and coalesce(new.status,'new') <> 'new' then
    new.first_contact_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_first_contact_at on public.intake_requests;
create trigger trg_first_contact_at before update on public.intake_requests
  for each row execute function public.set_first_contact_at();

-- 2. Optional licensed bed count per house (null = count active + open rows).
alter table public.houses add column if not exists bed_count integer;

-- 3. One row per day so occupancy, rent and callback time have a trend line.
create table if not exists public.ops_snapshots (
  day date primary key,
  beds_total integer, beds_filled integer,
  rent_billed numeric, rent_paid numeric, past_due numeric,
  intake_total integer, intake_new_open integer, intake_contacted_30d integer,
  median_first_contact_hours numeric,
  funding_pending integer, funding_approved integer, funding_awarded numeric,
  created_at timestamptz not null default now()
);
alter table public.ops_snapshots enable row level security;  -- service key only

create or replace function public.ops_take_snapshot() returns public.ops_snapshots
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Denver')::date; r public.ops_snapshots;
begin
  insert into ops_snapshots as s (day, beds_total, beds_filled, rent_billed, rent_paid, past_due,
    intake_total, intake_new_open, intake_contacted_30d, median_first_contact_hours,
    funding_pending, funding_approved, funding_awarded)
  select d,
    (select count(*) from residents where status in ('active','open')),
    (select count(*) from residents where status = 'active'),
    (select coalesce(sum(coalesce(past_due,0)+coalesce(current_due,0)),0) from residents where status = 'active'),
    (select coalesce(sum(amount_paid),0) from residents where status = 'active'),
    (select coalesce(sum(past_due),0) from residents where status = 'active'),
    (select count(*) from intake_requests),
    (select count(*) from intake_requests where coalesce(status,'new') = 'new'),
    (select count(*) from intake_requests where first_contact_at > now() - interval '30 days'),
    (select round((percentile_cont(0.5) within group (order by extract(epoch from first_contact_at - created_at)/3600.0))::numeric, 1)
       from intake_requests where first_contact_at > now() - interval '30 days'),
    (select count(*) from funding_applications where coalesce(status,'pending') = 'pending'),
    (select count(*) from funding_applications where status = 'approved'),
    (select coalesce(sum(amount),0) from funding_applications where status = 'approved')
  on conflict (day) do update set
    beds_total=excluded.beds_total, beds_filled=excluded.beds_filled, rent_billed=excluded.rent_billed,
    rent_paid=excluded.rent_paid, past_due=excluded.past_due, intake_total=excluded.intake_total,
    intake_new_open=excluded.intake_new_open, intake_contacted_30d=excluded.intake_contacted_30d,
    median_first_contact_hours=excluded.median_first_contact_hours, funding_pending=excluded.funding_pending,
    funding_approved=excluded.funding_approved, funding_awarded=excluded.funding_awarded, created_at=now()
  returning * into r;
  return r;
end $$;
revoke all on function public.ops_take_snapshot() from public, anon, authenticated;
select public.ops_take_snapshot();
