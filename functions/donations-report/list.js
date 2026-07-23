// GET /donations-report/list -> Square payments (cash donations) for the private /donations-report page.
// Uses the SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID already configured for the donate button.
// Staff auth via Cloudflare Access login cookie (log in at any protected staff page first).
export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = ['gabe@nextrighthing.com','ryan@nextrighthing.com','cateo@nextrighthing.com'];
  const who = await getAuthedEmail(request);
  if (!who || !ALLOWED.includes(who)) return json({ error: 'Not signed in. Open /in-kind-report first to log in, then come back and reload.' }, 401);

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return json({ error: 'Square not configured.' }, 500);

  const base = env.SQUARE_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const begin = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(); // ~13 months back

  let payments = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const url = base + '/v2/payments?location_id=' + encodeURIComponent(env.SQUARE_LOCATION_ID)
      + '&begin_time=' + encodeURIComponent(begin)
      + '&sort_order=DESC&limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const res = await fetch(url, {
      headers: {
        'Square-Version': '2024-01-18',
        'Authorization': 'Bearer ' + env.SQUARE_ACCESS_TOKEN
      }
    });
    if (!res.ok) { const detail = await res.text(); return json({ error: 'Square load failed', detail }, 500); }
    const data = await res.json();
    payments = payments.concat(data.payments || []);
    cursor = data.cursor || '';
    if (!cursor) break;
  }

  const rows = payments
    .filter(p => p.status === 'COMPLETED')
    .map(p => ({
      id: p.id,
      created_at: p.created_at,
      amount: p.amount_money ? p.amount_money.amount / 100 : 0,
      currency: p.amount_money ? p.amount_money.currency : 'USD',
      source: p.source_type || '',
      card_last4: (p.card_details && p.card_details.card && p.card_details.card.last_4) || '',
      buyer_email: p.buyer_email_address || '',
      note: p.note || '',
      receipt_url: p.receipt_url || ''
    }));

  return json({ viewer: who, payments: rows });
}

// --- staff auth: accepts Access header OR verifies the CF_Authorization login cookie ---
async function getAuthedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')), c => c.charCodeAt(0));
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  } catch (_) { return null; }
  if (!payload.iss || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(payload.iss)) return null;
  if (!payload.exp || payload.exp < Date.now() / 1000) return null;
  try {
    const certsRes = await fetch(payload.iss + '/cdn-cgi/access/certs');
    if (!certsRes.ok) return null;
    const certs = await certsRes.json();
    const jwk = (certs.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
  } catch (_) { return null; }
  return (payload.email || '').toLowerCase();
}
