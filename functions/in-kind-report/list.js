// GET /api/inkind-list -> all in-kind authorizations/receipts for the private /in-kind-report page.
// FAIL-CLOSED: refuses to serve unless the request came through Cloudflare Access.
// Protect BOTH /in-kind-report and /api/inkind-list with the Cloudflare Access application.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('in-kind-report');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error: 'Not signed in. Open a staff page to log in, then reload.' }, 401);
  if (!ALLOWED.includes(who)) return json({ error: 'Your account does not have access to the In-Kind Report.' }, 403);

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
