// POST /api/intake -> saves a pre-intake request (self/family) to Supabase.
// Uses the same env vars already configured for the car wash:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  const clean = (v, max) => (v || '').toString().trim().slice(0, max);
  const record = {
    first_name:        clean(body.first_name, 120),
    last_name:         clean(body.last_name, 120),
    email:             clean(body.email, 200),
    phone:             clean(body.phone, 60),
    reaching_as:       clean(body.reaching_as, 20),
    insurance:         clean(body.insurance, 60),
    insurance_company: clean(body.insurance_company, 120),
    needs_housing:     clean(body.needs_housing, 20),
    probation_parole:  clean(body.probation_parole, 30),
    primary_substance: clean(body.primary_substance, 120),
    last_use:          clean(body.last_use, 40),
    motivation:        clean(body.motivation, 500),
    best_time:         clean(body.best_time, 20),
    message:           clean(body.message, 2000)
  };
  if (!record.first_name && !record.email && !record.phone) return json({ ok: false, error: 'empty' }, 400);

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/intake_requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'save failed', detail }, 500); }
  return json({ ok: true });
}
