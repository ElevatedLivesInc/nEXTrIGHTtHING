// GET /mission-control/summary -> cross-system counts for the hub
import { getAuthedEmail } from '../_lib/auth.js';
import { SCOPES } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in.' },401);

  // Mission Control is not all-or-nothing. Each viewer sees only the systems they own.
  // "client" = treatment-center data (residents, intake, scholarships)
  // "donor"  = nonprofit data (in-kind codes, cash gifts)
  const scopes = SCOPES[who] || [];
  if (!scopes.length) return json({ error:'Your account is not set up yet. Ask Gabe to add you.' },403);
  const canClient = scopes.includes('client');
  const canDonor  = scopes.includes('donor');

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async (path)=>{ try{ const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+path,{headers:h}); return r.ok? await r.json():[]; }catch(_){ return []; } };

  const none = async ()=>[];
  const [intake, inkind, apps, residents, caseRes, notes] = await Promise.all([
    canClient ? get('intake_requests?select=id,status,last_use,created_at,source,checks&limit=1000') : none(),
    canDonor  ? get('authorizations?select=id,status,donor_value&limit=1000') : none(),
    canClient ? get('funding_applications?select=id,status,coverage_end,resident_name&limit=1000') : none(),
    canClient ? get('residents?select=status,past_due,current_due,amount_paid,monthly_rent,move_out_date,last_talked,on_notice&limit=1000') : none(),
    // Name and dates only - the case management tile never needs a balance.
    canClient ? get('residents?select=name,status,move_out_date,last_contact,last_talked&limit=1000') : none(),
    canClient ? get('case_notes?select=resident_name,note_date,next_step,next_step_due&order=note_date.desc&limit=2000') : none()
  ]);

  const openIntake = intake.filter(r=>(r.status||'new')!=='closed');
  const hot = openIntake.filter(r=>['today','this week'].includes((r.last_use||'').toLowerCase()));
  // Same "ready" rule as the Intake Queue screen: insurance verified and an
  // assessment on the calendar. This is the honest answer to "how many people
  // do we need" - not the whole pipeline, just who could move in today.
  const isReady = r => (r.checks||'').indexOf('Insurance verified')>-1 && (r.checks||'').indexOf('Assessment scheduled')>-1;
  const readyNow = openIntake.filter(r=>isReady(r) && r.status!=='intaked');
  // Where the pipeline is actually coming from, so a marketing decision has
  // something under it besides a guess. Every intake, not just open ones -
  // an intaked or closed request still tells you which channel produced it.
  const bySource = {};
  intake.forEach(r=>{ const s=r.source||'unspecified'; bySource[s]=(bySource[s]||0)+1; });
  const soon = new Date(Date.now()+30*24*3600*1000);
  const expiring = apps.filter(a=>a.status==='approved' && a.coverage_end && new Date(a.coverage_end) <= soon && new Date(a.coverage_end) >= new Date());

  // Former residents stay on file for collections but are not occupied beds.
  const roster=(residents||[]).filter(r=>['moved_out','graduated','evicted'].indexOf(r.status||'')===-1);
  const filled=roster.filter(r=>(r.status||'active')!=='open');
  const openB=roster.filter(r=>(r.status||'')==='open');
  const outstanding=filled.reduce((t,r)=>t+Math.max((Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0),0),0);

  // Case management: how many people are current on contact, and how much has
  // been promised in a note and then missed.
  const DAY=86400000, nowT=Date.now();
  const activeClients=(caseRes||[]).filter(r=>!r.move_out_date&&(r.status||'active')!=='open');
  const touch=r=>{
    const own=(notes||[]).filter(n=>(n.resident_name||'').trim().toLowerCase()===(r.name||'').trim().toLowerCase());
    return [own.length?own[0].note_date:null, r.last_contact, r.last_talked].filter(Boolean).sort().pop()||null;
  };
  const staleClients=activeClients.filter(r=>{const t=touch(r); return !t || (nowT-new Date(t+'T00:00:00').getTime())/DAY > 7;});
  const overdueSteps=(notes||[]).filter(n=>n.next_step && n.next_step_due && new Date(n.next_step_due+'T00:00:00').getTime() < nowT);

  return json({
    viewer: who,
    scopes,
    caseload: { active:activeClients.length, stale:staleClients.length, overdue:overdueSteps.length },
    rounds: (function(){
      const iso=new Date(nowT).toISOString().slice(0,10);
      const here=(residents||[]).filter(r=>(r.status||'active')!=='open'&&!r.move_out_date);
      return {
        left: here.filter(r=>r.last_talked!==iso).length,
        quiet: here.filter(r=>!r.last_talked||(nowT-new Date(r.last_talked+'T00:00:00').getTime())/DAY>14).length,
        notice: here.filter(r=>r.on_notice).length
      };
    })(),
    housing: roster.length? { beds:roster.length, filled:filled.length, openBeds:openB.length,
      occupancy: Math.round(filled.length/roster.length*100), outstanding } : {},
    intake: { total:intake.length, open:openIntake.length, new:intake.filter(r=>(r.status||'new')==='new').length, urgent:hot.length, intaked:intake.filter(r=>r.status==='intaked').length,
      ready:readyNow.length, bySource },
    inkind: { total:inkind.length, redeemed:inkind.filter(r=>(r.status||'')==='redeemed').length, pending:inkind.filter(r=>(r.status||'issued')==='issued').length, value:inkind.reduce((t,r)=>t+(Number(r.donor_value)||0),0) },
    funding: { applications:apps.length, approved:apps.filter(a=>a.status==='approved').length, pending:apps.filter(a=>a.status==='applied').length, denied:apps.filter(a=>a.status==='denied').length, expiringSoon:expiring.length, expiringList:expiring.slice(0,8).map(a=>({name:a.resident_name,end:a.coverage_end})) }
  });
}
