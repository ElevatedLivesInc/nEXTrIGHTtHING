// GET /signin?next=/housing
//
// Replaces the old static signin.html, which assumed "if you can see this page,
// Cloudflare Access already signed you in" and bounced the visitor back where
// they came from. When no Access application covers /signin that assumption is
// false, and the result is a closed loop: staff page 401s -> "Sign in" button ->
// /signin -> bounce back -> 401 again, forever, never setting a cookie.
//
// This version actually checks, and either finishes the trip, hands off to the
// real Cloudflare Access login, or stops and explains itself.

const SAFE = ['/mission-control','/housing','/funding','/intake-queue','/in-kind-report',
              '/donations-report','/admin-issue','/carwash-report','/patrol/run',
              '/incident-report','/incident-log'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  // Set once we have already sent this visitor to Cloudflare and they came back
  // still anonymous. Without it a misconfigured Access app would ping-pong them
  // forever - the exact bug this file exists to kill.
  const retried = url.searchParams.get('retry') === '1';

  const email = await authedEmail(request);
  if (email) return Response.redirect(new URL(next, url.origin).toString(), 302);

  if (!retried) {
    const back = url.origin + '/signin?retry=1&next=' + encodeURIComponent(next);
    const team = env.ACCESS_TEAM_DOMAIN
      ? (env.ACCESS_TEAM_DOMAIN.endsWith('.cloudflareaccess.com')
          ? env.ACCESS_TEAM_DOMAIN : env.ACCESS_TEAM_DOMAIN + '.cloudflareaccess.com')
      : null;
    // Cloudflare answers /cdn-cgi/access/* at the edge on any zone with Access
    // switched on, so the same-origin form works without knowing the team name.
    const login = team
      ? 'https://' + team + '/cdn-cgi/access/login/' + url.hostname + '?redirect_url=' + encodeURIComponent(back)
      : url.origin + '/cdn-cgi/access/login/' + url.hostname + '?redirect_url=' + encodeURIComponent(back);
    return Response.redirect(login, 302);
  }

  return new Response(page(next, url.hostname), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function safeNext(raw) {
  const next = raw || '/mission-control';
  const path = next.split('?')[0].replace(/\/$/, '');
  // Same-site path only: one leading slash, never "//host". This is what stops
  // ?next= being used as an open redirect.
  if (next.charAt(0) !== '/' || next.charAt(1) === '/' || SAFE.indexOf(path) === -1) return '/mission-control';
  return next;
}

// Access header, or a verified CF_Authorization cookie. Walks every such cookie
// rather than only the first - browsers hold several, and a stale one sitting in
// front of a valid one was enough to reject a signed-in user outright.
async function authedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== 'CF_Authorization') continue;
    const token = part.slice(eq + 1).trim();
    if (!token) continue;
    const email = await verify(token);
    if (email) return email;
  }
  return null;
}

async function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const bytes = s => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
  } catch (_) { return null; }
  if (!payload.iss || !/^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(payload.iss)) return null;
  if (!payload.exp || payload.exp + 60 < Date.now() / 1000) return null;
  try {
    const res = await fetch(payload.iss + '/cdn-cgi/access/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!res.ok) return null;
    const certs = await res.json();
    const jwk = (certs.keys || []).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
  } catch (_) { return null; }
  return (payload.email || '').toLowerCase();
}

function page(next, hostname) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta name="robots" content="noindex, nofollow"><title>Sign in &mdash; The Next Right Thing</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Raleway:wght@300;400;600;700&display=swap" rel="stylesheet">'
    + '<style>body{background:#121c33;color:#fff;font-family:Raleway,sans-serif;min-height:100vh;display:flex;'
    + 'align-items:center;justify-content:center;padding:2rem 1.4rem;margin:0}.card{max-width:520px;text-align:center}'
    + 'h1{font-family:"Cormorant Garamond",serif;font-weight:300;font-size:2rem;margin:0 0 .6rem}h1 em{color:#e8d5b0;font-style:italic}'
    + 'p{color:rgba(255,255,255,.72);font-weight:300;line-height:1.75;font-size:.95rem;margin:0 0 1.2rem}'
    + 'code{background:rgba(255,255,255,.08);padding:.15rem .4rem;border-radius:4px;font-size:.82rem;color:#e8d5b0}'
    + 'a.btn{display:inline-block;background:linear-gradient(145deg,#e8d5b0,#c9a96e);color:#1a2744;font-weight:700;'
    + 'padding:.85rem 1.8rem;border-radius:7px;text-decoration:none;font-size:.9rem}'
    + '.quiet{font-size:.78rem;color:rgba(255,255,255,.45);margin-top:1.6rem;line-height:1.8}</style></head><body><div class="card">'
    + '<h1>Not signed <em>in</em> yet</h1>'
    + '<p>You were sent to Cloudflare to sign in and came back without an identity. That almost always means no Cloudflare Access application covers <code>' + esc(hostname) + '</code> yet, so there is nothing to log in to.</p>'
    + '<p class="quiet">Fix: in Zero Trust &rarr; Access controls &rarr; Applications, add an application for <code>' + esc(hostname) + '</code> covering <code>/signin</code>, with a policy allowing your staff emails.</p>'
    + '<div style="margin-top:1.4rem"><a class="btn" href="' + esc(next) + '">Try ' + esc(next) + ' again</a></div>'
    + '<div class="quiet">The Next Right Thing in Recovery</div></div></body></html>';
}
