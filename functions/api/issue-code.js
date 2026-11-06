// Cloudflare Pages Function  ->  POST /api/issue-code
// Creates an authorization (code) for an agreed in-kind donation.
// PROTECT THIS ROUTE WITH CLOUDFLARE ACCESS so only Ryan can call it.
//
// Required environment variables (Pages > Settings > Environment variables):
//   SUPABASE_URL               = https://YOUR-PROJECT.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  = (service_role secret, NEVER shipped to browser)

function genCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return 'RTIK-' + s.slice(0, 4) + '-' + s.slice(4);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }

  const donor_name = (body.donor_name || '').trim();
  const description = (body.description || '').trim();
  if (!donor_name || !description) {
    return json({ error: 'Donor and description are required.' }, 400);
  }

  // audit: who issued it (from Cloudflare Access)
  const createdBy = request.headers.get('Cf-Access-Authenticated-User-Email') || 'admin';

  const record = {
    donor_name,
    donor_contact: (body.donor_contact || '').trim() || null,
    description,
    donor_value: body.donor_value ? Number(String(body.donor_value).replace(/[^0-9.]/g, '')) : null,
    date_of_donation: body.date_of_donation || null,
    created_by: createdBy,
    status: 'issued'
  };

  // retry once on the rare code collision
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = genCode();
    const res = await fetch(env.SUPABASE_URL + '/rest/v1/authorizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ ...record, code })
    });

    if (res.ok) {
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      return json({
        code: row.code,
        donor_name: row.donor_name,
        description: row.description,
        donor_value: row.donor_value,
        date_of_donation: row.date_of_donation
      });
    }
    const err = await res.text();
    if (!err.includes('duplicate') && res.status !== 409) {
      return json({ error: 'Could not create code.', detail: err }, 500);
    }
  }
  return json({ error: 'Please try again.' }, 500);
}
