// GET /case/list -> a case manager's whole world, and nothing else.
//
// The wall Cate drew: "I can't have case managers having access to the rental
// stuff." That wall is enforced HERE, in the column list sent to Postgres, not
// in the page that renders it. A UI that hides a field still shipped the field
// to the browser, where anyone can read it in devtools. If the balance is
// never selected, it can never leak.
//
// Deliberately excluded from residents: monthly_rent, past_due, current_due,
// amount_paid, paid_flag, pay_schedule, net_income.
// Deliberately included: savings_balance — a client's own savings is a case
// management goal, not a debt to the house.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

const RESIDENT_COLS = [
  'id','client_id','name','house_name','room','status','move_in_date','move_out_date',
  'phone','email','emergency_contact',
  'has_id','has_ss_card','has_birth_cert','bank_account',
  'employed','employer','job_start_date','certifications','savings_balance',
  'case_manager','treatment_level','notes','last_contact',
  'house_meetings','peer_meetings','last_meeting','meetings_reset',
  'last_ua','ua_result','curfew_ok','chores_ok','on_notice',
  'warnings','last_warning','warning_reason','last_talked',
  'payer_type','funding_source','funding_end',
  // Shared with the Case Management tab on Housing: same columns, two views,
  // so the two screens can never drift out of sync.
  'case_needs','case_followup_date'
].join(',');

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});

  const ALLOWED = allowedFor('case-management');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in. Open a staff page to log in, then reload.' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to Case Management.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async p => { try { const r = await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok ? await r.json() : []; } catch(_) { return []; } };

  const [clients, notes, goals, meetings, docs, apps, funders, work, compliance] = await Promise.all([
    get('residents?select='+RESIDENT_COLS+'&limit=1000'),
    get('case_notes?select=*&order=note_date.desc&limit=2000'),
    get('client_goals?select=*&order=created_at.desc&limit=2000'),
    get('meetings?select=*&order=meeting_date.desc&limit=3000'),
    // Metadata only. The files themselves live in a private bucket and are
    // fetched through a signed URL when someone actually opens one.
    get('documents?select=id,resident_name,doc_type,title,file_path,mime_type,size_bytes,signed_on,expires_on,uploaded_by,uploaded_at,notes&order=uploaded_at.desc&limit=2000'),
    get('funding_applications?select=*&order=created_at.desc&limit=1000'),
    get('funders?select=*&order=name.asc&limit=500'),
    get('work_signups?select=*&order=created_at.desc&limit=1000'),
    get('compliance_items?select=*&order=expires_on.asc&limit=500')
  ]);

  return json({ viewer:who, clients, notes, goals, meetings, documents:docs, applications:apps, funders, work, compliance });
}
