// GET /outcomes/data -> everything the Outcomes & Protocol page measures.
// Treatment-center data only: same roster as Housing. Fail-closed.
// Works before migration 013 runs: missing columns/tables come back empty and
// the page says what starts recording once the migration is applied.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';
import { TENANT } from '../_lib/tenant-config.js';

export async function onRequestGet({ request, env }) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error: 'Not signed in. Open Mission Control to sign in, then reload.' }, 401);
  if (!allowedFor('housing').includes(who)) return json({ error: 'Your account does not have access to Outcomes.' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);

  const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async (path) => { try { const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, { headers: H }); return r.ok ? await r.json() : []; } catch (_) { return []; } };

  // Today's trend point. Ignored if the snapshot function isn't installed yet.
  try { await fetch(env.SUPABASE_URL + '/rest/v1/rpc/ops_take_snapshot', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' }); } catch (_) {}

  const [intake, residents, apps, houses, snaps] = await Promise.all([
    // No names or messages from intake: the page needs timing and status only.
    get('intake_requests?select=id,created_at,status,urgency,crisis_flag,first_contact_at&order=created_at.desc&limit=2000'),
    get('residents?select=id,name,house_name,status,monthly_rent,past_due,current_due,amount_paid,funding_source,funding_end,insurance_renewal_date,eviction_pending,last_talked,last_contact,on_notice,move_in_date,move_out_date&limit=2000'),
    get('funding_applications?select=id,resident_name,funder_name,status,applied_date,decision_date,coverage_end,amount,created_at&limit=2000'),
    get('houses?select=name,bed_count,sort_order&order=sort_order.asc&limit=100'),
    get('ops_snapshots?select=*&order=day.asc&limit=400')
  ]);

  // Intake rows fetched with first_contact_at fail as a whole before 013; retry without it.
  let intakeRows = intake;
  let tracking = { callback: true, trend: Array.isArray(snaps) && snaps.length > 0 };
  if (!intakeRows.length) {
    intakeRows = await get('intake_requests?select=id,created_at,status,urgency,crisis_flag&order=created_at.desc&limit=2000');
    if (intakeRows.length) tracking.callback = false;
  }

  return json({
    viewer: who,
    org: TENANT.orgName,
    protocol: TENANT.protocol || {},
    tracking,
    intake: intakeRows, residents, applications: apps, houses, snapshots: snaps
  });
}
