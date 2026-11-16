// POST /in-kind-report/update { id, action: 'void' | 'unvoid' | 'delete' | 'email' | 'tag', value? }
// email = save the donor's email on the record (value: address, or '' to clear).
// tag   = mark / unmark the gift as a Masquerade gift (value: true | false), which
//         only changes the wording of the receipt email. Staff set it; nothing guesses.
// void = keeps the record but kills the code (audit-friendly); delete = removes entirely (test junk).
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const ALLOWED = allowedFor('in-kind-report');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!ALLOWED.includes(who)) return json({ ok: false, error: 'Your account does not have access to the In-Kind Report.' }, 403);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const id = (body.id || '').toString().trim();
  const action = (body.action || '').toString().trim();
  if (!id || !['void', 'unvoid', 'delete', 'email', 'tag'].includes(action)) return json({ ok: false, error: 'invalid id or action' }, 400);

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer': 'return=minimal'
  };
  const url = env.SUPABASE_URL + '/rest/v1/authorizations?id=eq.' + encodeURIComponent(id);

  if (action === 'delete') {
    const res = await fetch(url, { method: 'DELETE', headers: sbHeaders });
    if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'delete failed', detail }, 500); }
    return json({ ok: true });
  }
  if (action === 'email') {
    const v = (body.value == null ? '' : String(body.value)).trim().toLowerCase();
    if (v && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v)) return json({ ok: false, error: 'That email address does not look right.' }, 400);
    const res = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ donor_email: v || null }) });
    if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'update failed', detail }, 500); }
    return json({ ok: true, donor_email: v || null });
  }
  if (action === 'tag') {
    const campaign = body.value === true ? 'masquerade-2026' : null;
    const res = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ campaign }) });
    if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'update failed', detail }, 500); }
    return json({ ok: true, campaign });
  }
  const res = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ status: action === 'void' ? 'void' : 'issued' }) });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'update failed', detail }, 500); }
  return json({ ok: true });
}
