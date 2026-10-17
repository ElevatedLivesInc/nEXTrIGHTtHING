-- 005-clients-spine.sql
-- Already applied directly in Supabase — this file only documents it so the
-- schema is reproducible elsewhere. Safe to re-run: every statement is
-- if-not-exists / add-column-if-not-exists.
--
-- Before this, a person existed only as whatever name string happened to be
-- typed into residents.name, funding_applications.resident_name,
-- case_notes.resident_name, and so on — matched back together by string
-- comparison, so a misspelling silently detached one system's record of
-- someone from every other system's. clients is the one identity everything
-- else hangs off of via client_id; the resident_name/resident_key text
-- columns stay in place as a fallback for rows created before this existed
-- (see the "or=(client_id=eq...,resident_name=eq...)" pattern in
-- functions/client/file.js).

create table if not exists public.clients (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text,
  last_name          text,
  name               text not null,
  phone              text,
  email              text,
  date_of_birth      date,
  status             text not null default 'prospect'
                     check (status in ('prospect','admitted','active','on_notice','discharged','alumni')),
  intake_request_id  uuid references public.intake_requests(id),
  admitted_on        date,
  discharged_on      date,
  discharge_reason   text,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         text,
  updated_at         timestamptz not null default now(),
  updated_by         text
);
alter table public.clients enable row level security;

alter table public.intake_requests      add column if not exists client_id uuid references public.clients(id);
alter table public.funding_applications add column if not exists client_id uuid references public.clients(id);
alter table public.residents            add column if not exists client_id uuid references public.clients(id);
alter table public.house_events         add column if not exists client_id uuid references public.clients(id);
alter table public.incidents            add column if not exists client_id uuid references public.clients(id);
alter table public.meetings             add column if not exists client_id uuid references public.clients(id);
alter table public.payments             add column if not exists client_id uuid references public.clients(id);
alter table public.case_notes           add column if not exists client_id uuid references public.clients(id);
alter table public.client_goals         add column if not exists client_id uuid references public.clients(id);
alter table public.documents            add column if not exists client_id uuid references public.clients(id);
alter table public.work_signups         add column if not exists client_id uuid references public.clients(id);

create index if not exists clients_intake_request_idx on public.clients (intake_request_id);
create index if not exists residents_client_idx on public.residents (client_id);
