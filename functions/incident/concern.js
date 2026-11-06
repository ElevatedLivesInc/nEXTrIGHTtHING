// POST /incident/concern -> staff review of a Speak Up submission
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  const ALLOWED = allowedFor('incident');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'not signed in' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'no access' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ ok:false, error:'bad request' },400); }
  if (!b.id) return json({ ok:false, error:'id required' },400);

  const STATUS = ['new','reviewing','resolved','escalated'];
  const p = { reviewed_by: who, reviewed_at: new Date().toISOString() };
  if (STATUS.includes(b.status)) p.status = b.status;
  if (b.response_notes !== undefined) p.response_notes = (''+b.response_notes).slice(0,4000) || null;

  const H = {
    'Content-Type':'application/json',
    'apikey':env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer':'return=representation'
  };
  const r = await fetch(env.SUPABASE_URL+'/rest/v1/concerns?id=eq.'+encodeURIComponent(b.id),
    { method:'PATCH', headers:H, body:JSON.stringify(p) });
  if (!r.ok) return json({ ok:false, error:'update failed', detail: await r.text() },500);
  return json({ ok:true, concern: (await r.json())[0] || null });
}
