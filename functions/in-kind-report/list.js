// GET /api/inkind-list -> all in-kind authorizations/receipts for the private /in-kind-report page.
// FAIL-CLOSED: refuses to serve unless the request came through Cloudflare Access.
// Protect BOTH /in-kind-report and /api/inkind-list with the Cloudflare Access application.
export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const who = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!who) return json({ error: 'This route must be protected by Cloudflare Access. Set up the Access application, then log in.' }, 401);

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
