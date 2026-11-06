// GET /case/file?id=<document id> -> redirect to a short-lived signed URL.
//
// The bucket is private on purpose: these are leases, IDs and signed notices.
// Nothing is ever served from a permanent public link. Every open is a fresh
// signature, and every signature dies in five minutes.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

const BUCKET = 'client-docs';
const TTL = 300;

export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  const url = new URL(request.url);

  const ALLOWED = allowedFor('case-management');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error:'Not signed in.' },401);
  if (!ALLOWED.includes(who)) return json({ error:'Your account does not have access to Case Management.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const id = url.searchParams.get('id');
  if (!id) return json({ error:'id required' },400);

  const H = { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };

  // Look the path up from the row rather than trusting one in the query string,
  // so nobody can hand themselves a signature for an arbitrary object.
  const q = await fetch(env.SUPABASE_URL + '/rest/v1/documents?select=file_path&id=eq.' + encodeURIComponent(id), { headers: H });
  const rows = q.ok ? await q.json() : [];
  const path = rows[0] && rows[0].file_path;
  if (!path) return json({ error:'No file is attached to that record.' },404);

  const r = await fetch(env.SUPABASE_URL + '/storage/v1/object/sign/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type':'application/json' }, H),
    body: JSON.stringify({ expiresIn: TTL })
  });
  if (!r.ok) return json({ error:'could not sign the file', detail: await r.text() },500);
  const d = await r.json();
  const rel = d.signedURL || d.signedUrl || '';
  return Response.redirect(env.SUPABASE_URL + '/storage/v1' + (rel.startsWith('/') ? rel : '/' + rel), 302);
}
