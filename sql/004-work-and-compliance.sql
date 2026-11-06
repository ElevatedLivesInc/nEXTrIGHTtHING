-- 004-work-and-compliance.sql
-- Applied 2026-08-20. Kept here so the schema is reproducible elsewhere.

-- Rent A Husband crew signups. The handyman company exists so people in
-- recovery have somewhere to work, so a signup is a recovery milestone as
-- much as a job application: it is the moment "unemployed" starts becoming
-- "employed" on the readiness board.
create table if not exists public.work_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null, phone text, email text, house_name text, resident_name text,
  skills text, has_transport boolean default false, has_tools boolean default false,
  availability text, hours_wanted text,
  background_ok text default 'unknown' check (background_ok in ('unknown','pending','cleared','barred')),
  status text not null default 'new' check (status in ('new','screening','ready','placed','paused','declined')),
  first_shift_date date, notes text, updated_by text
);
create index if not exists work_signups_status_idx on public.work_signups (status, created_at desc);
alter table public.work_signups enable row level security;

-- Checks and balances. Insurance certificates, an LLC registration, a business
-- licence, a treatment licence: none of them announce themselves when they
-- lapse. They are fine right up until somebody asks for proof and there isn't
-- any. entity matters because the treatment center, the 501(c)(3) and Rent A
-- Husband LLC are separate legal entities, and a policy covering one does not
-- cover another.
create table if not exists public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  entity text not null default 'treatment_center'
    check (entity in ('treatment_center','nonprofit','rent_a_husband','other')),
  item_type text not null default 'other'
    check (item_type in ('insurance','license','registration','certification','lease','contract','inspection','other')),
  name text not null, provider text, policy_number text, coverage text,
  effective_on date, expires_on date,
  status text not null default 'active'
    check (status in ('active','pending','lapsed','cancelled','not_required')),
  owner text, notes text,
  created_at timestamptz not null default now(), updated_by text
);
create index if not exists compliance_expiry_idx on public.compliance_items (expires_on);
alter table public.compliance_items enable row level security;
