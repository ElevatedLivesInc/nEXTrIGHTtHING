// POST /drawing/enter  ->  free-entry prize drawing, NO PURCHASE NECESSARY.
// Public on purpose: Utah law requires a genuinely free method of entry, so this
// route must NOT sit behind Cloudflare Access. Nothing here touches resident data.
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let b; try { b = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const name  = clean(b.name, 120);
  const email = clean(b.email, 160).toLowerCase();
  const phone = clean(b.phone, 40);
  // Free text a stranger typed. Never matched to a person record, never
  // affects odds - it exists so we can thank whoever brought them.
  const referrer = clean(b.referred_by, 120) || null;

  if (name.length < 2) return json({ ok: false, error: 'Please enter your name.' }, 400);
  if (!email && !phone) return json({ ok: false, error: 'Give us one way to reach you if you win — email or phone.' }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);

  // Honeypot: real people leave this blank. Bots fill it. Accept silently, store nothing.
  if (clean(b.website, 200)) return json({ ok: true, entered: true });

  // Hash the IP so we can spot flooding without keeping anyone's address.
  let ip_hash = null;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (ip) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|rtir-2026'));
      ip_hash = [...new Uint8Array(buf)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}

  const h = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer': 'return=minimal'
  };

  // One entry per person per event — a second submit updates rather than stacks the odds.
  const dedupe = email
    ? '?event=eq.fall-yard-sale-2026&email=eq.' + encodeURIComponent(email)
    : '?event=eq.fall-yard-sale-2026&phone=eq.' + encodeURIComponent(phone);
  try {
    const existing = await fetch(env.SUPABASE_URL + '/rest/v1/drawing_entries' + dedupe + '&select=id,referred_by&limit=1',
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY } });
    if (existing.ok) {
      const rows = await existing.json();
      if (Array.isArray(rows) && rows.length) {
        // Already entered. Never insert a second row - the published rules say
        // duplicates are consolidated, not stacked. But if they came back and
        // this time named who sent them, fill that in on the row we already have.
        if (referrer && !rows[0].referred_by) {
          await fetch(env.SUPABASE_URL + '/rest/v1/drawing_entries?id=eq.' + encodeURIComponent(rows[0].id), {
            method: 'PATCH', headers: { ...h, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ referred_by: referrer })
          });
          return json({ ok: true, entered: true, already: true, referrerAdded: true });
        }
        return json({ ok: true, entered: true, already: true });
      }
    }
  } catch (_) {}

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/drawing_entries', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      event: 'fall-yard-sale-2026',
      name, email: email || null, phone: phone || null,
      entry_method: 'online',
      referred_by: referrer,
      consent_contact: b.consent === true || b.consent === 'true',
      ip_hash
    })
  });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'Could not save your entry.', detail }, 500); }
  return json({ ok: true, entered: true });
}
