// GET /api/inkind-list -> all in-kind authorizations/receipts for the private /in-kind-report page.
// FAIL-CLOSED: refuses to serve unless the request came through Cloudflare Access.
// Protect BOTH /in-kind-report and /api/inkind-list with the Cloudflare Access application.
export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = ['gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com'];
  const who = await getAuthedEmail(request);
  const authorized = who && ALLOWED.includes(who);
  if (!authorized) return json({ error: 'Not signed in. Open the staff page URL itself first to log in, then reload.' }, 401);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/authorizations?select=*&limit=1000', {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  if (!res.ok) { const detail = await res.text(); return json({ error: 'load failed', detail }, 500); }
  const rows = await res.json();
  return json({ viewer: who, records: Array.isArray(rows) ? rows : [] });
}

// --- staff auth: accepts Access header OR verifies the CF_Authorization login cookie ---
async function getAuthedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')), c => c.charCodeAt(0));
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  } catch (_) { return null; }
  if (!payload.iss || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(payload.iss)) return null;
  if (!payload.exp || payload.exp < Date.now() / 1000) return null;
  try {
    const certsRes = await fetch(payload.iss + '/cdn-cgi/access/certs');
    if (!certsRes.ok) return null;
    const certs = await certsRes.json();
    const jwk = (certs.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
  } catch (_) { return null; }
  return (payload.email || '').toLowerCase();
}
