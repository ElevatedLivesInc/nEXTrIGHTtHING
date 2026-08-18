// GET /incident/list -> all incident reports, newest occurrence first
import { getAuthedEmail } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  const ALLOWED = [
    'gabe@nextrighthing.com',
    'cateo@nextrighthing.com',
    'rob@nextrighthing.com',
    'bailey@nextrighthing.com'
  ];
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'not signed in' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to incident reports.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async p => { try { const r = await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok ? await r.json() : []; } catch(_) { return []; } };

  // Incidents are ordered by when they HAPPENED, not when they were written up.
  const [incidents, concerns] = await Promise.all([
    get('incidents?select=*&order=incident_date.desc,reported_at.desc&limit=1000'),
    get('concerns?select=*&order=submitted_at.desc&limit=500')
  ]);
  return json({ viewer: who, incidents, concerns });
}
