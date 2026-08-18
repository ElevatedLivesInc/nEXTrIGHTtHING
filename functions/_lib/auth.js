// functions/_lib/auth.js
// Single source of truth for staff identity. Every protected endpoint imports
// from here so a fix lands once instead of fourteen times.
//
// Two ways a request can prove who it is:
//   1. Cf-Access-Authenticated-User-Email  - injected by Cloudflare Access when
//      the request URL is covered by an Access application.
//   2. CF_Authorization cookie             - the Access JWT, verified here.
//      Used when the page is Access-protected but the API path is not.
//
// Files and folders under functions/ whose name starts with "_" are not routed
// by Cloudflare Pages, so this module is importable but never publicly served.

const SKEW = 60; // seconds of clock tolerance

// Reason codes, surfaced by /whoami so a 401 in production is self-explaining.
export const REASON = {
  OK: 'ok',
  NO_IDENTITY: 'no_identity',           // no Access header and no CF_Authorization cookie
  COOKIE_MALFORMED: 'cookie_malformed', // cookie present but not a three-part JWT
  BAD_ISSUER: 'bad_issuer',             // iss is not a *.cloudflareaccess.com team domain
  EXPIRED: 'expired',                   // exp in the past (or nbf in the future)
  BAD_AUDIENCE: 'bad_audience',         // aud does not match ACCESS_AUD
  JWKS_UNREACHABLE: 'jwks_unreachable', // could not fetch the team's signing keys
  KID_NOT_FOUND: 'kid_not_found',       // token signed by a key not in the JWKS
  SIGNATURE_INVALID: 'signature_invalid',
  NO_EMAIL: 'no_email'                  // token verified but carries no email claim
};

function b64uToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeSegment(seg) {
  return JSON.parse(new TextDecoder().decode(b64uToBytes(seg)));
}

// A browser can hold more than one CF_Authorization cookie at a time - one per
// Access application, and stale ones linger after an app's path changes. The
// old code matched only the first and gave up if it failed, which reads as a
// 401 even though a perfectly good token was sitting later in the header.
function allAccessCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  const out = [];
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== 'CF_Authorization') continue;
    const v = part.slice(eq + 1).trim();
    if (v) out.push(v);
  }
  return out;
}

async function jwksFor(issuer) {
  const url = issuer + '/cdn-cgi/access/certs';
  // Cloudflare rotates these keys slowly; caching keeps us off the hot path.
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) return null;
  try { return await res.json(); } catch (_) { return null; }
}

async function verifyToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return { email: null, reason: REASON.COOKIE_MALFORMED };

  let header, payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch (_) {
    return { email: null, reason: REASON.COOKIE_MALFORMED };
  }

  const issuerOk = typeof payload.iss === 'string'
    && /^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(payload.iss)
    && (!env || !env.ACCESS_TEAM_DOMAIN || payload.iss === 'https://' + env.ACCESS_TEAM_DOMAIN);
  if (!issuerOk) return { email: null, reason: REASON.BAD_ISSUER, claims: safeClaims(payload) };

  const now = Date.now() / 1000;
  if (!payload.exp || payload.exp + SKEW < now) return { email: null, reason: REASON.EXPIRED, claims: safeClaims(payload) };
  if (payload.nbf && payload.nbf - SKEW > now) return { email: null, reason: REASON.EXPIRED, claims: safeClaims(payload) };

  // aud pins the token to one Access application. Only enforced when ACCESS_AUD
  // is configured, so setting it is an opt-in tightening rather than a breakage.
  if (env && env.ACCESS_AUD) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return { email: null, reason: REASON.BAD_AUDIENCE, claims: safeClaims(payload) };
  }

  const certs = await jwksFor(payload.iss);
  if (!certs) return { email: null, reason: REASON.JWKS_UNREACHABLE, claims: safeClaims(payload) };

  const jwk = (certs.keys || []).find(k => k.kid === header.kid);
  if (!jwk) return { email: null, reason: REASON.KID_NOT_FOUND, claims: safeClaims(payload) };

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64uToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1])
    );
    if (!ok) return { email: null, reason: REASON.SIGNATURE_INVALID, claims: safeClaims(payload) };
  } catch (_) {
    return { email: null, reason: REASON.SIGNATURE_INVALID, claims: safeClaims(payload) };
  }

  const email = (payload.email || '').toLowerCase();
  if (!email) return { email: null, reason: REASON.NO_EMAIL, claims: safeClaims(payload) };
  return { email, reason: REASON.OK, claims: safeClaims(payload) };
}

// Never echo the raw token. These three claims are enough to diagnose.
function safeClaims(p) {
  return { iss: p && p.iss, aud: p && p.aud, exp: p && p.exp, email: p && p.email };
}

// Full result: { email, source, reason, claims }
export async function authenticate(request, env) {
  const headerEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (headerEmail) {
    return { email: headerEmail.toLowerCase(), source: 'access-header', reason: REASON.OK };
  }

  const cookies = allAccessCookies(request);
  if (!cookies.length) {
    return { email: null, source: 'none', reason: REASON.NO_IDENTITY };
  }

  let last = { email: null, source: 'cookie', reason: REASON.COOKIE_MALFORMED };
  for (const token of cookies) {
    const r = await verifyToken(token, env);
    if (r.email) return { ...r, source: 'cookie' };
    last = { ...r, source: 'cookie' };
  }
  return last;
}

// Backwards-compatible shim: same signature and return value as the old
// per-file helper, so existing call sites keep working unchanged.
export async function getAuthedEmail(request, env) {
  const r = await authenticate(request, env);
  return r.email;
}
