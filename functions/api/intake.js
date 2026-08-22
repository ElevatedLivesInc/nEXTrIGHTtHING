// POST /api/intake -> saves a pre-intake request (self/family) to Supabase.
// Uses the same env vars already configured for the car wash:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  const clean = (v, max) => (v || '').toString().trim().slice(0, max);
  const record = {
    first_name:        clean(body.first_name, 120),
    last_name:         clean(body.last_name, 120),
    email:             clean(body.email, 200),
    phone:             clean(body.phone, 60),
    reaching_as:       clean(body.reaching_as, 20),
    insurance:         clean(body.insurance, 60),
    insurance_company: clean(body.insurance_company, 120),
    needs_housing:     clean(body.needs_housing, 20),
    probation_parole:  clean(body.probation_parole, 30),
    primary_substance: clean(body.primary_substance, 120),
    last_use:          clean(body.last_use, 40),
    motivation:        clean(body.motivation, 500),
    best_time:         clean(body.best_time, 20),
    message:           clean(body.message, 2000),
    // Which door they actually came through - get-help.html and index.html
    // both build this client-side (which "door" was clicked, or a utm_source
    // tag on the link that brought them here). Was being collected and
    // thrown away here; this is the only place it gets saved.
    source:            clean(body.source, 160),
    status:            'new'
  };
  if (!record.first_name && !record.email && !record.phone) return json({ ok: false, error: 'empty' }, 400);

  const res = await fetch(env.SUPABASE_URL + '/rest/v1/intake_requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  });
  if (!res.ok) { const detail = await res.text(); return json({ ok: false, error: 'save failed', detail }, 500); }

  // Auto-reply to the person reaching out (activates automatically once RESEND_API_KEY is set).
  // Deliberately generic — no details from their submission are echoed back.
  if (env.RESEND_API_KEY && record.email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.RESEND_API_KEY
        },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'The Next Right Thing in Recovery <intake@nextrighthing.com>',
          to: [record.email],
          subject: 'We got your message — The Next Right Thing in Recovery',
          html: '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a2744;line-height:1.7">'
            + '<h2 style="font-weight:400">You did it. That was the hardest part.</h2>'
            + '<p>We received your message, and a member of our intake team will personally call or text you within <strong>one business day</strong> — often sooner.</p>'
            + '<p><strong>What happens next:</strong> our intake coordinator will reach out at the time you told us works best, answer your questions, and walk you through the next steps at your pace. No pressure, no judgment.</p>'
            + '<p>If you need to talk to someone right away, call us at <a href="tel:8018164977">(801) 816-4977</a>.</p>'
            + '<p style="background:#f4f0e8;padding:12px 16px;border-left:3px solid #c9a96e">If you are in crisis right now, call or text <strong>988</strong> — the Suicide &amp; Crisis Lifeline is available 24/7.</p>'
            + '<p>— The Next Right Thing in Recovery<br>8901 South 1300 West, West Jordan, UT</p>'
            + '</div>'
        })
      });
    } catch (_) { /* never block the intake on email issues */ }
  }

  return json({ ok: true });
}
