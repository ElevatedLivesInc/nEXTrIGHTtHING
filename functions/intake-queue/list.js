// GET /api/intake-list -> newest intake requests for the private /intake-queue page.
// FAIL-CLOSED: refuses to serve unless the request came through Cloudflare Access.
// Protect BOTH /intake-queue and /api/intake-* with a Cloudflare Access application.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('intake-queue');
  const who = await getAuthedEmail(request, env);
  const authorized = who && ALLOWED.includes(who);
  if (!authorized) return json({ error: 'Not signed in. Open the staff page URL itself first to log in, then reload.' }, 401);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/intake_requests?select=*&order=created_at.desc&limit=300', {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  if (!res.ok) { const detail = await res.text(); return json({ error: 'load failed', detail }, 500); }
  const rows = await res.json();
  return json({ viewer: who, requests: Array.isArray(rows) ? rows : [] });
}
