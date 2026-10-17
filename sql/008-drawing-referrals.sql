-- 008-drawing-referrals.sql
--
-- "Who sent you?" on the yard sale drawing form, applied 28 Aug 2026.
--
-- Launch scope is deliberately small: a name someone types into a box, and a
-- manual tally. No unique links, no generated codes, no attribution platform.
-- referred_by is free text a stranger typed - it is never matched against
-- clients, residents or any staff table, and it is treated as untrusted input.
--
-- IMPORTANT: referrals change recognition only, never odds. The published
-- rules say one entry per person, duplicates consolidated not stacked, and
-- that nothing improves a person's chance of winning. Utah has no charitable
-- raffle exemption - this drawing is lawful precisely because there is no
-- consideration and the three free entry methods carry equal weight. Nothing
-- here may put a thumb on that scale.
--
-- Safe to re-run: every statement is guarded.

alter table public.drawing_entries
  add column if not exists referred_by text;

alter table public.drawing_entries
  add column if not exists checked_in boolean not null default false;

comment on column public.drawing_entries.referred_by is
  'Free-text name the entrant typed when asked "who sent you?". Recognition only - never affects odds. Not a foreign key to anything.';
comment on column public.drawing_entries.checked_in is
  'Set by hand after the sale for entrants who actually showed up. Not set by the public endpoint.';

create index if not exists drawing_entries_event_referrer_idx
  on public.drawing_entries (event, referred_by);
