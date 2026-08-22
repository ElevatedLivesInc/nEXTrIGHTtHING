// POST /case/update -> write case notes, goals, meetings and document records.
//
// Same wall as /case/list: this endpoint can never touch a money column on
// residents. The allow-list below is the enforcement, so a crafted request
// body cannot reach past_due even if someone tries.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

// Non-financial resident fields a case manager may edit.
const EDITABLE = ['phone','email','emergency_contact','has_id','has_ss_card','has_birth_cert',
  'bank_account','employed','employer','job_start_date','certifications','savings_balance',
  'case_manager','treatment_level','notes','last_contact','last_talked',
  'case_needs','case_followup_date'];

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});

  const ALLOWED = allowedFor('case-management');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to Case Management.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ok:false,error:'bad request'},400); }

  const H = { 'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal' };
  const url = t => env.SUPABASE_URL+'/rest/v1/'+t;
  const S = (v,n)=> (v==null?null:(''+v).trim().slice(0,n) || null);
  const post  = async (t,rec)=>fetch(url(t),{method:'POST',headers:H,body:JSON.stringify(rec)});
  const patch = async (t,id,rec)=>fetch(url(t)+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:H,body:JSON.stringify(rec)});
  const del   = async (t,id)=>fetch(url(t)+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:H});
  const done  = async r => r.ok ? json({ok:true}) : json({ok:false,error:'write failed',detail:await r.text()},500);

  const what = b.what;

  // A resident admitted through /intake-queue/admit carries a client_id -
  // pass it through so this row hangs off the same spine as everything else
  // in their file, instead of only ever being findable by matching resident_name
  // text. Rows from before the spine existed simply keep client_id null and
  // still surface fine on resident_name, same as always.
  const cid = v => (v==null||v==='') ? null : S(v,64);

  if (what === 'note') {
    if (!b.resident_name || !b.summary) return json({ok:false,error:'resident and summary required'},400);
    return done(await post('case_notes', {
      resident_name:S(b.resident_name,160), client_id:cid(b.client_id), note_date:S(b.note_date,20)||undefined,
      contact_type:S(b.contact_type,30)||'in person', summary:S(b.summary,4000),
      next_step:S(b.next_step,1000), next_step_due:S(b.next_step_due,20), author:who
    }));
  }

  if (what === 'goal') {
    if (b.action === 'delete') { if(!b.id) return json({ok:false,error:'id required'},400); return done(await del('client_goals', b.id)); }
    const rec = { resident_name:S(b.resident_name,160), client_id:cid(b.client_id), domain:S(b.domain,30)||'other',
      goal:S(b.goal,1000), status:S(b.status,20)||'open', target_date:S(b.target_date,20),
      met_date:S(b.met_date,20), notes:S(b.notes,2000), updated_by:who };
    if (!rec.resident_name || !rec.goal) return json({ok:false,error:'resident and goal required'},400);
    return done(b.id ? await patch('client_goals', b.id, rec) : await post('client_goals', rec));
  }

  if (what === 'meeting') {
    if (b.action === 'delete') { if(!b.id) return json({ok:false,error:'id required'},400); return done(await del('meetings', b.id)); }
    if (!b.resident_name || !b.meeting_date) return json({ok:false,error:'resident and date required'},400);
    // The counter on residents stays in step with the rows, so the number on
    // the housing screen and the list of dates can never disagree.
    const rec = { resident_name:S(b.resident_name,160), client_id:cid(b.client_id), house_name:S(b.house_name,120),
      kind:S(b.kind,20)||'house', meeting_date:S(b.meeting_date,20),
      verified_by:S(b.verified_by,120)||who, notes:S(b.notes,1000), created_by:who };
    const r = await post('meetings', rec);
    if (!r.ok) return json({ok:false,error:'write failed',detail:await r.text()},500);
    try {
      const q = await fetch(url('residents')+'?select=id,house_meetings,peer_meetings&name=eq.'+encodeURIComponent(rec.resident_name),
        {headers:{'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
      const rows = q.ok ? await q.json() : [];
      if (rows[0]) {
        const up = { last_meeting: rec.meeting_date };
        if (rec.kind === 'peer') up.peer_meetings = (Number(rows[0].peer_meetings)||0)+1;
        else                     up.house_meetings = (Number(rows[0].house_meetings)||0)+1;
        await patch('residents', rows[0].id, up);
      }
    } catch (_) { /* the meeting row is the record of truth; the counter is a convenience */ }
    return json({ ok:true });
  }

  if (what === 'document') {
    if (b.action === 'delete') { if(!b.id) return json({ok:false,error:'id required'},400); return done(await del('documents', b.id)); }
    if (!b.resident_name) return json({ok:false,error:'resident required'},400);
    return done(await post('documents', {
      resident_name:S(b.resident_name,160), client_id:cid(b.client_id), house_name:S(b.house_name,120),
      doc_type:S(b.doc_type,20)||'other', title:S(b.title,300), file_path:S(b.file_path,500),
      mime_type:S(b.mime_type,120), size_bytes:(b.size_bytes==null?null:Number(b.size_bytes)||null),
      signed_on:S(b.signed_on,20), expires_on:S(b.expires_on,20),
      uploaded_by:who, notes:S(b.notes,2000)
    }));
  }

  if (what === 'work') {
    if (!b.id) return json({ok:false,error:'id required'},400);
    const rec = { status:S(b.status,20), background_ok:S(b.background_ok,20),
      first_shift_date:S(b.first_shift_date,20), resident_name:S(b.resident_name,160),
      notes:S(b.notes,2000), updated_by:who };
    Object.keys(rec).forEach(k=>{ if(rec[k]==null) delete rec[k]; });
    const r = await patch('work_signups', b.id, rec);
    if (!r.ok) return json({ok:false,error:'write failed',detail:await r.text()},500);
    // Placing somebody on the crew is the moment "unemployed" stops being true.
    // Write it back to the resident record so the readiness board and the
    // morning brief both stop nagging about a job that now exists.
    if (rec.status === 'placed' && b.resident_id) {
      await patch('residents', b.resident_id, {
        employed: true, employer: 'Rent A Husband',
        job_start_date: rec.first_shift_date || new Date().toISOString().slice(0,10)
      });
    }
    return json({ ok:true });
  }

  if (what === 'compliance') {
    if (b.action === 'delete') { if(!b.id) return json({ok:false,error:'id required'},400); return done(await del('compliance_items', b.id)); }
    const rec = { entity:S(b.entity,30)||'treatment_center', item_type:S(b.item_type,30)||'other',
      name:S(b.name,300), provider:S(b.provider,200), policy_number:S(b.policy_number,120),
      coverage:S(b.coverage,300), effective_on:S(b.effective_on,20), expires_on:S(b.expires_on,20),
      status:S(b.status,20)||'active', owner:S(b.owner,160), notes:S(b.notes,2000), updated_by:who };
    if (!rec.name) return json({ok:false,error:'name required'},400);
    return done(b.id ? await patch('compliance_items', b.id, rec) : await post('compliance_items', rec));
  }

  if (what === 'client') {
    if (!b.id) return json({ok:false,error:'id required'},400);
    const rec = {};
    for (const k of EDITABLE) if (Object.prototype.hasOwnProperty.call(b, k)) {
      if (typeof b[k] === 'boolean') rec[k] = b[k];
      else if (k === 'savings_balance') rec[k] = Number(b[k]) || 0;
      // case_needs is jsonb - a map of need key to status. Pass the object
      // through rather than stringifying it, and drop anything that is not a
      // plain object so a bad body cannot corrupt the column.
      else if (k === 'case_needs') { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) rec[k] = b[k]; }
      else rec[k] = S(b[k], 2000);
    }
    if (!Object.keys(rec).length) return json({ok:false,error:'nothing to update'},400);
    return done(await patch('residents', b.id, rec));
  }

  return json({ok:false,error:'unknown request'},400);
}
