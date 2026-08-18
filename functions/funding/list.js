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
  const [fRes,aRes] = await Promise.all([
    fetch(env.SUPABASE_URL+'/rest/v1/funders?select=*&order=name.asc&limit=500',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/funding_applications?select=*&order=created_at.desc&limit=1000',{headers:h})
  ]);
  if(!fRes.ok){const d=await fRes.text();return json({error:'funders load failed',detail:d},500);}
  if(!aRes.ok){const d=await aRes.text();return json({error:'applications load failed',detail:d},500);}
  return json({ viewer:who, funders:await fRes.json(), applications:await aRes.json() });
}
