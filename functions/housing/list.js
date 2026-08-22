// GET /housing/list -> houses + residents + recent events
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  // Treatment-center data. Nonprofit-only staff must NOT be on this list.
  const ALLOWED = allowedFor('housing');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in. Open a staff page to log in, then reload.' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to Housing.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h={ 'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  // Funders and applications ride along so Housing can answer the question that
  // actually gets money in the door: who is still eligible for what. The
  // housing and funding rosters are the same four people, so this crosses no
  // access boundary.
  const [ho,re,ev,fu,ap,pay]=await Promise.all([
    fetch(env.SUPABASE_URL+'/rest/v1/houses?select=*&order=sort_order.asc&limit=100',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/residents?select=*&limit=1000',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/house_events?select=*&order=created_at.desc&limit=200',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/funders?select=*&order=name.asc&limit=500',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/funding_applications?select=*&order=created_at.desc&limit=1000',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/payments?select=*&order=paid_on.desc&limit=2000',{headers:h})
  ]);
  if(!ho.ok||!re.ok) return json({ error:'load failed', detail:(await ho.text())+(await re.text()) },500);
  return json({ viewer:who, houses:await ho.json(), residents:await re.json(),
                events: ev.ok? await ev.json():[],
                funders: fu.ok? await fu.json():[],
                applications: ap.ok? await ap.json():[],
                payments: pay.ok? await pay.json():[] });
}
