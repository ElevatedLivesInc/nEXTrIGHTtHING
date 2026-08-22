// GET /funding/list -> funders registry + applications
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  // Client scholarship applications = treatment-center data. Not for donor-side staff.
  const ALLOWED = allowedFor('funding');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in. Open a staff page to log in, then reload.' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to the Funding Navigator.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const [fRes,aRes,rRes] = await Promise.all([
    fetch(env.SUPABASE_URL+'/rest/v1/funders?select=*&order=name.asc&limit=500',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/funding_applications?select=*&order=created_at.desc&limit=1000',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/residents?select=client_id,name,case_manager&limit=1000',{headers:h})
  ]);
  if(!fRes.ok){const d=await fRes.text();return json({error:'funders load failed',detail:d},500);}
  if(!aRes.ok){const d=await aRes.text();return json({error:'applications load failed',detail:d},500);}
  const applications = await aRes.json();
  const residents = rRes.ok ? await rRes.json() : [];

  // Every application is somebody's client - show who is already carrying
  // their case, whether the application is old, new, or not decided yet.
  // Matched by client_id where the spine has caught up; falls back to name
  // for older rows that predate it.
  const byClientId = {}, byName = {};
  residents.forEach(r=>{
    if (!r.case_manager) return;
    if (r.client_id) byClientId[r.client_id] = r.case_manager;
    const key = (r.name||'').trim().toLowerCase();
    if (key && !byName[key]) byName[key] = r.case_manager;
  });
  applications.forEach(a=>{
    a.case_manager = (a.client_id && byClientId[a.client_id])
      || byName[(a.resident_name||'').trim().toLowerCase()]
      || null;
  });

  return json({ viewer:who, funders:await fRes.json(), applications });
}
