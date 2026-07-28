// GET /housing/list -> houses + residents + recent events
export async function onRequestGet(context) {
  const { request, env } = context;
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  // Treatment-center data. Nonprofit-only staff must NOT be on this list.
  const ALLOWED = ['gabe@nextrighthing.com','cateo@nextrighthing.com','rob@nextrighthing.com','bailey@nextrighthing.com'];
  const who = await getAuthedEmail(request);
  if (!who) return json({ error:'Not signed in. Open a staff page to log in, then reload.' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to Housing.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h={ 'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const [ho,re,ev]=await Promise.all([
    fetch(env.SUPABASE_URL+'/rest/v1/houses?select=*&order=sort_order.asc&limit=100',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/residents?select=*&limit=1000',{headers:h}),
    fetch(env.SUPABASE_URL+'/rest/v1/house_events?select=*&order=created_at.desc&limit=200',{headers:h})
  ]);
  if(!ho.ok||!re.ok) return json({ error:'load failed', detail:(await ho.text())+(await re.text()) },500);
  return json({ viewer:who, houses:await ho.json(), residents:await re.json(), events: ev.ok? await ev.json():[] });
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
