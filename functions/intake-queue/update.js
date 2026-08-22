// POST /api/intake-update { id, status } -> updates a request's workflow status.
// Allowed statuses: new, contacted, scheduled, closed.
// FAIL-CLOSED behind Cloudflare Access, same as intake-list.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('intake-queue');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!ALLOWED.includes(who)) return json({ ok: false, error: 'Your account does not have access to the Intake Queue.' }, 403);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  // CREATE a request that did not come from the website (phone / walk-in / referral)
  if (body.create === true) {
    const S=(v,n)=> v==null?null:((''+v).trim().slice(0,n)||null);
    const rec = {
      first_name:S(body.first_name,120), last_name:S(body.last_name,120),
      email:S(body.email,200), phone:S(body.phone,60),
      reaching_as:S(body.reaching_as,20)||'self',
      insurance:S(body.insurance,60), insurance_company:S(body.insurance_company,120),
      needs_housing:S(body.needs_housing,20), probation_parole:S(body.probation_parole,30),
      employment_status:S(body.employment_status,30),
      primary_substance:S(body.primary_substance,120), last_use:S(body.last_use,40),
      motivation:S(body.motivation,500), best_time:S(body.best_time,20),
      message:S(body.message,2000), source:S(body.source,40)||'phone',
      referred_by:S(body.referred_by,200), status:'new'
    };
    if (!rec.first_name && !rec.phone) return json({ ok:false, error:'name or phone required' },400);
    const H2={'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal'};
    const r=await fetch(env.SUPABASE_URL+'/rest/v1/intake_requests',{method:'POST',headers:H2,body:JSON.stringify(rec)});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'create failed',detail:d},500);}
    return json({ ok:true });
  }

  const id = (body.id || '').toString().trim();
  if (!id) return json({ ok: false, error: 'invalid id' }, 400);

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer': 'return=minimal'
  };
  const url = env.SUPABASE_URL + '/rest/v1/intake_requests?id=eq.' + encodeURIComponent(id);

  if (body.del === true) {
    const dres = await fetch(url, { method: 'DELETE', headers: sbHeaders });
    if (!dres.ok) { const detail = await dres.text(); return json({ ok: false, error: 'delete failed', detail }, 500); }
    return json({ ok: true, deleted: true });
  }

  const patch = {};
  if (body.status !== undefined) {
    const status = (body.status || '').toString().trim();
    const allowedStatuses = ['new', 'contacted', 'scheduled', 'intaked', 'closed'];
    if (!allowedStatuses.includes(status)) return json({ ok: false, error: 'invalid status' }, 400);
    patch.status = status;
  }
  if (body.checks !== undefined) patch.checks = (body.checks || '').toString().slice(0, 500);
  if (body.notes !== undefined) patch.notes = (body.notes || '').toString().slice(0, 4000);
  if (!Object.keys(patch).length) return json({ ok: false, error: 'nothing to update' }, 400);

  const res = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(patch) });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'update failed', detail }, 500); }
  return json({ ok: true });
}
