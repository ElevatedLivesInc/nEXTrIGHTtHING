// One-tap email (functions/_lib/outbox.js) with Supabase and Resend mocked.
// Run from this folder:  node outbox.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const mod = await import('../functions/_lib/outbox.js');
const sendEp = await import('../functions/in-kind-report/send.js');
const galaEp = await import('../functions/gala-tracker/send.js');
const OUT = process.argv[2] || null; // pass a folder to also write each email as an .html preview
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' };
const A = '11111111-1111-1111-1111-111111111111', G = '22222222-2222-2222-2222-222222222222', S = '33333333-3333-3333-3333-333333333333', I = '44444444-4444-4444-4444-444444444444', IK='55555555-5555-5555-5555-555555555555';
let db, mails, resendOk = true;
function reset() {
  mails = []; resendOk = true;
  db = { log: [],
    authorizations: [{ id: A, code: 'RTIK-TEST-0001', donor_name: 'Demo Outfitters', donor_contact: 'Jordan Sample', description: '$100 gift card\nplus swag', donor_value: 100, date_of_donation: '2026-11-13', status: 'issued', donor_email: null, campaign: null }],
    gala_rsvps: [{ id: G, full_name: 'Alex Sample', email: 'alex@example.com', pay_status: 'reserved' }],
    gala_sponsors: [{ id: S, business_name: 'Demo Program', display_name: null, contact_name: 'Pat Example', email: 'pat@example.com', tier: 'hope', paid_cents: 30000, tickets_issued: 2, status: 'paid', receipt_number: 'RTIR-2026-9999', benefits_done: {} }],
    gala_inkind: [{ id: IK, donor_name: 'Demo Cafe', business_name: 'Demo Cafe', email: 'ryan@nextrighthing.com' }],
    gala_auction_items: [{ id: I, title: 'Lodge night <b>', donor: 'Demo Resort', winner_paid: false }],
    gala_bids: [{ id: 'b1', item_id: I, bidder_name: 'Riley Example', email: 'riley@example.com', amount_cents: 10000, voided: false, created_at: '2026-11-13' }] };
}
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body ? JSON.parse(init.body) : null;
  const R = (o, s = 200) => new Response(o == null ? '' : JSON.stringify(o), { status: s });
  if (url.startsWith('https://api.resend.com')) { if (!resendOk) return R({ message: 'domain not verified' }, 403); mails.push(body); return R({ id: 're_' + mails.length }); }
  const u = new URL(url); const path = u.pathname.replace('/rest/v1/', ''); const q = u.searchParams;
  if (path === 'rpc/redeem_authorization') { const a = db.authorizations.find(x => x.code === body.p_code); a.status = 'redeemed'; return R([{ serial: 'RTR-2026-0042', donor_name: a.donor_name, description: a.description, donor_value: a.donor_value, date_of_donation: a.date_of_donation, issued_at: '2026-11-16T10:00:00Z' }]); }
  if (path === 'outbound_emails') {
    if (init.method === 'POST') { db.log.push({ ...body, created_at: new Date().toISOString() }); return R(null, 201); }
    let rows = db.log.filter(x => x.ok);
    for (const k of ['kind', 'ref_id', 'ref_table']) if (q.get(k)) rows = rows.filter(x => 'eq.' + x[k] === q.get(k));
    return R(rows.slice().reverse());
  }
  if (path === 'gala_event') return R([{ ticket_value_cents: 3500 }]);
  const t = db[path]; if (!t) return R({ message: 'no table ' + path }, 404);
  const idq = (q.get('id') || q.get('item_id') || '').replace('eq.', '');
  const rows = t.filter(x => (q.get('id') ? x.id === idq : q.get('item_id') ? x.item_id === idq : true));
  if (init.method === 'PATCH') { rows.forEach(x => Object.assign(x, body)); return R(null, 204); }
  return R(rows);
};
const origin = 'https://nextrighthing.com';
const save = (n, h) => OUT && fs.writeFileSync(OUT + '/' + n + '.html', '<body style="margin:0;padding:18px;background:#fff">' + h + '</body>');

