-- 007-solida-foundation-funder.sql
--
-- The Solida Foundation, added to the funder directory 28 Aug 2026 from
-- Trudy's call with their HR contact. Everything below that came from that
-- call rather than from Solida's own website is marked CONFIRM ON THE CALL,
-- because a case manager quoting the wrong month-two number to a client is
-- worse than a case manager who knows she has to ask.
--
-- The directory now lives on /case-management (Funders tab). Running this is
-- the same as adding it there by hand; it is written as SQL only so the whole
-- record - process, terms and caveats - lands intact instead of being retyped.
--
-- Safe to run more than once: it inserts only if no funder of this name exists,
-- and otherwise updates the record in place.

with incoming as (
  select
    'The Solida Foundation'::text as name,
    'Scholarship'::text as category,
    'https://thesolidafoundation.org/how-we-help/recovery-scholarships/'::text as website,
    'HR — name not captured yet'::text as contact_name,
    'hr@thesolidafoundation.org'::text as contact_email,
    '801-635-9650'::text as contact_phone,
    -- Their published terms. Sober living up to 9 months and up to 30 therapy
    -- sessions are Solida's own words; the sliding scale is ours to confirm.
    'Sliding scale over 3 months — month 1 scholarshipped, month 2 no more than $500, month 3 discounted to $250 ($750 total). CONFIRM ON THE CALL.'::text as typical_amount,
    'A sincere desire to get and stay sober long term. Full assessment for substance use, mental health and economic need — they prioritise people without the resources to sustain long-term sobriety. Accepted clients are assigned a mentor, matched to sober living and therapy, and monitored weekly (drug tests plus mentor check-ins). Published scholarship covers sober living up to 9 months, up to 30 therapy sessions, and education or vocational training where needed.'::text as eligibility,
    'Process, in order: (1) Fill out the online application on their Recovery Scholarships page. (2) Their HR contact calls back and asks roughly 8–9 questions. (3) A 30-minute Google Meet. (4) The board then approves, normally about a week after the Meet. Budget two to three weeks end to end, so start the application well before the bed date, not on it.'::text as rules,
    false as once_per_client,
    true as active,
    'ADDED 28 Aug 2026 from Trudy''s call with Solida HR. TWO THINGS TO CONFIRM before anyone quotes a number to a client: (a) the money — as relayed, Solida wants the first month scholarshipped and then wants NRT charging no more than $500 in month two and $250 in month three, which reads as a discount NRT gives rather than money Solida pays. Ask plainly on the call: does Solida pay the $500 and the $250, or are those caps on what we may bill? (b) whether it is one scholarship per client for life — not stated anywhere, so the directory currently does not treat it as once-only. Update this record the moment either is answered.'::text as notes
)
insert into public.funders (name, category, website, contact_name, contact_email, contact_phone,
                            typical_amount, eligibility, rules, once_per_client, active, notes)
select name, category, website, contact_name, contact_email, contact_phone,
       typical_amount, eligibility, rules, once_per_client, active, notes
from incoming
where not exists (select 1 from public.funders f where lower(f.name) = lower(incoming.name));

update public.funders f
set category = i.category, website = i.website, contact_name = i.contact_name,
    contact_email = i.contact_email, contact_phone = i.contact_phone,
    typical_amount = i.typical_amount, eligibility = i.eligibility, rules = i.rules,
    active = i.active, notes = i.notes
from (select * from (
  select
    'The Solida Foundation'::text as name,
    'Scholarship'::text as category,
    'https://thesolidafoundation.org/how-we-help/recovery-scholarships/'::text as website,
    'HR — name not captured yet'::text as contact_name,
    'hr@thesolidafoundation.org'::text as contact_email,
    '801-635-9650'::text as contact_phone,
    'Sliding scale over 3 months — month 1 scholarshipped, month 2 no more than $500, month 3 discounted to $250 ($750 total). CONFIRM ON THE CALL.'::text as typical_amount,
    'A sincere desire to get and stay sober long term. Full assessment for substance use, mental health and economic need — they prioritise people without the resources to sustain long-term sobriety. Accepted clients are assigned a mentor, matched to sober living and therapy, and monitored weekly (drug tests plus mentor check-ins). Published scholarship covers sober living up to 9 months, up to 30 therapy sessions, and education or vocational training where needed.'::text as eligibility,
    'Process, in order: (1) Fill out the online application on their Recovery Scholarships page. (2) Their HR contact calls back and asks roughly 8–9 questions. (3) A 30-minute Google Meet. (4) The board then approves, normally about a week after the Meet. Budget two to three weeks end to end, so start the application well before the bed date, not on it.'::text as rules,
    true as active,
    'ADDED 28 Aug 2026 from Trudy''s call with Solida HR. TWO THINGS TO CONFIRM before anyone quotes a number to a client: (a) the money — as relayed, Solida wants the first month scholarshipped and then wants NRT charging no more than $500 in month two and $250 in month three, which reads as a discount NRT gives rather than money Solida pays. Ask plainly on the call: does Solida pay the $500 and the $250, or are those caps on what we may bill? (b) whether it is one scholarship per client for life — not stated anywhere, so the directory currently does not treat it as once-only. Update this record the moment either is answered.'::text as notes
) x) i
where lower(f.name) = lower(i.name);

-- Sanity check — run this after and you should get exactly one row back.
-- select name, typical_amount, contact_phone, active from public.funders where name ilike '%solida%';
