// POST /housing/update -> update a resident, log an event, or delete
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

// Case management needs & services. Kept in lockstep with the NEEDS list in housing.html.
const NEED_KEYS=['health_insurance','primary_care','dental_care','mental_health','psychiatry',
  'snap','disability','tanf','unemployment',
  'drivers_license','warrants','probation','child_support',
  'family_plan','transportation','childcare',
  'ged','resume',
  'sponsor','aftercare_plan'];
const NEED_STATUSES=['needed','referred','scheduled','done','na'];
function sanitizeNeeds(obj){
  if(!obj||typeof obj!=='object') return undefined;
  const out={};
  for(const k of NEED_KEYS){ if(NEED_STATUSES.includes(obj[k])) out[k]=obj[k]; }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  // Treatment-center data. Nonprofit-only staff must NOT be on this list.
  const ALLOWED = allowedFor('housing');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to Housing.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);
  let b; try{ b=await request.json(); }catch{ return json({ok:false,error:'bad request'},400); }
  const H={'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal'};
  const S=(v,n)=> v==null?null:((''+v).trim().slice(0,n)||null);
  const N=v=> (v===''||v==null)?null:(Number(String(v).replace(/[^0-9.\-]/g,''))||0);
  const B=v=> v===true;

  // log an event (payment, maintenance, welfare check…)
  if (b.event) {
    const rec={ house_name:S(b.house_name,120), resident_name:S(b.resident_name,160),
      kind:S(b.kind,40)||'note', amount:N(b.amount), detail:S(b.detail,2000), logged_by:who };
    const r=await fetch(env.SUPABASE_URL+'/rest/v1/house_events',{method:'POST',headers:H,body:JSON.stringify(rec)});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'log failed',detail:d},500);}
    // A payment gets a proper ledger row as well as an activity entry.
    // house_events is the feed; payments is the record. Cate asked to see
    // "each payment made, and by who" - a feed entry cannot carry the method,
    // the date it was actually taken, or survive a correction, and a running
    // total on residents cannot be audited at all.
    if (rec.kind==='payment' && rec.amount) {
      await fetch(env.SUPABASE_URL+'/rest/v1/payments',{method:'POST',headers:H,body:JSON.stringify({
        resident_name: rec.resident_name, house_name: rec.house_name,
        amount: rec.amount,
        paid_on: S(b.paid_on,20) || new Date().toISOString().slice(0,10),
        method: S(b.method,30), kind: S(b.pay_kind,20) || 'rent',
        taken_by: S(b.taken_by,120) || who,
        reference: S(b.reference,120), note: rec.detail, created_by: who
      })});
    }
    // a logged payment also reduces the balance
    if (rec.kind==='payment' && b.resident_id && rec.amount) {
      const g=await fetch(env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.resident_id)+'&select=amount_paid',{headers:H});
      if(g.ok){ const rows=await g.json(); const prev=(rows[0]&&Number(rows[0].amount_paid))||0;
        await fetch(env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.resident_id),{method:'PATCH',headers:H,body:JSON.stringify({amount_paid:prev+rec.amount,last_contact:new Date().toISOString().slice(0,10)})}); }
    }
    return json({ ok:true });
  }

  if (!b.id) return json({ok:false,error:'id required'},400);
  const base=env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.id);

  // ---- one-tap house actions. Stamps the date, bumps the count, writes the event.
  if (b.quick) {
    const today=new Date().toISOString().slice(0,10);
    const month=today.slice(0,7);
    const g=await fetch(base+'&select=*',{headers:H});
    if(!g.ok) return json({ok:false,error:'resident not found'},404);
    const rows=await g.json(); const cur=rows[0];
    if(!cur) return json({ok:false,error:'resident not found'},404);

    // meeting counts are per calendar month - roll them over automatically
    let hm=Number(cur.house_meetings)||0, pm=Number(cur.peer_meetings)||0;
    if((cur.meetings_reset||'').slice(0,7)!==month){ hm=0; pm=0; }

    const patch={ meetings_reset:today, updated_by:who };
    let kind='note', detail=S(b.detail,2000)||'';

    switch(b.quick){
      case 'talk':
        patch.last_talked=today; kind='welfare';
        detail=detail||'Checked in with resident'; break;
      case 'house_meeting':
        patch.house_meetings=hm+1; patch.last_meeting=today; patch.last_talked=today;
        kind='meeting'; detail=detail||'Attended house meeting'; break;
      case 'peer_meeting':
        patch.peer_meetings=pm+1; patch.last_meeting=today;
        kind='meeting'; detail=detail||'Attended peer support meeting'; break;
      // "clean"/"dirty" describe a person; "negative"/"positive" describe a test.
      // The old keys stay accepted so a stale browser tab cannot 400.
      case 'ua_negative':
      case 'ua_clean':
        patch.last_ua=today; patch.ua_result='negative';
        kind='ua'; detail=detail||'UA negative'; break;
      case 'ua_positive':
      case 'ua_dirty':
        patch.last_ua=today; patch.ua_result='positive';
        kind='ua'; detail=detail||'UA positive'; break;
      case 'warn':
        patch.warnings=(Number(cur.warnings)||0)+1;
        patch.last_warning=today; patch.last_talked=today;
        if(detail) patch.warning_reason=detail;
        kind='warning'; detail=detail||'Warning issued'; break;
      case 'undo_warn':
        patch.warnings=Math.max(0,(Number(cur.warnings)||0)-1);
        kind='note'; detail='Warning removed'; break;
      case 'notice':
        patch.on_notice=!cur.on_notice;
        kind='notice'; detail=patch.on_notice?'Placed on notice':'Taken off notice'; break;
      default:
        return json({ok:false,error:'unknown action'},400);
    }
    if(patch.house_meetings===undefined) patch.house_meetings=hm;
    if(patch.peer_meetings===undefined)  patch.peer_meetings=pm;

    const u=await fetch(base,{method:'PATCH',headers:H,body:JSON.stringify(patch)});
    if(!u.ok){const d=await u.text();return json({ok:false,error:'update failed',detail:d},500);}
    // history, so a warning is never just one person's word
    await fetch(env.SUPABASE_URL+'/rest/v1/house_events',{method:'POST',headers:H,body:JSON.stringify({
      house_name:S(b.house_name,120)||cur.house_name, resident_name:S(b.resident_name,160)||cur.name,
      kind, detail, logged_by:who })});
    const g2=await fetch(base+'&select=*',{headers:H});
    const rows2=g2.ok?await g2.json():[];
    return json({ ok:true, resident: rows2[0]||Object.assign({},cur,patch) });
  }

  if (b.action==='delete') {
    const r=await fetch(base,{method:'DELETE',headers:H});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'delete failed',detail:d},500);}
    return json({ ok:true });
  }

  const p={}; const put=(k,v)=>{ if(v!==undefined) p[k]=v; };
  put('name',S(b.name,160)); put('room',S(b.room,40)); put('house_name',S(b.house_name,120));
  put('status',['active','open','moved_out','evicted','graduated'].includes(b.status)?b.status:undefined);
  put('phone',S(b.phone,60)); put('email',S(b.email,200)); put('emergency_contact',S(b.emergency_contact,240));
  put('move_in_date',S(b.move_in_date,20)); put('move_out_date',S(b.move_out_date,20));
  if(b.monthly_rent!==undefined)put('monthly_rent',N(b.monthly_rent));
  if(b.past_due!==undefined)put('past_due',N(b.past_due));
  if(b.current_due!==undefined)put('current_due',N(b.current_due));
  if(b.amount_paid!==undefined)put('amount_paid',N(b.amount_paid));
  if(b.net_income!==undefined)put('net_income',N(b.net_income));
  if(b.savings_balance!==undefined)put('savings_balance',N(b.savings_balance));
  put('pay_schedule',S(b.pay_schedule,20)); put('payer_type',S(b.payer_type,40));
  put('funding_source',S(b.funding_source,160)); put('funding_end',S(b.funding_end,20));
  put('case_manager',S(b.case_manager,120)); put('treatment_level',S(b.treatment_level,40));
  put('employer',S(b.employer,160)); put('job_start_date',S(b.job_start_date,20));
  put('certifications',S(b.certifications,400)); put('notes',S(b.notes,4000));
  put('case_followup_date',S(b.case_followup_date,20));
  if(b.case_needs!==undefined) put('case_needs',sanitizeNeeds(b.case_needs));
  // House Record
  if(b.warnings!==undefined)       put('warnings',N(b.warnings));
  if(b.house_meetings!==undefined) put('house_meetings',N(b.house_meetings));
  if(b.peer_meetings!==undefined)  put('peer_meetings',N(b.peer_meetings));
  put('last_warning',S(b.last_warning,20)); put('warning_reason',S(b.warning_reason,600));
  put('last_talked',S(b.last_talked,20)); put('last_ua',S(b.last_ua,20)); put('ua_result',S(b.ua_result,20));
  ['has_id','has_ss_card','has_birth_cert','bank_account','employed','curfew_ok','chores_ok','on_notice'].forEach(k=>{ if(b[k]!==undefined) p[k]=B(b[k]); });
  p.updated_by=who;
  if(Object.keys(p).length<=1) return json({ok:false,error:'nothing to update'},400);
  const r=await fetch(base,{method:'PATCH',headers:H,body:JSON.stringify(p)});
  if(!r.ok){const d=await r.text();return json({ok:false,error:'update failed',detail:d},500);}
  return json({ ok:true });
}
