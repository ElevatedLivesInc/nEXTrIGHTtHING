// GET /client/file?id=<client id> -> one person, everything, assembled.
//
// This is the record a licensing surveyor, a probation officer or a funder
// actually asks for, and until now it did not exist anywhere - it lived in
// six screens and somebody's memory. Nobody fills out a compliance form to
// produce it, because the work already produced it: Rob tapping "house
// meeting" on rounds IS the attendance record, and a case note with a next
// step IS the service plan progress note.
//
// Sections are gated by who is looking, in the same place the data is
// fetched. Somebody on the case-management roster and not the housing roster
// never receives a balance - not hidden in the page, never sent.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

// Non-financial resident columns, same list the case-management endpoint uses.
const CLINICAL_RESIDENT_COLS = [
  'id','client_id','name','house_name','room','status','move_in_date','move_out_date',
  'phone','email','emergency_contact','has_id','has_ss_card','has_birth_cert','bank_account',
  'employed','employer','job_start_date','certifications','savings_balance',
  'case_manager','treatment_level','notes','last_contact','last_talked',
  'house_meetings','peer_meetings','last_meeting','last_ua','ua_result',
  'curfew_ok','chores_ok','on_notice','warnings','last_warning','warning_reason',
  'payer_type','funding_source','funding_end','case_needs','case_followup_date'
].join(',');

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const url = new URL(request.url);

  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in. Open a staff page to log in, then reload.' },401);

  const canMoney   = allowedFor('housing').includes(who);
  const canCase    = allowedFor('case-management').includes(who);
  const canFunding = allowedFor('funding').includes(who);
  if (!canMoney && !canCase) return json({ error:'Your account does not have access to client files.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' },400);

  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async p => { try{ const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok?await r.json():[]; }catch(_){ return []; } };
  const none = async () => [];
  const byClient = 'client_id=eq.'+encodeURIComponent(id);

  const cl = await get('clients?select=*&id=eq.'+encodeURIComponent(id));
  const client = cl[0];
  if (!client) return json({ error:'No client with that id.' },404);

  // Records still linked only by name, from before the spine existed.
  const nameFilter = 'resident_name=eq.'+encodeURIComponent(client.name||'');

  const [resident, intake, notes, goals, meetings, docs, apps, payments, work, events, incidents] = await Promise.all([
    get('residents?select='+(canMoney?'*':CLINICAL_RESIDENT_COLS)+'&'+byClient),
    client.intake_request_id ? get('intake_requests?select=*&id=eq.'+encodeURIComponent(client.intake_request_id)) : none(),
    canCase ? get('case_notes?select=*&or=('+byClient+','+nameFilter+')&order=note_date.desc&limit=500') : none(),
    canCase ? get('client_goals?select=*&or=('+byClient+','+nameFilter+')&order=created_at.desc&limit=200') : none(),
    get('meetings?select=*&or=('+byClient+','+nameFilter+')&order=meeting_date.desc&limit=500'),
    canCase ? get('documents?select=*&or=('+byClient+','+nameFilter+')&order=uploaded_at.desc&limit=200') : none(),
    canFunding ? get('funding_applications?select=*&or=('+byClient+','+nameFilter+')&order=created_at.desc&limit=100') : none(),
    canMoney ? get('payments?select=*&or=('+byClient+','+nameFilter+')&order=paid_on.desc&limit=500') : none(),
    get('work_signups?select=*&or=('+byClient+',name=eq.'+encodeURIComponent(client.name||'')+')&limit=50'),
    get('house_events?select=*&'+nameFilter+'&order=created_at.desc&limit=200'),
    canCase ? get('incidents?select=id,incident_date,incident_type,severity,status,narrative&persons_involved=ilike.*'+encodeURIComponent(client.name||'')+'*&order=incident_date.desc&limit=50') : none()
  ]);

  return json({
    viewer: who,
    scope: { money: canMoney, clinical: canCase, funding: canFunding },
    client,
    resident: resident[0] || null,
    intake: intake[0] || null,
    notes, goals, meetings, documents: docs,
    applications: apps, payments, work, events, incidents
  });
}
