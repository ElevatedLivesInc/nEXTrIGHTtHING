// GET /api/carwash-report -> full signup list for the private scoreboard.
// PROTECT /carwash-report page behind Cloudflare Access. Uses service key server-side.
export async function onRequestGet(context) {
  const { env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/carwash_list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({})
  });
  if (!res.ok) { const detail = await res.text(); return json({ error: 'load failed', detail }, 500); }
  const rows = await res.json();
  return json({ signups: Array.isArray(rows) ? rows : [] });
}
