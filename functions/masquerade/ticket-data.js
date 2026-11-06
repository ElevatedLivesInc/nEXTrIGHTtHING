// GET /masquerade/ticket-data?id=<uuid> -> what the ticket page shows. Name, seats, status only.
// The id is a random UUID that only the guest receives, so it works like a private link.
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'not found' }, 404);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/gala_rsvps?select=id,full_name,individual_qty,couple_qty,pay_status,checked_in&id=eq.' + id,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY } });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length || rows[0].pay_status === 'cancelled') return json({ error: 'not found' }, 404);
  const t = rows[0];
  return json({ id: t.id, code: 'MQ-' + t.id.replace(/-/g, '').slice(0, 8).toUpperCase(), name: t.full_name,
    seats: t.individual_qty + t.couple_qty * 2, total: t.individual_qty * 35 + t.couple_qty * 60,
    paid: t.pay_status === 'paid' || t.pay_status === 'comp', checked_in: t.checked_in });
}
