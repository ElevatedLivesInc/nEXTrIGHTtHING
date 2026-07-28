// GET|POST /patrol/run  -> builds the morning digest and emails each role.
// Two ways to trigger:
//   1) A staff member opens /patrol/run in a browser (must be logged in) -> preview + send
//   2) A cron service calls /patrol/run?key=YOUR_PATROL_KEY  -> sends automatically
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, PATROL_KEY (optional), RESEND_FROM (optional)

const TEAM = {
  intake:  ['bailey@nextrighthing.com'],
  donations:['ryan@nextrighthing.com'],
  leadership:['gabe@nextrighthing.com','cateo@nextrighthing.com']
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const json=(o,s=200)=>new Response(JSON.stringify(o,null,2),{status:s,headers:{'Content-Type':'application/json'}});

  const keyOk = env.PATROL_KEY && url.searchParams.get('key') === env.PATROL_KEY;
  const who = keyOk ? 'cron' : await getAuthedEmail(request);
  if (!who) return json({ error:'Not signed in, and no valid key. Log in at a staff page, or call with ?key=' },401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const h={ 'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get=async p=>{ try{const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok? await r.json():[];}catch(_){return [];} };

  const [intake, inkind, apps, residents] = await Promise.all([
    get('intake_requests?select=*&limit=1000'),
    get('authorizations?select=*&limit=1000'),
    get('funding_applications?select=*&limit=1000'),
    get('residents?select=*&limit=1000')
  ]);

  const now=Date.now(), DAY=86400000;
  const age=d=>d? Math.floor((now-new Date(d).getTime())/DAY) : null;
  const until=d=>d? Math.ceil((new Date(d+'T00:00:00').getTime()-now)/DAY) : null;

  // ---------- INTAKE ----------
  const open = intake.filter(r=>(r.status||'new')!=='closed');
  const urgent = open.filter(r=>['today','this week'].includes((r.last_use||'').toLowerCase()));
  const urgentStale = urgent.filter(r=>(r.status||'new')==='new' && age(r.created_at)>=1);
  const newOvernight = intake.filter(r=>age(r.created_at)!==null && age(r.created_at)<=1);
  const silent = open.filter(r=>(r.status||'new')!=='new' && age(r.created_at)>=14 && (r.status!=='intaked'));
  const ready = open.filter(r=>(r.checks||'').includes('Insurance verified') && (r.checks||'').includes('Assessment scheduled') && r.status!=='intaked');

  // ---------- FUNDING ----------
  const expiring = apps.filter(a=>a.status==='approved' && a.coverage_end && until(a.coverage_end)!==null && until(a.coverage_end)<=30 && until(a.coverage_end)>=0);
  const pendingLong = apps.filter(a=>a.status==='applied' && age(a.created_at)>=14);

  // ---------- DONATIONS ----------
  const unredeemed = inkind.filter(r=>(r.status||'issued')==='issued' && age(r.created_at)>=7);
  const noEmail = inkind.filter(r=>(r.status||'issued')!=='void' && !(r.donor_contact||'').includes('@'));

  // ---------- HOUSING ----------
  const active = residents.filter(r=>(r.status||'active')==='active');
  const openBeds = residents.filter(r=>(r.status||'')==='open');
  const owing = active.filter(r=>((Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0))>0);
  const bigDebt = owing.filter(r=>((Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0))>=1500);
  const fundingCliff = active.filter(r=>r.funding_end && until(r.funding_end)!==null && until(r.funding_end)<=30 && until(r.funding_end)>=0);
  const docsMissing = active.filter(r=>!(r.has_id&&r.has_ss_card&&r.has_birth_cert));
  const byHouse={};
  residents.forEach(r=>{ const k=r.house_name||'—'; byHouse[k]=byHouse[k]||{beds:0,open:0}; byHouse[k].beds++; if((r.status||'')==='open')byHouse[k].open++; });

  const li=(t)=>'<li style="margin:.3rem 0">'+t+'</li>';
  const sec=(title,items)=> items.length? '<h3 style="font-family:Georgia,serif;color:#1a2744;margin:1.2rem 0 .4rem;font-size:1.05rem">'+title+'</h3><ul style="margin:0;padding-left:1.1rem;color:#333;font-size:.92rem">'+items.join('')+'</ul>' : '';
  const wrap=(title,inner)=>'<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a2744">'
    +'<div style="border-bottom:3px solid #c9a96e;padding-bottom:.6rem;margin-bottom:1rem">'
    +'<div style="font-family:Georgia,serif;font-size:1.5rem">'+title+'</div>'
    +'<div style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#888">The Next Right Thing · '+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+'</div></div>'
    + (inner || '<p style="color:#555">Nothing needs attention today. Queues are clear.</p>')
    +'<p style="margin-top:1.6rem;font-size:.8rem;color:#888;border-top:1px solid #eee;padding-top:.8rem">Open Mission Control: <a href="https://nextrighthing.com/mission-control">nextrighthing.com/mission-control</a></p></div>';

  const intakeBody = wrap('Intake Brief',
    sec('Reach out today', urgentStale.map(r=>li('<b>'+(r.first_name||'')+' '+(r.last_name||'')+'</b> — recent use, still marked New'+(r.phone?' · '+r.phone:'')))) +
    sec('New overnight', newOvernight.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+(r.needs_housing==='Yes'?' · needs housing':'')+(r.insurance?' · '+r.insurance:'')))) +
    sec('Ready for intake', ready.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+' — checklist complete, move to Intaked once scheduled'))) +
    sec('Gone quiet (14+ days)', silent.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+' — no status change'))) +
    sec('Funding coverage ending soon', expiring.map(a=>li('<b>'+a.resident_name+'</b> — '+a.funder_name+' ends '+a.coverage_end+' ('+until(a.coverage_end)+' days)'))) +
    sec('Applications pending 14+ days', pendingLong.map(a=>li(a.resident_name+' — '+a.funder_name+', follow up')))
  );

  const donationBody = wrap('Donations Brief',
    sec('Codes issued but never redeemed (7+ days)', unredeemed.map(r=>li('<b>'+r.donor_name+'</b> — '+r.code+' · '+(r.description||'')))) +
    sec('Donations missing an email address', noEmail.slice(0,10).map(r=>li(r.donor_name+' — no email captured, no thank-you possible')))
  );

  const houseLines = Object.keys(byHouse).map(k=>li(k+': '+byHouse[k].open+' open of '+byHouse[k].beds+' beds'));
  const leadershipBody = wrap('Daily Command Brief',
    sec('Intake', [
      li('New requests: '+intake.filter(r=>(r.status||'new')==='new').length),
      li('Flagged urgent: '+urgent.length+(urgentStale.length?' — <b>'+urgentStale.length+' untouched over 24h</b>':'')),
      li('Ready for intake: '+ready.length)
    ]) +
    sec('Funding', [
      li('Approved active: '+apps.filter(a=>a.status==='approved').length),
      li('Coverage ending within 30 days: '+expiring.length+(expiring.length?' — '+expiring.slice(0,4).map(a=>a.resident_name).join(', '):''))
    ]) +
    (residents.length? sec('Housing', houseLines.concat([
      li('Residents owing: '+owing.length+(bigDebt.length?' · <b>'+bigDebt.length+' over $1,500</b>':'')),
      li('Funding cliffs in 30 days: '+fundingCliff.length),
      li('Missing core documents: '+docsMissing.length+' of '+active.length+' residents')
    ])):'') +
    sec('Donations', [
      li('In-kind codes pending redemption: '+inkind.filter(r=>(r.status||'issued')==='issued').length),
      li('Total declared in-kind value: $'+inkind.reduce((t,r)=>t+(Number(r.donor_value)||0),0).toLocaleString('en-US'))
    ])
  );

  const messages = [
    { to:TEAM.intake, subject:'Intake Brief — '+urgentStale.length+' urgent, '+newOvernight.length+' new', html:intakeBody },
    { to:TEAM.donations, subject:'Donations Brief — '+unredeemed.length+' codes awaiting receipts', html:donationBody },
    { to:TEAM.leadership, subject:'Daily Command Brief — The Next Right Thing', html:leadershipBody }
  ];

  const preview = url.searchParams.get('preview')==='1';
  if (preview) return new Response(leadershipBody+'<hr>'+intakeBody+'<hr>'+donationBody,{headers:{'Content-Type':'text/html'}});

  if (!env.RESEND_API_KEY) return json({ ok:false, error:'RESEND_API_KEY not set — add it in Cloudflare Pages settings, then redeploy.' },500);

  const sent=[];
  for (const m of messages) {
    try{
      const r=await fetch('https://api.resend.com/emails',{method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.RESEND_API_KEY},
        body:JSON.stringify({ from: env.RESEND_FROM || 'NRT Patrol <patrol@nextrighthing.com>', to:m.to, subject:m.subject, html:m.html })});
      sent.push({ to:m.to, ok:r.ok, status:r.status });
    }catch(e){ sent.push({ to:m.to, ok:false, error:String(e) }); }
  }
  return json({ ok:true, ranBy:who, at:new Date().toISOString(), sent });
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
