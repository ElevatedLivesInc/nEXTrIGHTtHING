// POST /funding/update -> create/update/delete funders and applications
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  // Client scholarship applications = treatment-center data. Not for donor-side staff.
  const ALLOWED = ['gabe@nextrighthing.com','cateo@nextrighthing.com','bailey@nextrighthing.com','rob@nextrighthing.com'];
  const who = await getAuthedEmail(request);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to the Funding Navigator.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);
  let b; try { b = await request.json(); } catch { return json({ok:false,error:'bad request'},400); }

  const table = b.table === 'funders' ? 'funders' : b.table === 'applications' ? 'funding_applications' : null;
  if (!table) return json({ ok:false, error:'invalid table' },400);
  const H = { 'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal' };
  const base = env.SUPABASE_URL+'/rest/v1/'+table;
  const clean = (v,n)=> (v==null?null:(''+v).trim().slice(0,n) || null);

  if (b.action === 'delete') {
    if (!b.id) return json({ok:false,error:'id required'},400);
    const r = await fetch(base+'?id=eq.'+encodeURIComponent(b.id),{method:'DELETE',headers:H});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'delete failed',detail:d},500);}
    return json({ ok:true });
  }

  let rec;
  if (table === 'funders') {
    rec = {
      name: clean(b.name,160), category: clean(b.category,60), website: clean(b.website,300),
      contact_name: clean(b.contact_name,120), contact_email: clean(b.contact_email,200), contact_phone: clean(b.contact_phone,60),
      eligibility: clean(b.eligibility,2000), rules: clean(b.rules,2000), typical_amount: clean(b.typical_amount,80),
      once_per_client: b.once_per_client === true, active: b.active !== false, notes: clean(b.notes,2000)
    };
    if (!rec.name) return json({ok:false,error:'name required'},400);
  } else {
    rec = {
      resident_name: clean(b.resident_name,160), funder_name: clean(b.funder_name,160),
      status: ['applied','approved','denied','expired','waitlist'].includes(b.status)? b.status : 'applied',
      applied_date: clean(b.applied_date,20), decision_date: clean(b.decision_date,20),
      amount: (b.amount===''||b.amount==null)?null:Number(String(b.amount).replace(/[^0-9.]/g,''))||null,
      coverage_start: clean(b.coverage_start,20), coverage_end: clean(b.coverage_end,20),
      level_of_care: clean(b.level_of_care,60), notes: clean(b.notes,2000), updated_by: who
    };
    if (!rec.resident_name || !rec.funder_name) return json({ok:false,error:'resident and funder required'},400);
  }

  if (b.id) {
    const r = await fetch(base+'?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',headers:H,body:JSON.stringify(rec)});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'update failed',detail:d},500);}
  } else {
    const r = await fetch(base,{method:'POST',headers:H,body:JSON.stringify(rec)});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'create failed',detail:d},500);}
  }
  return json({ ok:true });
}

// --- staff auth: Access header OR verified CF_Authorization cookie ---
async function getAuthedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const b64u = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length+(4-s.length%4)%4,'=')), c => c.charCodeAt(0));
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  } catch (_) { return null; }
  if (!payload.iss || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(payload.iss)) return null;
  if (!payload.exp || payload.exp < Date.now()/1000) return null;
  try {
    const certsRes = await fetch(payload.iss + '/cdn-cgi/access/certs');
    if (!certsRes.ok) return null;
    const certs = await certsRes.json();
    const jwk = (certs.keys||[]).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0]+'.'+parts[1]));
    if (!ok) return null;
  } catch (_) { return null; }
  return (payload.email||'').toLowerCase();
}
