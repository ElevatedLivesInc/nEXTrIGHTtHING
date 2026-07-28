// GET /mission-control/summary -> cross-system counts for the hub
export async function onRequestGet(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  const who = await getAuthedEmail(request);
  if (!who) return json({ error:'Not signed in.' },401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);
  const h = { 'apikey':env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get = async (path)=>{ try{ const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+path,{headers:h}); return r.ok? await r.json():[]; }catch(_){ return []; } };

  const [intake, inkind, apps] = await Promise.all([
    get('intake_requests?select=id,status,last_use,created_at&limit=1000'),
    get('authorizations?select=id,status,donor_value&limit=1000'),
    get('funding_applications?select=id,status,coverage_end,resident_name&limit=1000')
  ]);

  const openIntake = intake.filter(r=>(r.status||'new')!=='closed');
  const hot = openIntake.filter(r=>['today','this week'].includes((r.last_use||'').toLowerCase()));
  const soon = new Date(Date.now()+30*24*3600*1000);
  const expiring = apps.filter(a=>a.status==='approved' && a.coverage_end && new Date(a.coverage_end) <= soon && new Date(a.coverage_end) >= new Date());

  return json({
    viewer: who,
    intake: { total:intake.length, open:openIntake.length, new:intake.filter(r=>(r.status||'new')==='new').length, urgent:hot.length, intaked:intake.filter(r=>r.status==='intaked').length },
    inkind: { total:inkind.length, redeemed:inkind.filter(r=>(r.status||'')==='redeemed').length, pending:inkind.filter(r=>(r.status||'issued')==='issued').length, value:inkind.reduce((t,r)=>t+(Number(r.donor_value)||0),0) },
    funding: { applications:apps.length, approved:apps.filter(a=>a.status==='approved').length, pending:apps.filter(a=>a.status==='applied').length, denied:apps.filter(a=>a.status==='denied').length, expiringSoon:expiring.length, expiringList:expiring.slice(0,8).map(a=>({name:a.resident_name,end:a.coverage_end})) }
  });
}

// --- staff auth: Access header OR verified CF_Authorization cookie ---
async function getAuthedEmail(request) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h.toLowerCase();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const b64u = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length+(4-s.length%4)%4,'=')), c => c.charCodeAt(0));
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  } catch (_) { return null; }
  if (!payload.iss || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(payload.iss)) return null;
  if (!payload.exp || payload.exp < Date.now()/1000) return null;
  try {
    const certsRes = await fetch(payload.iss + '/cdn-cgi/access/certs');
    if (!certsRes.ok) return null;
    const certs = await certsRes.json();
    const jwk = (certs.keys||[]).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0]+'.'+parts[1]));
    if (!ok) return null;
  } catch (_) { return null; }
  return (payload.email||'').toLowerCase();
}
