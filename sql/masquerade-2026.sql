-- ============================================================
-- Flannel to Formal Masquerade Fundraiser — database setup
-- Supabase project: uhnytejrlfummcrwdeij (Rein-N-Solutions)
-- Owner entity: The Right Thing in Recovery (501(c)(3), EIN 93-4316358)
--
-- SAFE TO RUN: creates NEW tables only (all prefixed gala_).
-- Touches nothing that already exists. Run once in
-- Supabase → SQL Editor → New query → paste → Run.
-- ============================================================

-- ---------- 1. Event settings (one row per event) ----------
create table if not exists public.gala_event (
  slug          text primary key,
  name          text not null,
  entity_id     text not null default 'rtir-501c3',
  starts_at     timestamptz not null,
  goal_cents    integer,                 -- set by staff; null = no goal shown
  ticket_value_cents integer not null default 3500, -- per-person benefit value for receipts (CPA to confirm)
  created_at    timestamptz not null default now()
);

insert into public.gala_event (slug, name, starts_at)
values ('masquerade-2026', 'Flannel to Formal Masquerade Fundraiser', '2026-11-13 18:00:00-07')
on conflict (slug) do nothing;

-- ---------- 2. Ticket reservations / RSVPs ----------
create table if not exists public.gala_rsvps (
  id            uuid primary key default gen_random_uuid(),
  event_slug    text not null default 'masquerade-2026' references public.gala_event(slug),
  entity_id     text not null default 'rtir-501c3',
  full_name     text not null check (length(full_name) between 2 and 120),
  email         text check (email is null or length(email) <= 200),
  phone         text check (phone is null or length(phone) <= 40),
  individual_qty integer not null default 0 check (individual_qty between 0 and 20),
  couple_qty    integer not null default 0 check (couple_qty between 0 and 10),
  guest_names   text check (guest_names is null or length(guest_names) <= 600),
  dietary       text check (dietary is null or length(dietary) <= 300),
  attire        text check (attire is null or attire in ('flannel','formal','masquerade','surprise')),
  pay_status    text not null default 'reserved' check (pay_status in ('reserved','paid','at_door','comp','cancelled')),
  source        text not null default 'web' check (source in ('web','sponsor','staff')),
  sponsor_id    uuid,
  checked_in    boolean not null default false,
  staff_notes   text,
  created_at    timestamptz not null default now(),
  constraint gala_rsvps_contact check (coalesce(email,'') <> '' or coalesce(phone,'') <> ''),
  constraint gala_rsvps_qty check (individual_qty + couple_qty > 0)
);

-- ---------- 3. Sponsors ----------
create table if not exists public.gala_sponsors (
  id            uuid primary key default gen_random_uuid(),
  event_slug    text not null default 'masquerade-2026' references public.gala_event(slug),
  entity_id     text not null default 'rtir-501c3',
  business_name text not null check (length(business_name) between 2 and 160),
  contact_name  text check (contact_name is null or length(contact_name) <= 120),
  email         text check (email is null or length(email) <= 200),
  phone         text check (phone is null or length(phone) <= 40),
  website       text check (website is null or length(website) <= 300),
  tier          text not null check (tier in ('supporter','hope','changemaker','champion','partner')),
  amount_cents  integer not null check (amount_cents >= 0),
  paid_cents    integer not null default 0,
  status        text not null default 'pledged' check (status in ('pledged','invoiced','paid','declined')),
  display_name  text,                    -- how they want to be listed
  logo_url      text,
  logo_received boolean not null default false,
  show_publicly boolean not null default false, -- staff approves before anything shows on the wall
  message       text check (message is null or length(message) <= 1000),
  benefits_done jsonb not null default '{}'::jsonb, -- fulfillment checklist, keyed by benefit id
  tickets_issued integer not null default 0,
  receipt_number text,
  staff_notes   text,
  created_at    timestamptz not null default now(),
  constraint gala_sponsors_contact check (coalesce(email,'') <> '' or coalesce(phone,'') <> '')
);

-- ---------- 4. In-kind pledges ----------
create table if not exists public.gala_inkind (
  id            uuid primary key default gen_random_uuid(),
  event_slug    text not null default 'masquerade-2026' references public.gala_event(slug),
  entity_id     text not null default 'rtir-501c3',
  donor_name    text not null check (length(donor_name) between 2 and 160),
  business_name text check (business_name is null or length(business_name) <= 160),
  email         text check (email is null or length(email) <= 200),
  phone         text check (phone is null or length(phone) <= 40),
  category      text check (category is null or category in ('food','auction','drawing','gift_basket','gift_card','service','decor','music','photo','supplies','other')),
  description   text not null check (length(description) between 2 and 1000),
  est_value_cents integer check (est_value_cents is null or est_value_cents >= 0),
  delivery      text check (delivery is null or delivery in ('dropoff','pickup','day_of')),
  status        text not null default 'pledged' check (status in ('pledged','received','receipted','used','declined')),
  show_publicly boolean not null default false,
  receipt_number text,
  staff_notes   text,
  created_at    timestamptz not null default now(),
  constraint gala_inkind_contact check (coalesce(email,'') <> '' or coalesce(phone,'') <> '')
);

