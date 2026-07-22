// POST /api/intake-update { id, status } -> updates a request's workflow status.
// Allowed statuses: new, contacted, scheduled, closed.
// FAIL-CLOSED behind Cloudflare Access, same as intake-list.
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const who = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!who) return json({ ok: false, error: 'unauthorized' }, 401);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  const id = (body.id || '').toString().trim();
  const status = (body.status || '').toString().trim();
  const allowed = ['new', 'contacted', 'scheduled', 'closed'];
  if (!id || !allowed.includes(status)) return json({ ok: false, error: 'invalid id or status' }, 400);

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/intake_requests?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ status })
  });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'update failed', detail }, 500); }
  return json({ ok: true });
}
