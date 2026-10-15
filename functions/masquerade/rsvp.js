// POST /masquerade/rsvp  -> reserve seats, issue a ticket, email it.
// Public endpoint. Writes with the service key server-side so the browser never can,
// and forces safe values (status 'reserved', source 'web') no matter what is posted.
// Money benefits The Right Thing in Recovery (501(c)(3)) - nonprofit side only.
const SLUG = 'masquerade-2026';
const ORG = 'The Right Thing in Recovery';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const str = (v, max) => { v = (v == null ? '' : String(v)).trim(); return v ? v.slice(0, max) : null; };
const int = (v, lo, hi) => Math.min(hi, Math.max(lo, parseInt(v, 10) || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ticketCode = id => 'MQ-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 500);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const row = {
    event_slug: SLUG,
    full_name: str(b.full_name, 120),
    email: str(b.email, 200),
    phone: str(b.phone, 40),
    individual_qty: int(b.individual_qty, 0, 20),
    couple_qty: int(b.couple_qty, 0, 10),
    guest_names: str(b.guest_names, 600),
    dietary: str(b.dietary, 300),
    attire: ['flannel', 'formal', 'masquerade', 'surprise'].includes(b.attire) ? b.attire : 'surprise',
    pay_status: 'reserved', source: 'web',
    photo_consent: b.photo_consent === true ? true : b.photo_consent === false ? false : null
  };
  if (row.photo_consent === null) return json({ error: 'Please answer the photo consent question (yes or no).' }, 400);
  if (!row.full_name || row.full_name.length < 2) return json({ error: 'Please add your name.' }, 400);
  if (!row.email && !row.phone) return json({ error: 'Please add an email or a phone number.' }, 400);
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return json({ error: 'That email does not look right.' }, 400);
  if (row.individual_qty + row.couple_qty < 1) return json({ error: 'Choose at least one ticket.' }, 400);

  const H = { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
  const ins = await fetch(env.SUPABASE_URL + '/rest/v1/gala_rsvps', { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!ins.ok) return json({ error: 'Could not save your reservation. Please call 801-816-4977.' }, 500);
  const saved = (await ins.json())[0];

  if (b.drawing) {
    // Free entry, no purchase necessary. A duplicate email is fine - the unique index just refuses it.
    await fetch(env.SUPABASE_URL + '/rest/v1/gala_drawing', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ event_slug: SLUG, full_name: row.full_name, email: row.email, phone: row.phone }) }).catch(() => {});
  }

  let emailed = false;
  if (row.email && env.RESEND_API_KEY) {
    const origin = new URL(request.url).origin;
    const link = origin + '/masquerade/ticket?id=' + saved.id;
    const seats = row.individual_qty + row.couple_qty * 2;
    const total = row.individual_qty * 35 + row.couple_qty * 60;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY },
        body: JSON.stringify({
          from: env.RESEND_FROM_TICKETS || (ORG + ' <donations@nextrighthing.com>'),
          to: [row.email],
          reply_to: 'ryan@nextrighthing.com',
          subject: '🎭 Your Masquerade ticket — Fri Nov 13 (' + ticketCode(saved.id) + ')',
          html: ticketEmail({ name: row.full_name, seats, total, code: ticketCode(saved.id), link, origin })
        })
      });
      emailed = r.ok;
    } catch (_) {}
  }
  return json({ ok: true, id: saved.id, code: ticketCode(saved.id), emailed });
}

function ticketEmail({ name, seats, total, code, link, origin }) {
  return `<!doctype html><html><body style="margin:0;background:#0b0820;font-family:Helvetica,Arial,sans-serif;color:#ece8f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0820;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#140f33;border:1px solid #6d28d9;border-radius:18px;overflow:hidden">
<tr><td><img src="${origin}/masquerade/banner.jpg" width="560" alt="Flannel to Formal Masquerade Fundraiser" style="display:block;width:100%;height:auto"></td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#c4b5fd">You're on the list</p>
<h1 style="margin:8px 0 4px;font-family:Georgia,serif;font-size:28px;color:#f3d48a">${esc(name)}, admit ${seats}</h1>
<p style="margin:0 0 18px;color:#cfc8e2">Ticket ${esc(code)} · Dinner included</p>
<table role="presentation" width="100%" style="border-top:1px solid #3b2a6e;border-bottom:1px solid #3b2a6e;margin-bottom:20px"><tr>
<td style="padding:12px 0;color:#fff"><b>Fri, Nov 13, 2026</b><br><span style="color:#cfc8e2">6:00 – 10:00 PM</span></td>
<td style="padding:12px 0;color:#fff" align="right"><b>7669 S Redwood Rd</b><br><span style="color:#cfc8e2">West Jordan, UT</span></td></tr></table>
<p style="margin:0 0 20px;color:#ece8f4">Your total is <b>$${total}</b>. Pay online or at the door. Show the QR code on your ticket at check-in.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#d9b874;color:#1a1404;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:999px">🎟 Open my ticket</a></p>
<p style="margin:0 0 6px;color:#cfc8e2">Dress code: flannel, formal, masquerade, or all three.</p>
<p style="margin:0 0 20px;color:#cfc8e2">Know someone who'd love this? Forward this email or share <a href="${origin}/masquerade/" style="color:#e6cf9b">nextrighthing.com/masquerade</a>.</p>
<p style="margin:0;font-size:12px;color:#8f86ad">Proceeds benefit The Right Thing in Recovery, a 501(c)(3) nonprofit (EIN 93-4316358). Questions? Reply to this email or call 801-816-4977.</p>
</td></tr></table></td></tr></table></body></html>`;
}
