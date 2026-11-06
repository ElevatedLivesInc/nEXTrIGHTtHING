-- 006-employment-status.sql
-- Adds an employment-status question to pre-intake, alongside the existing
-- housing-needed and insurance/payment questions - so a case manager opening
-- a new admit already knows whether income is part of the plan, instead of
-- asking again on day one.

alter table public.intake_requests
  add column if not exists employment_status text;
