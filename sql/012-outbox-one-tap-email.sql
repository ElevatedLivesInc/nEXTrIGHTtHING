-- ============================================================
-- 012 - One-tap email (Nov 16, 2026)
-- Owner entity: The Right Thing in Recovery (501(c)(3), EIN 93-4316358)
--
-- SAFE TO RUN: one NEW table, two NEW nullable columns. No existing column,
-- row or policy is changed.
--
--   outbound_emails            every email a staff member sends with one tap
--                              (in-kind receipts, Masquerade thank-yous). It is
--                              what stops a second tap from emailing the same
--                              person twice, and what shows "Sent" on the row.
--   authorizations.donor_email where the donor's receipt goes. donor_contact
--                              has always held a contact NAME, so there was
--                              nowhere to keep an address.
--   authorizations.campaign    set by staff ('masquerade-2026') when a gift was
--                              for the Masquerade, so the receipt email thanks
--                              them for the event. Never set automatically:
--                              year-round supporters are not gala donors.
-- ============================================================

create table if not exists public.outbound_emails (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  entity_id   text not null default 'rtir-501c3',
  kind        text not null,
  ref_table   text not null,
  ref_id      text not null,
  to_email    text not null,
  subject     text,
  sent_by     text,
  ok          boolean not null default false,
  error       text,
  provider_id text
);
create index if not exists outbound_emails_ref on public.outbound_emails (ref_table, ref_id, kind);

-- Staff-only. No policies on purpose: the browser key can never read or write
-- it; the server functions use the service key, which bypasses RLS.
alter table public.outbound_emails enable row level security;

alter table public.authorizations add column if not exists donor_email text
  check (donor_email is null or length(donor_email) <= 200);
alter table public.authorizations add column if not exists campaign text
  check (campaign is null or length(campaign) <= 60);
