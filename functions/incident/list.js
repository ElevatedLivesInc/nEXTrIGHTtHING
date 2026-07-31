// GET /incident/list -> all incident reports, newest occurrence first
export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  const ALLOWED = [
    'gabe@nextrighthing.com',
    'cateo@nextrighthing.com',
    'rob@nextrighthing.com',
    'bailey@nextrighthing.com'
  ];
  const who = await getAuthedEmail(request);
  if (!who) return json({ error:'not signed in' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to incident reports.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async p => { try { const r = await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok ? await r.json() : []; } catch(_) { return []; } };

  // Incidents are ordered by when they HAPPENED, not when they were written up.
  const [incidents, concerns] = await Promise.all([
    get('incidents?select=*&order=incident_date.desc,reported_at.desc&limit=1000'),
    get('concerns?select=*&order=submitted_at.desc&limit=500')
  ]);
  return json({ viewer: who, incidents, concerns });
}

// --- staff auth: Access header OR verified CF_Authorization cookie ---
async function getAuthedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  try {
    const token = m[1];
    const [h64, p64, s64] = token.split('.');
    if (!h64 || !p64 || !s64) return null;
    const b64url = s => { s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '='; return s; };
    const bytes  = s => Uint8Array.from(atob(b64url(s)), c => c.charCodeAt(0));
    const header  = JSON.parse(atob(b64url(h64)));
    const payload = JSON.parse(atob(b64url(p64)));
    if (!payload.iss || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(payload.iss)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    const certs = await fetch(payload.iss + '/cdn-cgi/access/certs').then(r => r.json());
    const jwk = (certs.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
      bytes(s64), new TextEncoder().encode(h64 + '.' + p64));
    if (!ok) return null;
    return (payload.email || '').toLowerCase() || null;
  } catch (_) { return null; }
}
