// Cloudflare Pages Function  ->  POST /api/custom-checkout
// Creates a one-off Square checkout for a donor-typed amount and returns its URL.
//
// Environment variables (Cloudflare Pages > Settings > Environment variables):
//   SQUARE_ACCESS_TOKEN  = Square production access token (secret)
//   SQUARE_LOCATION_ID   = the nonprofit's Square location id
//   SQUARE_ENV           = production   (use 'sandbox' while testing)

export async function onRequestPost({ request, env }) {
  const json = (o, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return json({ error: 'Square not configured.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }

  const amount = Number(String(body.amount || '').replace(/[^0-9.]/g, ''));
  if (!amount || amount < 1) return json({ error: 'Please enter an amount of $1 or more.' }, 400);
  if (amount > 50000) return json({ error: 'Amount too large.' }, 400);
  const cents = Math.round(amount * 100);

  const base = env.SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';

  const res = await fetch(base + '/v2/online-checkout/payment-links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
      'Authorization': 'Bearer ' + env.SQUARE_ACCESS_TOKEN
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      quick_pay: {
        name: 'Donation to The Right Thing in Recovery',
        price_money: { amount: cents, currency: 'USD' },
        location_id: env.SQUARE_LOCATION_ID
      },
      checkout_options: {
        redirect_url: 'https://nextrighthing.com/thank-you.html?amount=' + amount + '&tier=custom',
        ask_for_shipping_address: false
      }
    })
  });

  const data = await res.json();
  if (!res.ok || !data.payment_link) {
    return json({ error: 'Could not create checkout.', detail: data }, 502);
  }
  return json({ url: data.payment_link.url });
}
