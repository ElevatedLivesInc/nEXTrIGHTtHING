// GET /donations-report/list -> Square payments (cash donations) for the private /donations-report page.
// Uses the SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID already configured for the donate button.
// Staff auth via Cloudflare Access login cookie (log in at any protected staff page first).
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('donations-report');
  const who = await getAuthedEmail(request, env);
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
