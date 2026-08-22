-- Case management: needs/services tracking + next case-manager contact due.
-- Run in the Supabase SQL editor after 1-housing-schema.sql and 2-housing-import.sql.
-- Safe to re-run: both columns are added only if missing.

alter table residents
  add column if not exists case_needs jsonb not null default '{}'::jsonb,
  add column if not exists case_followup_date date;
