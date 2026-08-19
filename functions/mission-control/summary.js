// GET /mission-control/summary -> cross-system counts for the hub
import { getAuthedEmail } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in.' },401);

  // Mission Control is not all-or-nothing. Each viewer sees only the systems they own.
  // "client" = treatment-center data (residents, intake, scholarships)
  // "donor"  = nonprofit data (in-kind codes, cash gifts)
  const ROLES = {
    'gabe@nextrighthing.com':   ['client','donor'],
    'cateo@nextrighthing.com':  ['client','donor'],
    'bailey@nextrighthing.com': ['client','donor'],
    'rob@nextrighthing.com':    ['client'],
    'ryan@nextrighthing.com':   ['donor']
  };
  const scopes = ROLES[who] || [];
  if (!scopes.length) return json({ error:'Your account is not set up yet. Ask Gabe to add you.' },403);
  const canClient = scopes.includes('client');
  const canDonor  = scopes.includes('donor');

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async (path)=>{ try{ const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+path,{headers:h}); return r.ok? await r.json():[]; }catch(_){ return []; } };

  const none = async ()=>[];
  const [intake, inkind, apps, residents] = await Promise.all([
    canClient ? get('intake_requests?select=id,status,last_use,created_at&limit=1000') : none(),
    canDonor  ? get('authorizations?select=id,status,donor_value&limit=1000') : none(),
    canClient ? get('funding_applications?select=id,status,coverage_end,resident_name&limit=1000') : none(),
    canClient ? get('residents?select=status,past_due,current_due,amount_paid,monthly_rent&limit=1000') : none()
  ]);

  const openIntake = intake.filter(r=>(r.status||'new')!=='closed');
  const hot = openIntake.filter(r=>['today','this week'].includes((r.last_use||'').toLowerCase()));
  const soon = new Date(Date.now()+30*24*3600*1000);
  const expiring = apps.filter(a=>a.status==='approved' && a.coverage_end && new Date(a.coverage_end) <= soon && new Date(a.coverage_end) >= new Date());

  const filled=(residents||[]).filter(r=>(r.status||'active')!=='open');
  const openB=(residents||[]).filter(r=>(r.status||'')==='open');
  const outstanding=filled.reduce((t,r)=>t+Math.max((Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0),0),0);

  return json({
    viewer: who,
    scopes,
    housing: residents.length? { beds:residents.length, filled:filled.length, openBeds:openB.length,
      occupancy: Math.round(filled.length/residents.length*100), outstanding } : {},
    intake: { total:intake.length, open:openIntake.length, new:intake.filter(r=>(r.status||'new')==='new').length, urgent:hot.length, intaked:intake.filter(r=>r.status==='intaked').length },
    inkind: { total:inkind.length, redeemed:inkind.filter(r=>(r.status||'')==='redeemed').length, pending:inkind.filter(r=>(r.status||'issued')==='issued').length, value:inkind.reduce((t,r)=>t+(Number(r.donor_value)||0),0) },
    funding: { applications:apps.length, approved:apps.filter(a=>a.status==='approved').length, pending:apps.filter(a=>a.status==='applied').length, denied:apps.filter(a=>a.status==='denied').length, expiringSoon:expiring.length, expiringList:expiring.slice(0,8).map(a=>({name:a.resident_name,end:a.coverage_end})) }
  });
}
