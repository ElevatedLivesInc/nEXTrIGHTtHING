// POST /api/carwash-signup -> saves an RSVP or volunteer signup (with time slot) to Supabase.
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const type = (body.type === 'volunteer') ? 'volunteer' : 'rsvp';
  const name = (body.name || '').toString().trim().slice(0, 120);
  const contact = (body.contact || '').toString().trim().slice(0, 200);
  const day = (body.day || 'Either').toString().trim().slice(0, 40);
  const slot = (body.slot || '').toString().trim().slice(0, 20);
  if (!name) return json({ ok: false, error: 'name required' }, 400);
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/carwash_signups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ signup_type: type, name, contact, day, slot })
  });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'save failed', detail }, 500); }
  return json({ ok: true });
}
