// POST /case/upload -> hand back a one-time signed URL for a file upload.
//
// The file never passes through this Worker. The browser gets a short-lived
// signed URL and PUTs straight to Supabase Storage, which keeps leases and IDs
// out of Cloudflare's request path entirely and sidesteps Worker body limits.
// The bucket is private, so the returned path is useless without a signature.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';

const BUCKET = 'client-docs';
const MAX_BYTES = 25 * 1024 * 1024;

// Leases, notices and IDs arrive as PDFs, photos and the occasional Word doc.
const OK_TYPES = [
  'application/pdf','image/jpeg','image/png','image/heic','image/webp','image/tiff',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'
];

const slug = s => (s||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'unknown';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});

  const ALLOWED = allowedFor('case-management');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to Case Management.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ok:false,error:'bad request'},400); }
  if (!b.resident_name) return json({ok:false,error:'resident required'},400);
  if (!b.filename) return json({ok:false,error:'filename required'},400);

  const size = Number(b.size_bytes) || 0;
  if (size > MAX_BYTES) return json({ok:false,error:'File is larger than 25 MB. Split it or photograph the pages separately.'},400);
  if (b.mime_type && !OK_TYPES.includes(b.mime_type))
    return json({ok:false,error:'That file type is not accepted. Use a PDF, a photo, or a Word document.'},400);

  // Timestamped so re-uploading a corrected lease never silently replaces the
  // original - both stay, and the newer row wins on screen.
  const clean = String(b.filename).replace(/[^A-Za-z0-9._-]+/g,'_').slice(-80);
  const path = slug(b.resident_name) + '/' + Date.now() + '-' + clean;

  const r = await fetch(env.SUPABASE_URL + '/storage/v1/object/upload/sign/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { 'Content-Type':'application/json',
               'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
               'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({})
  });
  if (!r.ok) return json({ok:false,error:'could not prepare the upload',detail:await r.text()},500);
  const d = await r.json();

  // Supabase returns a relative url like /object/upload/sign/<bucket>/<path>?token=...
  const rel = d.url || d.signedURL || '';
  return json({ ok:true, path, uploadUrl: env.SUPABASE_URL + '/storage/v1' + (rel.startsWith('/') ? rel : '/' + rel) });
}
