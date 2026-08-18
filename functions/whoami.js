// GET /whoami -> tells you exactly why you are or are not signed in.
// Safe to leave deployed: it reveals only the caller's own identity and
// boolean "is this configured" flags. No secrets, no other users' data.
import { authenticate, REASON } from './_lib/auth.js';
import { ROSTER } from './_lib/roster.js';


const EXPLAIN = {
  [REASON.NO_IDENTITY]:
    'This request carried no Cloudflare Access header and no CF_Authorization cookie. Either no Access application covers this hostname, or you have never completed an Access login on this exact hostname.',
  [REASON.COOKIE_MALFORMED]:
    'A CF_Authorization cookie exists but is not a readable JWT. Clear cookies for this domain and sign in again.',
  [REASON.BAD_ISSUER]:
    'The token was issued by something other than the expected Cloudflare Access team domain.',
  [REASON.EXPIRED]:
    'Your Access session has expired. Sign in again.',
  [REASON.BAD_AUDIENCE]:
    'The token is valid but was issued for a different Access application than the one configured in ACCESS_AUD.',
  [REASON.JWKS_UNREACHABLE]:
    'Could not reach the Access signing keys. Usually transient.',
  [REASON.KID_NOT_FOUND]:
    'The token was signed with a key this team domain no longer publishes. Sign in again.',
  [REASON.SIGNATURE_INVALID]:
    'Signature check failed. Treat this token as untrusted.',
  [REASON.NO_EMAIL]:
    'The token verified but carries no email claim. Check the Access identity provider configuration.',
  [REASON.OK]: 'Signed in.'
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieCount = (cookieHeader.match(/(?:^|;)\s*CF_Authorization=/g) || []).length;

  const result = await authenticate(request, env);

  const body = {
    hostname: url.hostname,
    path: url.pathname,
    signedIn: !!result.email,
    email: result.email,
    identitySource: result.source,
    reason: result.reason,
    explanation: EXPLAIN[result.reason] || result.reason,
    accessHeaderPresent: !!request.headers.get('Cf-Access-Authenticated-User-Email'),
    accessCookieCount: cookieCount,
    tokenClaims: result.claims || null,
    config: {
      supabaseUrlBound: !!env.SUPABASE_URL,
      serviceRoleKeyBound: !!env.SUPABASE_SERVICE_ROLE_KEY,
      accessTeamDomainPinned: !!env.ACCESS_TEAM_DOMAIN,
      accessAudPinned: !!env.ACCESS_AUD
    },
    access: result.email
      ? Object.fromEntries(Object.entries(ROSTER).map(([k, v]) => [k, v.includes(result.email)]))
      : null
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
