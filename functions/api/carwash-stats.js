// GET /api/carwash-stats -> { rsvps, volunteers, slots:{ "day|time": count } }
export async function onRequestGet(context) {
  const { env } = context;
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ rsvps: 0, volunteers: 0, slots: {} });
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/carwash_counts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({})
  });
  if (!res.ok) return json({ rsvps: 0, volunteers: 0, slots: {} });
  const rows = await res.json();
  const r = Array.isArray(rows) ? rows[0] : rows;
  return json({ rsvps: (r && r.rsvps) || 0, volunteers: (r && r.volunteers) || 0, slots: (r && r.slots) || {} });
}
