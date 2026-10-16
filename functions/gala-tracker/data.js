// GET  /gala-tracker/data -> everything the Masquerade tracker shows (RSVPs, sponsors, in-kind, drawing).
// POST /gala-tracker/data -> staff edits: { action:'update'|'insert'|'goal'|'pick_winner', ... }
// Nonprofit (donor-side) data: The Right Thing in Recovery. Same roster rules as the in-kind report.
// FAIL-CLOSED: refuses unless the request proves a staff identity through Cloudflare Access.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

const SLUG = 'masquerade-2026';
const TABLES = {
  gala_rsvps: ['full_name','email','phone','individual_qty','couple_qty','guest_names','dietary','attire','pay_status','source','sponsor_id','checked_in','staff_notes','photo_consent'],
  gala_sponsors: ['business_name','contact_name','email','phone','website','tier','amount_cents','paid_cents','status','display_name','logo_url','logo_received','show_publicly','message','benefits_done','tickets_issued','receipt_number','staff_notes','photo_consent'],
  gala_inkind: ['donor_name','business_name','email','phone','category','description','est_value_cents','delivery','status','show_publicly','receipt_number','staff_notes','photo_consent'],
  gala_drawing: ['full_name','email','phone','is_winner','photo_consent'],
  gala_auction_items: ['sort','title','donor','description','value_label','icon','start_bid_cents','increment_cents','active','winner_paid','staff_notes'],
  gala_bids: ['voided'],
  gala_stars: ['paid','dedication'],
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const pick = (obj, allowed) => { const out = {}; for (const k of allowed) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; return out; };

async function sb(env, path, init = {}) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ': ' + text);
  return text ? JSON.parse(text) : null;
}

async function gate(request, env) {
  const who = await getAuthedEmail(request, env);
  if (!who) return { res: json({ error: 'Not signed in. Open Mission Control to log in, then reload.' }, 401) };
  if (!allowedFor('gala-tracker').includes(who)) return { res: json({ error: 'Your account does not have access to the Masquerade tracker.' }, 403) };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { res: json({ error: 'not configured' }, 500) };
  return { who };
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env); if (g.res) return g.res;
  try {
    const q = 'event_slug=eq.' + SLUG + '&order=created_at.desc';
    const [event, rsvps, sponsors, inkind, drawing, auction, bids, stars] = await Promise.all([
      sb(env, 'gala_event?slug=eq.' + SLUG), sb(env, 'gala_rsvps?' + q), sb(env, 'gala_sponsors?' + q), sb(env, 'gala_inkind?' + q), sb(env, 'gala_drawing?' + q),
      sb(env, 'gala_auction_items?event_slug=eq.' + SLUG + '&order=sort.asc,title.asc'), sb(env, 'gala_bids?event_slug=eq.' + SLUG + '&order=amount_cents.desc,created_at.asc'), sb(env, 'gala_stars?' + q),
    ]);
    return json({ who: g.who, event: event[0] || null, rsvps, sponsors, inkind, drawing, auction, bids, stars });
  } catch (e) { return json({ error: 'load failed', detail: String(e.message || e) }, 500); }
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env); if (g.res) return g.res;
  let body; try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const { action, table, id } = body || {};
  try {
    if (action === 'goal') {
      const goal = body.goal_cents === null ? null : Math.max(0, parseInt(body.goal_cents, 10) || 0);
      const r = await sb(env, 'gala_event?slug=eq.' + SLUG, { method: 'PATCH', body: JSON.stringify({ goal_cents: goal }) });
      return json(r[0]);
    }
    if (action === 'ticket_value') {
      const v = Math.max(0, parseInt(body.ticket_value_cents, 10) || 0);
      const r = await sb(env, 'gala_event?slug=eq.' + SLUG, { method: 'PATCH', body: JSON.stringify({ ticket_value_cents: v }) });
      return json(r[0]);
    }
    if (action === 'pick_winner') {
      const pool = await sb(env, 'gala_drawing?event_slug=eq.' + SLUG + '&is_winner=eq.false&select=id');
      if (!pool.length) return json({ error: 'No eligible entries left.' }, 400);
      const buf = new Uint32Array(1); crypto.getRandomValues(buf);
      const r = await sb(env, 'gala_drawing?id=eq.' + pool[buf[0] % pool.length].id, { method: 'PATCH', body: JSON.stringify({ is_winner: true }) });
      return json({ winner: r[0], pool_size: pool.length, drawn_by: g.who, drawn_at: new Date().toISOString() });
    }
    if (!TABLES[table]) return json({ error: 'Unknown table.' }, 400);
    const row = pick(body.row || body.patch, TABLES[table]);
    if (action === 'insert') {
      const r = await sb(env, table, { method: 'POST', body: JSON.stringify({ ...row, event_slug: SLUG }) });
      return json(r[0]);
    }
    if (action === 'update' && /^[0-9a-f-]{36}$/i.test(id || '')) {
      const r = await sb(env, table + '?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(row) });
      return json(r[0]);
    }
    return json({ error: 'Bad request.' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
