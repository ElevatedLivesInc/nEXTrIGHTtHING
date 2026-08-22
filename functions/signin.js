// GET /signin?next=/funding
//
// This replaces the old static signin.html. That page assumed "if you can see
// this, Cloudflare Access already signed you in" and bounced you straight back
// to where you came from. When Access does NOT cover /signin, that assumption
// is false and the result is a loop: staff page 401s -> "Sign in" button ->
// /signin -> bounce back -> 401 again, forever, with no way out.
//
// As a Function we can actually check, and either finish the trip or say
// plainly what is wrong instead of spinning.
import { authenticate } from './_lib/auth.js';

// Every staff destination that may send someone here after a 401. Anything not
// on this list falls back to Mission Control, which is what stops ?next= from
// being used as an open redirect. /incident-report and /incident-log were
// missing, so staff bounced off those two pages landed on the wrong screen.
const SAFE = ['/mission-control','/housing','/funding','/intake-queue','/in-kind-report',
              '/donations-report','/admin-issue','/carwash-report','/patrol/run',
              '/incident-report','/incident-log','/case-management','/rounds'];

function safeNext(raw) {
  const next = raw || '/mission-control';
  // Same-site path only: one leading slash, never "//host". Query string kept
  // so things like ?preview=1 survive the round trip.
  const path = next.split('?')[0].replace(/\/$/, '');
  if (next.charAt(0) !== '/' || next.charAt(1) === '/' || SAFE.indexOf(path) === -1) {
    return '/mission-control';
  }
  return next;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  // Set once we have already bounced this visitor to Cloudflare and they came
  // back still anonymous. Without it, a misconfigured Access app would ping-pong
  // them between here and the login screen forever - the exact bug this file
  // exists to kill.
  const retried = url.searchParams.get('retry') === '1';

  const who = await authenticate(request, env);

  if (who.email) {
    return Response.redirect(new URL(next, url.origin).toString(), 302);
  }

  if (!retried) {
    return Response.redirect(loginUrl(url, next, env), 302);
  }

  // Came back from Cloudflare with no identity. Stop and explain - a dead end
  // you can read beats a loop you cannot escape.
  return new Response(page(next, who.reason, url.hostname), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

// Where to send someone who needs to authenticate.
//
// Coming back to /signin?retry=1 rather than straight to the destination means
// that after Cloudflare sets the cookie we get one more turn to confirm the
// identity actually arrived, and to say so plainly if it did not.
function loginUrl(url, next, env) {
  const back = url.origin + '/signin?retry=1&next=' + encodeURIComponent(next);

  if (env.ACCESS_TEAM_DOMAIN) {
    const team = env.ACCESS_TEAM_DOMAIN.endsWith('.cloudflareaccess.com')
      ? env.ACCESS_TEAM_DOMAIN
      : env.ACCESS_TEAM_DOMAIN + '.cloudflareaccess.com';
    return 'https://' + team + '/cdn-cgi/access/login/' + url.hostname
         + '?redirect_url=' + encodeURIComponent(back);
  }

  // No team domain configured. Cloudflare answers /cdn-cgi/access/* at the edge
  // on any zone with Access switched on, so this reaches the same login screen
  // without us having to know the team name. If Access is not set up at all,
  // Cloudflare returns its own error here - which is a clear failure rather
  // than a silent bounce back to where we started.
  return url.origin + '/cdn-cgi/access/login/' + url.hostname
       + '?redirect_url=' + encodeURIComponent(back);
}

function page(next, reason, hostname) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — The Next Right Thing</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Raleway:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--navy:#1a2744;--deep:#121c33;--sand:#c9a96e;--sandl:#e8d5b0;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--deep);color:#fff;font-family:'Raleway',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem 1.4rem;}
  .card{max-width:520px;text-align:center;}
  h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2rem;margin-bottom:.6rem;}
  h1 em{color:var(--sandl);font-style:italic;}
  p{color:rgba(255,255,255,.72);font-weight:300;line-height:1.75;font-size:.95rem;margin-bottom:1.2rem;}
  a.btn{display:inline-block;background:linear-gradient(145deg,#e8d5b0,var(--sand));color:#1a2744;font-weight:700;padding:.85rem 1.8rem;border-radius:7px;text-decoration:none;font-size:.9rem;}
  code{background:rgba(255,255,255,.08);padding:.15rem .4rem;border-radius:4px;font-size:.82rem;color:var(--sandl);}
  .quiet{font-size:.78rem;color:rgba(255,255,255,.42);margin-top:1.6rem;line-height:1.8;}
</style>
</head>
<body>
<div class="card">
  <h1>Not signed <em>in</em> yet</h1>
  <p>Cloudflare Access has not given this browser an identity on <code>${escapeHtml(hostname)}</code>, so the staff systems cannot let you through.</p>
  <p class="quiet">Diagnostic: <code>${escapeHtml(reason || 'unknown')}</code><br>
  Open <a href="/whoami" style="color:var(--sand)">/whoami</a> for the full picture.</p>
  <p class="quiet">You were sent to Cloudflare to sign in and came back without an identity. That almost always means no Cloudflare Access application covers this hostname yet, so there is nothing to log in to.</p>
  <p class="quiet">Fix: in Zero Trust &rarr; Access controls &rarr; Applications, add an application for <code>${escapeHtml(hostname)}</code> covering <code>/signin</code>, with a policy allowing your staff emails.</p>
  <div style="margin-top:1.4rem"><a class="btn" href="${escapeHtml(next)}">Try ${escapeHtml(next)} again</a></div>
  <div class="quiet">The Next Right Thing in Recovery</div>
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
