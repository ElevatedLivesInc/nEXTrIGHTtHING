-- 010 — intake triage field, and removal of clinical fields
-- Applied to production 2026-09-23.
--
-- Background: the Sept 2026 change removed "primary substance" and "last use"
-- from every intake form and replaced them with "how soon are you hoping to
-- start" (urgency). api/intake.js was updated to write `urgency` — but the
-- column was never created. PostgREST rejected every POST that carried it, so
-- intake submissions stopped reaching this database entirely. The last row that
-- saved was 2026-09-08. Submissions still reached staff through the Formspree
-- fallback, which is the only reason nobody noticed.
--
-- 1. the column the code already expected
alter table public.intake_requests
  add column if not exists urgency text;

-- 2. the clinical fields, removed for good.
-- Stored values were cleared first. No live code path reads or writes them:
-- api/intake.js never read them; intake-queue/update.js no longer accepts them;
-- intake-queue/admit.js no longer copies them into the opening case note;
-- client.html no longer displays them; patrol/run.js now triages on urgency,
-- the same field mission-control/summary.js already used.
alter table public.intake_requests
  drop column if exists primary_substance,
  drop column if exists last_use;
