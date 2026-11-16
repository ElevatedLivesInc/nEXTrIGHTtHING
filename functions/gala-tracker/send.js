// POST /gala-tracker/send { kind, id, force? }
// One-tap Masquerade emails, sent as The Right Thing in Recovery:
//   guest_thanks    -> a guest (gala_rsvps id)
//   sponsor_receipt -> a sponsor: thank-you plus receipt when money was collected
//   inkind_thanks   -> an in-kind donor on the tracker
//   auction_winner  -> the leading bidder on an auction item (gala_auction_items id)
// Same roster as the tracker. Every send is logged; a repeat tap does not re-send
// unless force is true.
import { gate, json, sendGuestThanks, sendSponsorReceipt, sendGalaInkindThanks, sendAuctionWinner } from '../_lib/outbox.js';

const KINDS = { guest_thanks: sendGuestThanks, sponsor_receipt: sendSponsorReceipt, inkind_thanks: sendGalaInkindThanks, auction_winner: sendAuctionWinner };

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'gala-tracker'); if (g.res) return g.res;
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const fn = KINDS[b && b.kind];
  const id = String((b && b.id) || '').trim();
  if (!fn) return json({ ok: false, error: 'Unknown email type.' }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: 'invalid id' }, 400);
  try {
    const out = await fn(env, { id, who: g.who, origin: new URL(request.url).origin, force: b.force === true });
    return json(out, out.ok ? 200 : (out.needs_email ? 422 : 500));
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}
