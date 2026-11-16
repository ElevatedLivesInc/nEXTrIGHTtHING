// functions/_lib/outbox.js
// One-tap email for the nonprofit side: in-kind receipts and Masquerade
// thank-yous. A staff member taps a button; this builds the email, sends it
// through Resend, and writes a row to outbound_emails so the same person is
// never emailed the same thing twice by accident.
//
// Everything here goes out as The Right Thing in Recovery (the 501(c)(3)).
// Nothing in this file may speak for the treatment center.
//
// Files under functions/ starting with "_" are importable but never routed.
import { getAuthedEmail } from './auth.js';
import { allowedFor } from './roster.js';

export const ORG = 'The Right Thing in Recovery';
export const EIN = '93-4316358';
export const PROG = 'The Peer Connection Clubhouse';
export const EVENT = 'Flannel to Formal Masquerade Fundraiser';
export const EVENT_SLUG = 'masquerade-2026';
const RYAN = { name: 'Ryan Anderson', email: 'ryan@nextrighthing.com', phone: '(385) 253-0538', title: 'In-Kind Donations Manager' };

export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const validEmail = e => typeof e === 'string' && e.length <= 200 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
export const cleanEmail = e => String(e == null ? '' : e).trim().toLowerCase();
const dollars = c => '$' + Math.round((c || 0) / 100).toLocaleString('en-US');
const longDate = d => { try { return new Date(String(d).indexOf('T') > -1 ? d : d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { return String(d); } };

// ---- who is asking ----
export async function gate(request, env, system) {
  const who = await getAuthedEmail(request, env);
  if (!who) return { res: json({ ok: false, error: 'Not signed in. Open Mission Control to log in, then reload.' }, 401) };
  if (!allowedFor(system).includes(who)) return { res: json({ ok: false, error: 'Your account does not have access to this.' }, 403) };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { res: json({ ok: false, error: 'not configured' }, 500) };
  return { who };
}

// ---- database ----
export async function sb(env, path, init = {}) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'return=representation', ...(init.headers || {}) }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

// Successful sends for one table, newest first. A missing log table (the
// migration has not been run yet) reads as "nothing sent" instead of an error.
export async function sentFor(env, refTable) {
  try {
    return await sb(env, 'outbound_emails?ref_table=eq.' + encodeURIComponent(refTable)
      + '&ok=is.true&select=ref_id,kind,to_email,created_at,sent_by&order=created_at.desc&limit=2000');
  } catch (_) { return []; }
}

async function alreadySent(env, kind, refId) {
  try {
    const r = await sb(env, 'outbound_emails?kind=eq.' + encodeURIComponent(kind) + '&ref_id=eq.' + encodeURIComponent(refId)
      + '&ok=is.true&select=to_email,created_at&order=created_at.desc&limit=1');
    return r && r[0] ? r[0] : null;
  } catch (_) { return null; }
}

// ---- the one place an email actually leaves ----
// Returns { ok, already?, to, sent_at?, error? }.  force=true is the deliberate
// "send it again" tap; without it a repeat is answered with the first send.
export async function deliver(env, { kind, refTable, refId, to, subject, html, who, force }) {
  to = cleanEmail(to);
  if (!validEmail(to)) return { ok: false, error: 'That email address does not look right.' };
  if (!env.RESEND_API_KEY) return { ok: false, error: 'Email is not set up on the server (RESEND_API_KEY missing).' };
  if (!force) {
    const prior = await alreadySent(env, kind, refId);
    if (prior) return { ok: true, already: true, to: prior.to_email, sent_at: prior.created_at };
  }
  let ok = false, error = null, provider_id = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY },
      body: JSON.stringify({
        // From Ryan's own address, so a donor's reply lands in his inbox and the
        // email reads as coming from the person they dealt with. nextrighthing.com
        // is already a verified sending domain in Resend.
        from: env.RESEND_FROM_RYAN || (RYAN.name + ', ' + ORG + ' <' + RYAN.email + '>'),
        to: [to], reply_to: RYAN.email, subject, html
      })
    });
    ok = res.ok;
    const body = await res.text();
    if (ok) { try { provider_id = JSON.parse(body).id || null; } catch (_) {} }
    else error = ('resend ' + res.status + ' ' + body).slice(0, 500);
  } catch (e) { error = String(e).slice(0, 500); }

  const sent_at = new Date().toISOString();
  try {
    await sb(env, 'outbound_emails', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, ref_table: refTable, ref_id: String(refId), to_email: to, subject, sent_by: who || null, ok, error, provider_id }) });
  } catch (_) { /* the email already went; never fail the tap over the log */ }
  return ok ? { ok: true, to, sent_at } : { ok: false, error: 'The email did not send. ' + (error || '') };
}