// 1. in-kind receipt: needs an email
reset();
let r = await mod.sendInkindReceipt(env, { id: A, who: 'ryan@nextrighthing.com', origin });
assert.equal(r.ok, false); assert.equal(r.needs_email, true); assert.equal(mails.length, 0);
// bad email
r = await mod.sendInkindReceipt(env, { id: A, email: 'not-an-email', who: 'x', origin }); assert.equal(r.ok, false); assert.equal(mails.length, 0);
// good: sends, saves email, redeems, logs
r = await mod.sendInkindReceipt(env, { id: A, email: ' Jordan@Demo.com ', who: 'ryan@nextrighthing.com', origin });
assert.equal(r.ok, true); assert.equal(r.serial, 'RTR-2026-0042'); assert.equal(mails.length, 1);
assert.deepEqual(mails[0].to, ['jordan@demo.com']); assert.match(mails[0].from, /<ryan@nextrighthing\.com>$/); assert.equal(mails[0].reply_to, 'ryan@nextrighthing.com');
assert.match(mails[0].subject, /RTR-2026-0042/); assert.match(mails[0].html, /Dear Jordan Sample/); assert.match(mails[0].html, /in-kind-receipt\?code=RTIK-TEST-0001/);
assert.match(mails[0].html, /No goods or services were provided/); assert.match(mails[0].html, /EIN 93-4316358/); assert.match(mails[0].html, /The Right Thing in Recovery/);
assert.doesNotMatch(mails[0].html, /The Next Right Thing in Recovery/, 'nonprofit email must not speak as the treatment center');
assert.doesNotMatch(mails[0].html, /Masquerade/, 'untagged gift must not be called a Masquerade gift');
assert.equal(db.authorizations[0].donor_email, 'jordan@demo.com'); assert.equal(db.log.length, 1); assert.equal(db.log[0].sent_by, 'ryan@nextrighthing.com');
save('1-inkind-receipt', mails[0].html);
// second tap: no second email
r = await mod.sendInkindReceipt(env, { id: A, who: 'x', origin }); assert.equal(r.ok, true); assert.equal(r.already, true); assert.equal(mails.length, 1);
// deliberate re-send
r = await mod.sendInkindReceipt(env, { id: A, who: 'x', origin, force: true }); assert.equal(r.ok, true); assert.equal(mails.length, 2);
// masquerade tag changes the wording
db.authorizations[0].campaign = 'masquerade-2026';
r = await mod.sendInkindReceipt(env, { id: A, who: 'x', origin, force: true }); assert.match(mails[2].html, /Flannel to Formal Masquerade Fundraiser on November 13/);
save('2-inkind-receipt-masquerade', mails[2].html);
// void
db.authorizations[0].status = 'void'; r = await mod.sendInkindReceipt(env, { id: A, who: 'x', origin, force: true }); assert.equal(r.ok, false); assert.equal(mails.length, 3);
// resend failure is reported and logged as not ok, and can be retried
reset(); resendOk = false;
r = await mod.sendInkindReceipt(env, { id: A, email: 'j@demo.com', who: 'x', origin }); assert.equal(r.ok, false); assert.match(r.error, /did not send/); assert.equal(db.log[0].ok, false);
resendOk = true; r = await mod.sendInkindReceipt(env, { id: A, who: 'x', origin }); assert.equal(r.ok, true); assert.equal(r.already, undefined); assert.equal(mails.length, 1);

// 2. guest thanks
reset();
r = await mod.sendGuestThanks(env, { id: G, who: 'x', origin }); assert.equal(r.ok, true); assert.match(mails[0].html, /Dear Alex/); assert.doesNotMatch(mails[0].html, /tax records|No goods or services/);
assert.doesNotMatch(mails[0].html, /\$\d/, 'guest thank-you carries no dollar amounts');
save('3-guest-thanks', mails[0].html);
r = await mod.sendGuestThanks(env, { id: G, who: 'x', origin }); assert.equal(r.already, true); assert.equal(mails.length, 1);
db.gala_rsvps[0].pay_status = 'cancelled'; r = await mod.sendGuestThanks(env, { id: G, who: 'x', origin, force: true }); assert.equal(r.ok, false);

// 3. sponsor receipt: $300 paid, 2 tickets at $35 = $70 received, $230 over
reset();
r = await mod.sendSponsorReceipt(env, { id: S, who: 'x', origin }); assert.equal(r.ok, true); assert.equal(r.was_receipt, true);
assert.match(mails[0].html, /\$300/); assert.match(mails[0].html, /estimated value \$70/); assert.match(mails[0].html, /<b>\$230<\/b>/); assert.match(mails[0].html, /Hope Sponsor/); assert.match(mails[0].html, /RTIR-2026-9999/);
assert.doesNotMatch(mails[0].html, /No goods or services were provided/);
assert.ok(db.gala_sponsors[0].benefits_done.receipt && db.gala_sponsors[0].benefits_done.thank_you);
save('4-sponsor-receipt', mails[0].html);
// unpaid sponsor: thank-you only, no receipt table, receipt box not ticked
reset(); db.gala_sponsors[0].paid_cents = 0;
r = await mod.sendSponsorReceipt(env, { id: S, who: 'x', origin }); assert.equal(r.was_receipt, false); assert.doesNotMatch(mails[0].html, /tax records/); assert.equal(db.gala_sponsors[0].benefits_done.receipt, undefined);

// 4. tracker in-kind: staff stand-in address is refused
reset();
r = await mod.sendGalaInkindThanks(env, { id: IK, who: 'x', origin }); assert.equal(r.ok, false); assert.equal(r.needs_email, true); assert.equal(mails.length, 0);
db.gala_inkind[0].email = 'owner@democafe.com'; r = await mod.sendGalaInkindThanks(env, { id: IK, who: 'x', origin }); assert.equal(r.ok, true); save('5-inkind-thanks', mails[0].html);

// 5. auction winner: escapes titles, keyed to the winning bid
reset();
r = await mod.sendAuctionWinner(env, { id: I, who: 'x', origin }); assert.equal(r.ok, true); assert.match(mails[0].html, /Lodge night &lt;b&gt;/); assert.match(mails[0].html, /\$100/); assert.equal(db.log[0].ref_id, I + ':b1');
save('6-auction-winner', mails[0].html);
db.gala_bids[0].email = null; r = await mod.sendAuctionWinner(env, { id: I, who: 'x', origin, force: true }); assert.equal(r.ok, false);

// 6. endpoints refuse anyone who is not signed in, and never send
reset();
for (const ep of [sendEp, galaEp]) {
  const res = await ep.onRequestPost({ request: new Request(origin + '/x', { method: 'POST', body: JSON.stringify({ id: A, kind: 'guest_thanks', email: 'a@b.co' }) }), env });
  assert.equal(res.status, 401);
  // a forged identity header alone must not be trusted
  const res2 = await ep.onRequestPost({ request: new Request(origin + '/x', { method: 'POST', headers: { 'Cf-Access-Authenticated-User-Email': 'ryan@nextrighthing.com' }, body: JSON.stringify({ id: A, kind: 'guest_thanks', email: 'a@b.co' }) }), env });
  assert.equal(res2.status, 401);
}
assert.equal(mails.length, 0);
console.log('ALL PASS');
