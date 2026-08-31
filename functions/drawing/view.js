// POST /drawing/view -> public, anonymous. Records one page load. No PII, no
// cookies, nothing that could identify a visitor - just a count of hits per
// page, so staff can tell whether anyone is actually looking at a campaign
// page instead of guessing from social engagement alone.
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false }, 500);

  let b; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const page = String(b.page || '').trim().slice(0, 80);
  if (!page) return json({ ok: false }, 400);

  const H = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer': 'return=minimal'
  };
  // A failed beacon should never surface an error to a visitor - it's a
  // count, not something the page's own function depends on.
  try {
    await fetch(env.SUPABASE_URL + '/rest/v1/page_views', { method: 'POST', headers: H, body: JSON.stringify({ page }) });
  } catch (_) {}
  return json({ ok: true });
}