// ---- shared look: plain, light, prints well, reads on a phone ----
function shell({ heading, body, banner }) {
  return '<meta charset="utf-8">'
  + '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2744">'
  + (banner ? '<img src="' + esc(banner) + '" width="560" alt="' + esc(EVENT) + '" style="display:block;width:100%;height:auto;border-radius:10px;margin-bottom:1.2rem">' : '')
  + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.7rem;margin-bottom:1.4rem">'
  +   '<div style="font-family:Georgia,serif;font-size:1.5rem">' + esc(heading) + '</div>'
  +   '<div style="font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#8a8a8a;margin-top:.3rem">' + esc(ORG) + '</div>'
  + '</div>'
  + body
  + '<p style="font-size:.85rem;line-height:1.7;color:#555">Questions? Reply to this email, or contact '
  +   esc(RYAN.name) + ' at <a href="mailto:' + RYAN.email + '" style="color:#96762f">' + RYAN.email + '</a> or ' + RYAN.phone + '.</p>'
  + '<p style="margin-top:1.8rem;font-size:.78rem;color:#999;border-top:1px solid #eee;padding-top:.9rem">'
  +   esc(ORG) + ' &middot; 501(c)(3) &middot; EIN ' + EIN + '<br>' + esc(PROG) + ' is a program of ' + esc(ORG) + '.</p>'
  + '</div>';
}
const P = t => '<p style="font-size:.95rem;line-height:1.7;color:#333">' + t + '</p>';
const NOTE = t => '<p style="font-size:.85rem;line-height:1.7;color:#555;background:#faf7f0;border-left:3px solid #c9a96e;padding:.9rem 1rem">' + t + '</p>';
const ROW = (k, v) => '<tr><td style="padding:.55rem .9rem;color:#888;border-bottom:1px solid #f0ece2;width:42%">' + k + '</td><td style="padding:.55rem .9rem;border-bottom:1px solid #f0ece2">' + v + '</td></tr>';
const TABLE = rows => '<table style="width:100%;font-size:.9rem;color:#333;border-collapse:collapse;margin:1.5rem 0;border:1px solid #e6e0d4">' + rows.join('') + '</table>';
const BTN = (href, label) => '<p style="margin:1.4rem 0"><a href="' + esc(href) + '" style="display:inline-block;background:#1a2744;color:#e8d5b0;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:6px">' + esc(label) + '</a></p>';
const SIGN = '<p style="font-size:.95rem;line-height:1.7;color:#333">With gratitude,<br><b>' + RYAN.name + '</b><br><span style="color:#777;font-size:.85rem">' + RYAN.title + ' &middot; ' + ORG + '</span></p>';
const firstName = n => { const f = String(n || '').trim().split(/\s+/)[0] || ''; return /^[A-Za-z][A-Za-z'’.-]{1,30}$/.test(f) ? f : ''; };
// donor_contact has held a contact name, a phone, an email - only greet by it when it reads as a name.
const looksLikeName = s => !!s && s.length <= 60 && /^[A-Za-z][A-Za-z'’.& -]+$/.test(s.trim());
const MISSION = 'recovery opportunities, sober activities, transportation, peer support and resources for people working to rebuild their lives';

// ---------- 1. In-kind receipt (the serialized RTIK system) ----------
// Generates the receipt if it does not exist yet (same database function the
// public receipt page calls, so the serial is the one a donor would have got by
// typing the code in), then emails it.
export async function sendInkindReceipt(env, { id, email, who, origin, force }) {
  const rows = await sb(env, 'authorizations?id=eq.' + encodeURIComponent(id) + '&select=*');
  const a = rows && rows[0];
  if (!a) return { ok: false, error: 'That record was not found.' };
  if (a.status === 'void') return { ok: false, error: 'That record is void. Restore it before sending a receipt.' };
  const to = cleanEmail(email || a.donor_email || ((a.donor_contact || '').match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/) || [''])[0]);
  if (!validEmail(to)) return { ok: false, needs_email: true, error: 'Add the donor’s email first.' };
  if (to !== cleanEmail(a.donor_email)) {
    try { await sb(env, 'authorizations?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ donor_email: to }) }); } catch (_) {}
  }
  let r;
  try { const out = await sb(env, 'rpc/redeem_authorization', { method: 'POST', body: JSON.stringify({ p_code: a.code }) }); r = Array.isArray(out) ? out[0] : out; }
  catch (e) { return { ok: false, error: 'Could not generate the receipt. ' + String(e.message || e) }; }
  if (!r || !r.serial) return { ok: false, error: 'Could not generate the receipt.' };

  const masq = a.campaign === EVENT_SLUG;
  const hi = looksLikeName(a.donor_contact) ? a.donor_contact.trim() : a.donor_name;
  const link = origin + '/in-kind-receipt?code=' + encodeURIComponent(a.code);
  const html = shell({ heading: 'Thank you for your gift', body:
      P('Dear ' + esc(hi) + ',')
    + P(masq
        ? 'Thank you for giving to the ' + esc(EVENT) + ' on November 13. Gifts like yours are what made the evening possible, and what it raised goes to ' + MISSION + '.'
        : 'Thank you for your in-kind gift to ' + esc(ORG) + '. It goes straight to work in West Jordan, Utah, supporting ' + MISSION + '.')
    + P('Your official receipt is below. Please keep it for your tax records.')
    + TABLE([
        ROW('Receipt number', '<b>' + esc(r.serial) + '</b>'),
        ROW('Received from', esc(r.donor_name)),
        ROW('Description of contribution', esc(r.description).replace(/\n/g, '<br>')),
        r.date_of_donation ? ROW('Date of donation', esc(longDate(r.date_of_donation))) : '',
        ROW('Date issued', esc(longDate(r.issued_at || new Date().toISOString()))),
        (r.donor_value != null && r.donor_value !== '') ? ROW('Fair market value as stated by donor', '$' + Number(r.donor_value).toLocaleString('en-US')) : '',
        ROW('Organization', esc(ORG)),
        ROW('Tax status', '501(c)(3) &middot; EIN ' + EIN)
      ])
    + NOTE('No goods or services were provided by ' + esc(ORG) + ' in exchange for this contribution. '
        + esc(ORG) + ' does not assign or confirm the value of donated goods or services; determining and substantiating fair market value is the responsibility of the donor. '
        + 'The deductibility of donated services may be limited or not allowed; please consult your tax advisor.')
    + BTN(link, 'View or print your receipt')
    + P('<span style="font-size:.85rem;color:#666">Anyone can confirm this receipt is genuine at <a href="' + origin + '/verify" style="color:#96762f">nextrighthing.com/verify</a> using the receipt number above.</span>')
    + SIGN });
  const out = await deliver(env, { kind: 'inkind_receipt', refTable: 'authorizations', refId: id, to, who, force,
    subject: 'Your in-kind donation receipt — ' + ORG + ' (No. ' + r.serial + ')', html });
  return { ...out, serial: r.serial, status: 'redeemed', donor_email: to };
}

// ---------- 2. Masquerade: guest thank-you ----------
// A thank-you, not a tax receipt: dinner came with the ticket, and Square
// already emailed the payment receipt. Worded for anyone who held a seat,
// whether or not the door check-in was tapped for them.
export async function sendGuestThanks(env, { id, who, origin, force }) {
  const rows = await sb(env, 'gala_rsvps?id=eq.' + encodeURIComponent(id) + '&select=id,full_name,email,pay_status');
  const g = rows && rows[0];
  if (!g) return { ok: false, error: 'That guest was not found.' };
  if (g.pay_status === 'cancelled') return { ok: false, error: 'That reservation was cancelled.' };
  if (!validEmail(cleanEmail(g.email))) return { ok: false, needs_email: true, error: 'No email on file for this guest.' };
  const fn = firstName(g.full_name);
  const html = shell({ heading: 'Thank you for being part of it', banner: origin + '/masquerade/banner.jpg', body:
      P((fn ? 'Dear ' + esc(fn) : 'Hello') + ',')
    + P('Thank you for being part of the ' + esc(EVENT) + '. Flannel, formal, masks and all, you helped fill the room for a good cause.')
    + P('Everything raised that night benefits ' + esc(ORG) + ', which provides ' + MISSION + '.')
    + P('We also owe a thank-you to the local businesses and families who donated dinner, auction items and their time. You can see them, and a few photos from the night, here:')
    + BTN(origin + '/masquerade/', 'See the thank-you page')
    + P('If you would like to keep it going, a gift of any size helps: <a href="' + origin + '/donate" style="color:#96762f">nextrighthing.com/donate</a>.')
    + SIGN });
  return deliver(env, { kind: 'gala_guest_thanks', refTable: 'gala_rsvps', refId: id, to: g.email, who, force,
    subject: 'Thank you for being part of the Masquerade', html });
}

// ---------- 3. Masquerade: sponsor receipt + thank-you ----------
// Same receipt math the tracker shows staff: what was paid, less the value of
// the dinner tickets that came with the level. No dollar figure here is ever
// shown publicly - this goes to the sponsor alone.
const TIER = {
  supporter: ['Recovery Supporter', 0], hope: ['Hope Sponsor', 2], changemaker: ['Change Maker', 4],
  champion: ['Community Champion', 6], partner: ['Recovery Partner', 8], presenting: ['Presenting Sponsor', 10]
};
export async function sendSponsorReceipt(env, { id, who, origin, force }) {
  const rows = await sb(env, 'gala_sponsors?id=eq.' + encodeURIComponent(id) + '&select=*');
  const s = rows && rows[0];
  if (!s) return { ok: false, error: 'That sponsor was not found.' };
  if (s.status === 'declined') return { ok: false, error: 'That sponsor is marked declined.' };
  if (!validEmail(cleanEmail(s.email))) return { ok: false, needs_email: true, error: 'No email on file for this sponsor.' };
  const ev = (await sb(env, 'gala_event?slug=eq.' + EVENT_SLUG + '&select=ticket_value_cents'))[0] || {};
  const [tierName, tierTix] = TIER[s.tier] || ['Sponsor', 0];
  const tix = s.tickets_issued || tierTix;
  const paid = s.paid_cents || 0;
  const ben = tix * (ev.ticket_value_cents || 3500);
  const net = Math.max(0, paid - ben);
  const name = s.display_name || s.business_name;
  const fn = firstName(s.contact_name);
  const receipt = paid > 0;
  const html = shell({ heading: 'Thank you for sponsoring the Masquerade', banner: origin + '/masquerade/banner.jpg', body:
      P((fn ? 'Dear ' + esc(fn) : 'Dear friends at ' + esc(name)) + ',')
    + P('Thank you for standing with us as a <b>' + esc(tierName) + '</b> of the ' + esc(EVENT) + ' on November 13. Sponsors are the reason the night could happen at all, and what it raised goes to ' + MISSION + '.')
    + (receipt
        ? P('Your receipt is below. Please keep it for your tax records.')
          + TABLE([
              s.receipt_number ? ROW('Receipt number', '<b>' + esc(s.receipt_number) + '</b>') : '',
              ROW('Received from', esc(name)),
              ROW('Contribution', '<b>' + dollars(paid) + '</b>'),
              ROW('Event', esc(EVENT) + ', November 13, 2026'),
              tix ? ROW('Goods or services received', tix + ' event ticket' + (tix === 1 ? '' : 's') + ' including dinner, estimated value ' + dollars(ben)) : ROW('Goods or services received', 'None'),
              ROW('Contribution exceeding the value received', '<b>' + dollars(net) + '</b>'),
              ROW('Organization', esc(ORG)),
              ROW('Tax status', '501(c)(3) &middot; EIN ' + EIN)
            ])
          + NOTE(esc(ORG) + ', a 501(c)(3) nonprofit (EIN ' + EIN + '), gratefully acknowledges ' + esc(name) + '’s contribution of ' + dollars(paid) + ' to the ' + esc(EVENT) + '. '
              + (tix ? 'In exchange, the donor received ' + tix + ' event ticket' + (tix === 1 ? '' : 's') + ' including dinner, with an estimated value of ' + dollars(ben) + '. The amount of this contribution exceeding the estimated value of goods and services received is ' + dollars(net) + '. '
                     : 'No goods or services were provided in exchange for this contribution. ')
              + 'Please consult your tax advisor about deductibility.')
        : '')
    + P('You are thanked by name on our event page:')
    + BTN(origin + '/masquerade/', 'See the thank-you page')
    + SIGN });
  const out = await deliver(env, { kind: 'gala_sponsor_receipt', refTable: 'gala_sponsors', refId: id, to: s.email, who, force,
    subject: (receipt ? 'Thank you, and your receipt — ' : 'Thank you — ') + EVENT, html });
  let benefits_done = s.benefits_done || {};
  if (out.ok && !out.already) {
    const day = new Date().toISOString().slice(0, 10);
    benefits_done = { ...benefits_done, thank_you: benefits_done.thank_you || day, ...(receipt ? { receipt: benefits_done.receipt || day } : {}) };
    try { await sb(env, 'gala_sponsors?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ benefits_done }) }); } catch (_) {}
  }
  return { ...out, benefits_done, was_receipt: receipt };
}

// ---------- 4. Masquerade: in-kind thank-you (tracker rows) ----------
// Thank-you only. The numbered tax receipt comes from the In-Kind report.
export async function sendGalaInkindThanks(env, { id, who, origin, force }) {
  const rows = await sb(env, 'gala_inkind?id=eq.' + encodeURIComponent(id) + '&select=*');
  const i = rows && rows[0];
  if (!i) return { ok: false, error: 'That item was not found.' };
  const to = cleanEmail(i.email);
  if (!validEmail(to)) return { ok: false, needs_email: true, error: 'No email on file for this donor.' };
  // Partner rows were loaded with a staff address as a stand-in. Thanking a
  // donor at a staff inbox helps no one.
  if (/@nextrighthing\.com$/.test(to)) return { ok: false, needs_email: true, error: 'That is a staff address standing in for the donor. Put the donor’s own email on the row first.' };
  const name = i.business_name || i.donor_name;
  const html = shell({ heading: 'Thank you for your gift', banner: origin + '/masquerade/banner.jpg', body:
      P('Dear friends at ' + esc(name) + ',')
    + P('Thank you for supporting the ' + esc(EVENT) + ' on November 13. Gifts like yours are what made the evening possible, and what it raised goes to ' + MISSION + '.')
    + P('You are thanked by name on our event page:')
    + BTN(origin + '/masquerade/', 'See the thank-you page')
    + P('<span style="font-size:.85rem;color:#666">If you need a receipt for a donated item, reply to this email and we will send your numbered receipt.</span>')
    + SIGN });
  return deliver(env, { kind: 'gala_inkind_thanks', refTable: 'gala_inkind', refId: id, to, who, force,
    subject: 'Thank you — ' + EVENT, html });
}

// ---------- 5. Masquerade: auction winner ----------
export async function sendAuctionWinner(env, { id, who, origin, force }) {
  const items = await sb(env, 'gala_auction_items?id=eq.' + encodeURIComponent(id) + '&select=id,title,donor,winner_paid');
  const it = items && items[0];
  if (!it) return { ok: false, error: 'That auction item was not found.' };
  const bids = await sb(env, 'gala_bids?item_id=eq.' + encodeURIComponent(id) + '&voided=is.false&select=id,bidder_name,email,amount_cents,created_at&order=amount_cents.desc,created_at.asc&limit=1');
  const top = bids && bids[0];
  if (!top) return { ok: false, error: 'No bids on this item.' };
  if (!validEmail(cleanEmail(top.email))) return { ok: false, needs_email: true, error: 'The winning bidder left a phone number, not an email. Call or text them.' };
  const fn = firstName(top.bidder_name);
  const html = shell({ heading: 'You won!', banner: origin + '/masquerade/banner.jpg', body:
      P((fn ? 'Dear ' + esc(fn) : 'Hello') + ',')
    + P('Congratulations. Your bid won at the ' + esc(EVENT) + ' silent auction.')
    + TABLE([ ROW('Item', '<b>' + esc(it.title) + '</b>'), it.donor ? ROW('Donated by', esc(it.donor)) : '', ROW('Your winning bid', '<b>' + dollars(top.amount_cents) + '</b>') ])
    + P(it.winner_paid
        ? 'Your payment has been received. Thank you! If you have not picked up your item yet, reply to this email or call ' + RYAN.name + ' at ' + RYAN.phone + ' and we will get it to you.'
        : 'To arrange payment and pickup, reply to this email or call ' + RYAN.name + ' at ' + RYAN.phone + '.')
    + P('Every dollar of your bid benefits ' + esc(ORG) + '. Thank you for bidding.')
    + SIGN });
  // Keyed to the winning BID, so if a bid is voided and someone else leads, the new leader can be told.
  return deliver(env, { kind: 'gala_auction_winner', refTable: 'gala_auction_items', refId: id + ':' + top.id, to: top.email, who, force,
    subject: 'You won: ' + it.title + ' — Masquerade silent auction', html });
}