-- ---------- 5. Free Opportunity Drawing entries (NO purchase necessary) ----------
create table if not exists public.gala_drawing (
  id            uuid primary key default gen_random_uuid(),
  event_slug    text not null default 'masquerade-2026' references public.gala_event(slug),
  full_name     text not null check (length(full_name) between 2 and 120),
  email         text check (email is null or length(email) <= 200),
  phone         text check (phone is null or length(phone) <= 40),
  is_winner     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint gala_drawing_contact check (coalesce(email,'') <> '' or coalesce(phone,'') <> '')
);
-- one free entry per email per event
create unique index if not exists gala_drawing_one_per_email
  on public.gala_drawing (event_slug, lower(email)) where email is not null;

-- ---------- 6. Row Level Security ----------
-- The public website (anon key) may ONLY insert new rows, and only with
-- safe defaults. It can never read anyone's name, email or phone.
-- Staff read/write happens through the server function using the
-- service role key, which bypasses RLS.
alter table public.gala_event    enable row level security;
alter table public.gala_rsvps    enable row level security;
alter table public.gala_sponsors enable row level security;
alter table public.gala_inkind   enable row level security;
alter table public.gala_drawing  enable row level security;

drop policy if exists gala_rsvps_public_insert on public.gala_rsvps;
create policy gala_rsvps_public_insert on public.gala_rsvps
  for insert to anon
  with check (pay_status = 'reserved' and source = 'web' and checked_in = false
              and staff_notes is null and sponsor_id is null);

drop policy if exists gala_sponsors_public_insert on public.gala_sponsors;
create policy gala_sponsors_public_insert on public.gala_sponsors
  for insert to anon
  with check (status = 'pledged' and paid_cents = 0 and show_publicly = false
              and logo_received = false and benefits_done = '{}'::jsonb
              and tickets_issued = 0 and receipt_number is null and staff_notes is null);

drop policy if exists gala_inkind_public_insert on public.gala_inkind;
create policy gala_inkind_public_insert on public.gala_inkind
  for insert to anon
  with check (status = 'pledged' and show_publicly = false
              and receipt_number is null and staff_notes is null);

drop policy if exists gala_drawing_public_insert on public.gala_drawing;
create policy gala_drawing_public_insert on public.gala_drawing
  for insert to anon
  with check (is_winner = false);

grant insert on public.gala_rsvps, public.gala_sponsors, public.gala_inkind, public.gala_drawing to anon;

-- ---------- 7. Public scoreboard (no personal info, no per-sponsor $) ----------
create or replace function public.gala_public(p_slug text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'goal_cents', (select goal_cents from gala_event where slug = p_slug),
    'raised_cents',
      coalesce((select sum(amount_cents) from gala_sponsors where event_slug = p_slug and status <> 'declined'),0)
    + coalesce((select sum(individual_qty*3500 + couple_qty*6000) from gala_rsvps where event_slug = p_slug and pay_status in ('reserved','paid','at_door') and source = 'web'),0)
    + coalesce((select sum(coalesce(est_value_cents,0)) from gala_inkind where event_slug = p_slug and status in ('received','receipted','used')),0),
    'guests', coalesce((select sum(individual_qty + couple_qty*2) from gala_rsvps where event_slug = p_slug and pay_status <> 'cancelled'),0),
    'sponsor_count', (select count(*) from gala_sponsors where event_slug = p_slug and status <> 'declined'),
    'inkind_count', (select count(*) from gala_inkind where event_slug = p_slug and status <> 'declined'),
    'sponsors', coalesce((select json_agg(json_build_object(
                    'name', coalesce(nullif(display_name,''), business_name),
                    'tier', tier, 'logo', logo_url, 'url', website) order by amount_cents desc, created_at)
                  from gala_sponsors where event_slug = p_slug and show_publicly and status <> 'declined'), '[]'::json),
    'inkind', coalesce((select json_agg(coalesce(nullif(business_name,''), donor_name) order by created_at)
                  from gala_inkind where event_slug = p_slug and show_publicly and status <> 'declined'), '[]'::json)
  );
$$;

revoke all on function public.gala_public(text) from public;
grant execute on function public.gala_public(text) to anon, authenticated;
