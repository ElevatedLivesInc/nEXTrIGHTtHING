// GET /drawing/list -> staff view of prize-drawing entries and page-view
// counts for the yard sale campaign.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('drawing-entries');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error: 'Not signed in. Open a staff page to log in, then reload.' }, 401);
  if (!ALLOWED.includes(who)) return json({ error: 'Your account does not have access to this.' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);

  const h = { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
  const [eRes, vRes] = await Promise.all([
    fetch(env.SUPABASE_URL + '/rest/v1/drawing_entries?select=*&order=created_at.desc&limit=2000', { headers: h }),
    fetch(env.SUPABASE_URL + '/rest/v1/page_views?select=page&limit=100000', { headers: h })
  ]);
  if (!eRes.ok) { const d = await eRes.text(); return json({ error: 'entries load failed', detail: d }, 500); }
  const entries = await eRes.json();
  const views = vRes.ok ? await vRes.json() : [];

  const viewsByPage = {};
  views.forEach(v => { viewsByPage[v.page] = (viewsByPage[v.page] || 0) + 1; });

  return json({ viewer: who, entries, viewsByPage });
}
