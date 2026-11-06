-- Past clients still owing a balance, and every active funder they never
-- applied to. Read-only report — no schema changes, nothing to migrate,
-- safe to run anytime in the Supabase SQL editor.
--
-- This mirrors recoup() in housing.html (Move-Outs Owing / Readiness / Case
-- Management tabs) so what you see here matches what staff see in the app.
-- New residents, new funders, and new applications are picked up automatically
-- the next time this is run — there is nothing to update by hand.

with owing as (
  select
    id, name, house_name, move_out_date, phone, employed, employer,
    coalesce(past_due,0) + coalesce(current_due,0) - coalesce(amount_paid,0) as balance
  from residents
  where move_out_date is not null
),
owing_balance as (
  select * from owing where balance > 0
),
touched as (
  -- every funder this resident has ever applied to, any status
  select distinct lower(trim(resident_name)) as resident_key, funder_name
  from funding_applications
),
app_counts as (
  select
    lower(trim(resident_name)) as resident_key,
    count(*) filter (where status = 'applied') as pending_applications,
    count(*) filter (where status = 'denied')  as denied_applications
  from funding_applications
  group by lower(trim(resident_name))
)
select
  o.name,
  o.house_name,
  o.move_out_date,
  o.balance,
  o.employed,
  o.employer,
  coalesce(ac.pending_applications, 0) as pending_applications,
  coalesce(ac.denied_applications, 0)  as denied_applications,
  (
    select string_agg(f.name, ', ' order by f.name)
    from funders f
    where f.active is distinct from false
      and not exists (
        select 1 from touched t
        where t.resident_key = lower(trim(o.name)) and t.funder_name = f.name
      )
  ) as untried_funders,
  (
    select count(*)
    from funders f
    where f.active is distinct from false
      and not exists (
        select 1 from touched t
        where t.resident_key = lower(trim(o.name)) and t.funder_name = f.name
      )
  ) as untried_count
from owing_balance o
left join app_counts ac on ac.resident_key = lower(trim(o.name))
order by o.balance desc;
