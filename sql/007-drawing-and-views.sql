-- 007-drawing-and-views.sql
-- Two small tables so staff can see what the yard sale campaign is actually
-- doing: who entered the free prize drawing, and how many times each public
-- page has been loaded. functions/drawing/enter.js already writes to
-- drawing_entries; this is the first migration that actually defines it.

create table if not exists public.drawing_entries (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  name text not null,
  email text,
  phone text,
  entry_method text not null default 'online',
  consent_contact boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.drawing_entries enable row level security;
create index if not exists drawing_entries_event_idx on public.drawing_entries(event, created_at desc);

-- Raw hit count, not unique visitors - every page load is one row, on purpose,
-- so this stays a one-line insert with nothing to dedupe or expire. Good
-- enough to answer "is anyone looking at this," not analytics-grade traffic
-- reporting.
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  viewed_at timestamptz not null default now()
);
alter table public.page_views enable row level security;
create index if not exists page_views_page_idx on public.page_views(page, viewed_at desc);
