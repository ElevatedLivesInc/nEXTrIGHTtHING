-- 003-case-management.sql
-- Applied to the NRT project on 2026-08-20. Kept here so the schema is
-- reproducible when this system is stood up for another facility.
--
-- New tables only. Nothing existing is altered or dropped.
--
-- Why these five:
--   meetings     - residents.house_meetings is a counter. A counter can say
--                  "4 this month" but never which four, which is what a
--                  probation officer or a licensing surveyor asks for.
--   payments     - past_due/current_due/amount_paid are running totals with no
--                  history. Corrections are new rows, never edits.
--   case_notes   - the contact record, with a next step and a date on it.
--   client_goals - where "unemployed, unbanked, unskilled" stops being a
--                  status and becomes a plan with a deadline.
--   documents    - leases, signed notices, ROIs. Files live in the private
--                  client-docs bucket; this table is the index.

create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  resident_name text not null,
  house_name    text,
  kind          text not null default 'house'
                check (kind in ('house','peer','clinical','outside','other')),
  meeting_date  date not null,
  verified_by   text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists meetings_resident_idx on public.meetings (resident_name, meeting_date desc);
alter table public.meetings enable row level security;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  resident_name text not null,
  house_name    text,
  amount        numeric not null,
  paid_on       date not null,
  method        text check (method in ('cash','card','check','money order','transfer','funder','credit','adjustment')),
  kind          text not null default 'rent'
                check (kind in ('rent','deposit','fee','credit','adjustment','other')),
  taken_by      text,
  reference     text,
  note          text,
  voided        boolean not null default false,
  voided_reason text,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists payments_resident_idx on public.payments (resident_name, paid_on desc);
alter table public.payments enable row level security;

create table if not exists public.case_notes (
  id             uuid primary key default gen_random_uuid(),
  resident_name  text not null,
  note_date      date not null default current_date,
  contact_type   text default 'in person'
                 check (contact_type in ('in person','phone','text','video','collateral','no contact','group')),
  summary        text not null,
  next_step      text,
  next_step_due  date,
  author         text,
  created_at     timestamptz not null default now()
);
create index if not exists case_notes_resident_idx on public.case_notes (resident_name, note_date desc);
alter table public.case_notes enable row level security;

create table if not exists public.client_goals (
  id            uuid primary key default gen_random_uuid(),
  resident_name text not null,
  domain        text not null default 'other'
                check (domain in ('housing','employment','education','legal','health','financial','recovery','family','other')),
  goal          text not null,
  status        text not null default 'open'
                check (status in ('open','in progress','met','paused','dropped')),
  target_date   date,
  met_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_by    text
);
create index if not exists client_goals_resident_idx on public.client_goals (resident_name, status);
alter table public.client_goals enable row level security;

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  resident_name text not null,
  house_name    text,
  doc_type      text not null default 'other'
                check (doc_type in ('lease','notice','roi','id','intake','funding','medical','other')),
  title         text,
  file_path     text,
  mime_type     text,
  size_bytes    bigint,
  signed_on     date,
  expires_on    date,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now(),
  notes         text
);
create index if not exists documents_resident_idx on public.documents (resident_name, uploaded_at desc);
alter table public.documents enable row level security;

-- Private. These are leases and IDs.
insert into storage.buckets (id, name, public)
values ('client-docs', 'client-docs', false)
on conflict (id) do nothing;
