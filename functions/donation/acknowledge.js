// POST /donation/acknowledge  <-  Square webhook (payment.created / payment.updated)
//
// Sends the IRS-required contemporaneous written acknowledgment for every cash gift,
// automatically, so no donor ever has to ask and no $250+ gift loses its deduction.
//
// Square Dashboard > Developers > Webhooks > Subscriptions:
//   URL    https://nextrighthing.com/donation/acknowledge
//   Events payment.created, payment.updated
//
// Pages env vars required:
//   SQUARE_WEBHOOK_SIGNATURE_KEY  (from the webhook subscription)
//   SQUARE_NOTIFICATION_URL       (the exact URL above, character for character)
//   RESEND_API_KEY, RESEND_FROM   (already set for patrol briefs)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// This route must NOT sit behind Cloudflare Access - Square has to reach it.

const ORG   = 'The Right Thing in Recovery';
const EIN   = '93-4316358';
const PROG  = 'The Peer Connection Clubhouse';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const raw = await request.text();

  // --- verify it really came from Square (HMAC-SHA256 over notificationUrl + body) ---
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY || !env.SQUARE_NOTIFICATION_URL) return json({ error: 'not configured' }, 500);
  const sent = request.headers.get('x-square-hmacsha256-signature') || '';
  let expected = '';
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SQUARE_WEBHOOK_SIGNATURE_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(env.SQUARE_NOTIFICATION_URL + raw));
    expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  } catch (_) { return json({ error: 'signature check failed' }, 500); }
  if (!timingSafeEqual(sent, expected)) return json({ error: 'bad signature' }, 401);

  let evt; try { evt = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }

  const pay = evt?.data?.object?.payment;
  if (!pay) return json({ ok: true, skipped: 'no payment object' });
  if (pay.status !== 'COMPLETED') return json({ ok: true, skipped: 'not completed' });

  const amount_cents = Number(pay.amount_money?.amount || 0);
  if (amount_cents <= 0) return json({ ok: true, skipped: 'zero amount' });

  const donor_email = (pay.buyer_email_address || '').trim().toLowerCase() || null;
  const donor_name  = (pay.shipping_address?.name || pay.billing_address?.name || '').trim() || null;

  const H = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
  };

  // --- idempotent: Square retries, and a donor must never get two receipts ---
  const seen = await fetch(env.SUPABASE_URL + '/rest/v1/donation_receipts?payment_id=eq.' +
    encodeURIComponent(pay.id) + '&select=id,email_sent&limit=1', { headers: H });
  if (seen.ok) {
    const rows = await seen.json();
    if (Array.isArray(rows) && rows.length && rows[0].email_sent) return json({ ok: true, already: true });
  }

  // --- reserve a receipt number and record the gift before we try to email ---
  let receipt_no = null;
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/next_receipt_no', { method: 'POST', headers: H, body: '{}' });
    if (r.ok) receipt_no = (await r.json());
  } catch (_) {}

  await fetch(env.SUPABASE_URL + '/rest/v1/donation_receipts?on_conflict=payment_id', {
    method: 'POST',
    headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      payment_id: pay.id, receipt_no, donor_email, donor_name,
      amount_cents, currency: pay.amount_money?.currency || 'USD',
      paid_at: pay.created_at || null, note: pay.note || null
    })
  });

  // No email on file: the gift is still logged, and the dashboard can show it needs a mailed receipt.
  if (!donor_email) return json({ ok: true, logged: true, emailed: false, reason: 'no donor email' });
  if (!env.RESEND_API_KEY) return json({ ok: true, logged: true, emailed: false, reason: 'resend not configured' });

  const amount = '$' + (amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = new Date(pay.created_at || Date.now()).toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' });

  let email_sent = false, email_error = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.RESEND_API_KEY },
      body: JSON.stringify({
        from: env.RESEND_FROM || (ORG + ' <donations@nextrighthing.com>'),
        to: [donor_email],
        subject: 'Your donation receipt — ' + ORG + (receipt_no ? ' (' + receipt_no + ')' : ''),
        html: receiptHtml({ receipt_no, donor_name, amount, when })
      })
    });
    email_sent = res.ok;
    if (!res.ok) email_error = ('resend ' + res.status + ' ' + (await res.text())).slice(0, 500);
  } catch (e) { email_error = String(e).slice(0, 500); }

  await fetch(env.SUPABASE_URL + '/rest/v1/donation_receipts?payment_id=eq.' + encodeURIComponent(pay.id), {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ email_sent, email_sent_at: email_sent ? new Date().toISOString() : null, email_error })
  });

  return json({ ok: true, logged: true, emailed: email_sent, receipt_no });
}

// Square also pings with GET when you click "Test" - answer politely.
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, endpoint: 'donation/acknowledge' }),
    { headers: { 'Content-Type': 'application/json' } });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function receiptHtml({ receipt_no, donor_name, amount, when }) {
  const hi = donor_name ? ('Dear ' + esc(donor_name) + ',') : 'Thank you,';
  return '<meta charset="utf-8">'
  + '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2744">'
  + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.7rem;margin-bottom:1.4rem">'
  +   '<div style="font-family:Georgia,serif;font-size:1.5rem">Thank you for your gift</div>'
  +   '<div style="font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#8a8a8a;margin-top:.3rem">'
  +     esc(ORG) + '</div>'
  + '</div>'
  + '<p style="font-size:.95rem;line-height:1.7;color:#333">' + hi + '</p>'
  + '<p style="font-size:.95rem;line-height:1.7;color:#333">Your gift is going to work in West Jordan, Utah — '
  +   'keeping the doors of ' + esc(PROG) + ' open for people who need somewhere safe to be. '
  +   'Please keep this receipt for your tax records.</p>'
  + '<table style="width:100%;font-size:.9rem;color:#333;border-collapse:collapse;margin:1.5rem 0;'
  +   'border:1px solid #e6e0d4;border-radius:6px">'
  +   row('Organization', esc(ORG))
  +   row('Tax status', '501(c)(3) &middot; EIN ' + EIN)
  +   row('Amount', '<b>' + esc(amount) + '</b>')
  +   row('Date of gift', esc(when))
  +   (receipt_no ? row('Receipt number', esc(receipt_no)) : '')
  + '</table>'
  + '<p style="font-size:.85rem;line-height:1.7;color:#555;background:#faf7f0;border-left:3px solid #c9a96e;'
  +   'padding:.9rem 1rem">No goods or services were provided in exchange for this contribution. '
  +   'This letter is your contemporaneous written acknowledgment under IRS rules — keep it with your tax records '
  +   'if you intend to claim a deduction.</p>'
  + '<p style="font-size:.85rem;line-height:1.7;color:#555">Questions? Reply to this email, or contact '
  +   'Ryan Anderson at <a href="mailto:Ryan@nextrighthing.com" style="color:#96762f">Ryan@nextrighthing.com</a> '
  +   'or (385) 253-0538.</p>'
  + '<p style="margin-top:1.8rem;font-size:.78rem;color:#999;border-top:1px solid #eee;padding-top:.9rem">'
  +   esc(ORG) + ' &middot; 501(c)(3) &middot; EIN ' + EIN + '<br>'
  +   esc(PROG) + ' is a program of ' + esc(ORG) + '.</p>'
  + '</div>';
}
function row(k, v) {
  return '<tr><td style="padding:.55rem .9rem;color:#888;border-bottom:1px solid #f0ece2;width:42%">' + k
       + '</td><td style="padding:.55rem .9rem;border-bottom:1px solid #f0ece2">' + v + '</td></tr>';
}
function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
