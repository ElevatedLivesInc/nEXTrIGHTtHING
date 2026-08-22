// POST /intake-queue/admit -> turn an inbound request into an actual client.
//
// This is the seam the whole system used to have a hole in. Somebody marked an
// intake "intaked", and then a human retyped that person into Housing, and then
// a case manager retyped them again into a case note, and every one of those
// copies found each other by matching a name as text. One misspelling and a
// person's funding history quietly detached from their housing record.
//
// One action now: create the client, create their bed, link the intake to them,
// and open their case file with everything they already told us on the phone.
// Nobody types a name twice, so nothing can drift.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});

  const ALLOWED = allowedFor('intake-queue');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to the Intake Queue.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ok:false,error:'bad request'},400); }
  if (!b.intake_id) return json({ok:false,error:'intake_id required'},400);

  const S = (v,n)=> v==null?null:((''+v).trim().slice(0,n)||null);
  const N = v => (v===''||v==null)?null:(Number(String(v).replace(/[^0-9.]/g,''))||null);
  const H = { 'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const HR = Object.assign({}, H, {'Prefer':'return=representation'});
  const url = t => env.SUPABASE_URL+'/rest/v1/'+t;
  const today = new Date().toISOString().slice(0,10);

  // 1. the intake request itself
  const q = await fetch(url('intake_requests')+'?select=*&id=eq.'+encodeURIComponent(b.intake_id), {headers:H});
  const rows = q.ok ? await q.json() : [];
  const ir = rows[0];
  if (!ir) return json({ok:false,error:'That intake request no longer exists.'},404);
  if (ir.client_id) return json({ok:false,error:'Already admitted — this request is linked to a client.',client_id:ir.client_id},409);

  const name = S(((ir.first_name||'')+' '+(ir.last_name||'')).trim(),160) || S(b.name,160);
  if (!name) return json({ok:false,error:'This request has no name on it. Add one before admitting.'},400);

  // 2. the client - one identity, from here to the day they leave
  const cRes = await fetch(url('clients'), {method:'POST',headers:HR,body:JSON.stringify({
    first_name:S(ir.first_name,80), last_name:S(ir.last_name,80), name,
    phone:S(ir.phone,60), email:S(ir.email,200),
    status:'active', intake_request_id:ir.id, admitted_on:S(b.move_in_date,20)||today,
    created_by:who, updated_by:who
  })});
  if (!cRes.ok) return json({ok:false,error:'Could not create the client record',detail:await cRes.text()},500);
  const client = (await cRes.json())[0];

  // 3. their bed
  const rRes = await fetch(url('residents'), {method:'POST',headers:HR,body:JSON.stringify({
    client_id: client.id, name,
    house_name:S(b.house_name,120), room:S(b.room,40), status:'active',
    move_in_date:S(b.move_in_date,20)||today,
    phone:S(ir.phone,60), email:S(ir.email,200),
    monthly_rent:N(b.monthly_rent), current_due:N(b.monthly_rent),
    case_manager:S(b.case_manager,160), treatment_level:S(b.treatment_level,60),
    last_contact:today, last_talked:today, updated_by:who
  })});
  if (!rRes.ok) {
    // Do not leave a client stranded without a bed record.
    await fetch(url('clients')+'?id=eq.'+client.id, {method:'DELETE',headers:H});
    return json({ok:false,error:'Could not create the housing record',detail:await rRes.text()},500);
  }
  const resident = (await rRes.json())[0];

  // 4. open the case file with what they already told us.
  // A case manager should never start from a blank page on somebody who spent
  // ten minutes on the phone answering these exact questions.
  const facts = [
    ir.reaching_as==='family' ? 'Referred by a family member' : null,
    ir.source ? 'Came from: '+ir.source+(ir.referred_by?' ('+ir.referred_by+')':'') : null,
    ir.insurance ? 'Insurance: '+ir.insurance+(ir.insurance_company?' — '+ir.insurance_company:'') : null,
    ir.primary_substance ? 'Primary substance: '+ir.primary_substance : null,
    ir.last_use ? 'Last use at intake: '+ir.last_use : null,
    ir.probation_parole ? 'Probation / parole: '+ir.probation_parole : null,
    ir.needs_housing ? 'Needed housing: '+ir.needs_housing : null,
    ir.employment_status ? 'Employment at intake: '+ir.employment_status : null,
    ir.motivation ? 'In their words: '+ir.motivation : null,
    ir.message ? 'Message left: '+ir.message : null
  ].filter(Boolean);

  await fetch(url('case_notes'), {method:'POST',headers:H,body:JSON.stringify({
    client_id: client.id, resident_name: name, note_date: today, contact_type:'in person',
    summary: 'Admitted from intake.\n\n' + (facts.length?facts.join('\n'):'No detail was captured at intake.'),
    next_step: 'First case-manager contact and needs assessment',
    next_step_due: today, author: who
  })});

  // 5. close the loop on the request so the queue and the client agree
  await fetch(url('intake_requests')+'?id=eq.'+encodeURIComponent(ir.id), {
    method:'PATCH', headers:H,
    body: JSON.stringify({ status:'intaked', client_id: client.id })
  });

  // 6. carry any funding application they already have onto the client
  await fetch(url('funding_applications')+'?client_id=is.null&resident_name=eq.'+encodeURIComponent(name), {
    method:'PATCH', headers:H, body: JSON.stringify({ client_id: client.id })
  });

  return json({ ok:true, client_id:client.id, resident_id:resident.id, name });
}
