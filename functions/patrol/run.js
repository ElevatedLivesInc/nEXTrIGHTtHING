// GET|POST /patrol/run  -> builds the morning digest and emails each role.
// Two ways to trigger:
//   1) A staff member opens /patrol/run in a browser (must be logged in) -> preview + send
//   2) A cron service calls /patrol/run?key=YOUR_PATROL_KEY  -> sends automatically
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, PATROL_KEY (optional), RESEND_FROM (optional)

const GABE = 'gabe@nextrighthing.com';
// Gabe is on every brief on purpose - he sees exactly what each person sees,
// so nobody has to describe a problem he can already read.
const TEAM = {
  intake:   ['bailey@nextrighthing.com', GABE],
  donations:['ryan@nextrighthing.com', GABE],
  housing:  ['rob@nextrighthing.com', 'cateo@nextrighthing.com', GABE],
  funding:  ['bailey@nextrighthing.com', 'cateo@nextrighthing.com', GABE],
  leadership:[GABE,'cateo@nextrighthing.com']
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const json=(o,s=200)=>new Response(JSON.stringify(o,null,2),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  const keyOk = env.PATROL_KEY && url.searchParams.get('key') === env.PATROL_KEY;
  const who = keyOk ? 'cron' : await getAuthedEmail(request);
  if (!who) {
    // A person in a browser gets sent to the door, not shown an error.
    // A cron caller with a bad key still gets JSON.
    const wantsHtml = (request.headers.get('Accept')||'').includes('text/html');
    if (wantsHtml) {
      const back = url.pathname + (url.search || '');
      return Response.redirect(url.origin + '/signin?next=' + encodeURIComponent(back), 302);
    }
    return json({ error:'Not signed in, and no valid key. Open /patrol/run in a browser to sign in, or call with ?key=' },401);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error:'not configured' },500);

  const h={ 'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY };
  const get=async p=>{ try{const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+p,{headers:h}); return r.ok? await r.json():[];}catch(_){return [];} };

  const [intake, inkind, apps, residents, events] = await Promise.all([
    get('intake_requests?select=*&limit=1000'),
    get('authorizations?select=*&limit=1000'),
    get('funding_applications?select=*&limit=1000'),
    get('residents?select=*&limit=1000'),
    get('house_events?select=*&order=created_at.desc&limit=500')
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
  residents.forEach(r=>{ const k=r.house_name||'&mdash;'; byHouse[k]=byHouse[k]||{beds:0,open:0}; byHouse[k].beds++; if((r.status||'')==='open')byHouse[k].open++; });

  // ---------- WINS (last 7 days) ----------
  const wk = (events||[]).filter(e=>age(e.created_at)!==null && age(e.created_at)<=7);
  const pays = wk.filter(e=>e.kind==='payment');
  const collectedWk = pays.reduce((t,e)=>t+(Number(e.amount)||0),0);
  const docsComplete = active.filter(r=>r.has_id&&r.has_ss_card&&r.has_birth_cert);
  const employed = active.filter(r=>r.employed);
  const savingsTotal = active.reduce((t,r)=>t+(Number(r.savings_balance)||0),0);
  const newlyIntaked = intake.filter(r=>r.status==='intaked');
  const current = active.filter(r=>((Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0))<=0);

  // ---------- MONEY TO RECOVER ----------
  const balOf = r => (Number(r.past_due)||0)+(Number(r.current_due)||0)-(Number(r.amount_paid)||0);
  const owing2 = active.filter(r=>balOf(r)>0).sort((a,b)=>balOf(b)-balOf(a));
  const totalOwed = owing2.reduce((t,r)=>t+balOf(r),0);
  const emptyBeds = openBeds.length;
  const bedRevenue = openBeds.reduce((t,r)=>t+(Number(r.monthly_rent)||775),0);

  // pick the right offer for each person, based on what their record actually says
  function offerFor(r){
    const b = balOf(r);
    const wk = Math.max(25, Math.round(b/26/5)*5); // ~6 months of weekly payments
    if ((r.payer_type||'')!=='self' && (r.payer_type||''))
      return 'Confirm ' + r.payer_type + ' coverage is still active before chasing him &mdash; this may be a funding gap, not a refusal.';
    if (r.funding_end && until(r.funding_end)!==null && until(r.funding_end)<=0)
      return 'Funding ended ' + r.funding_end + '. He needs a new source or a plan &mdash; check the Funding Navigator for what he has not used.';
    if (!r.employed)
      return 'Not employed on record. Employment first, then a plan &mdash; a payment plan with no income is a promise nobody can keep.';
    if (b >= 2000)
      return 'Large balance. Offer a written plan at about $' + wk + '/week and put it in writing so both sides know what current means.';
    if ((r.pay_schedule||'monthly')==='monthly')
      return 'Switch him to weekly billing (about $' + Math.round((Number(r.monthly_rent)||775)/4.3) + '/wk). He is paid weekly; the monthly lump is the problem, not the willingness.';
    return 'Offer a short plan at about $' + wk + '/week and set up autopay so it stops depending on memory.';
  }

  const li=(t)=>'<li style="margin:.3rem 0">'+t+'</li>';
  const sec=(title,items)=> items.length? '<h3 style="font-family:Georgia,serif;color:#1a2744;margin:1.2rem 0 .4rem;font-size:1.05rem">'+title+'</h3><ul style="margin:0;padding-left:1.1rem;color:#333;font-size:.92rem">'+items.join('')+'</ul>' : '';
  const wrap=(title,inner)=>'<meta charset="utf-8"><div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a2744">'
    +'<div style="border-bottom:3px solid #c9a96e;padding-bottom:.6rem;margin-bottom:1rem">'
    +'<div style="font-family:Georgia,serif;font-size:1.5rem">'+title+'</div>'
    +'<div style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#888">The Next Right Thing &middot; '+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+'</div></div>'
    + (inner || '<p style="color:#555">Nothing needs attention today. Queues are clear.</p>')
    +'<p style="margin-top:1.6rem;font-size:.8rem;color:#888;border-top:1px solid #eee;padding-top:.8rem">Open Mission Control: <a href="https://nextrighthing.com/mission-control">nextrighthing.com/mission-control</a></p></div>';

  const intakeBody = wrap('Intake Brief',
    sec('Reach out today', urgentStale.map(r=>li('<b>'+(r.first_name||'')+' '+(r.last_name||'')+'</b> &mdash; recent use, still marked New'+(r.phone?' &middot; '+r.phone:'')))) +
    sec('New overnight', newOvernight.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+(r.needs_housing==='Yes'?' &middot; needs housing':'')+(r.insurance?' &middot; '+r.insurance:'')))) +
    sec('Ready for intake', ready.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+' &mdash; checklist complete, move to Intaked once scheduled'))) +
    sec('Gone quiet (14+ days)', silent.map(r=>li((r.first_name||'')+' '+(r.last_name||'')+' &mdash; no status change'))) +
    sec('Funding coverage ending soon', expiring.map(a=>li('<b>'+a.resident_name+'</b> &mdash; '+a.funder_name+' ends '+a.coverage_end+' ('+until(a.coverage_end)+' days)'))) +
    sec('Applications pending 14+ days', pendingLong.map(a=>li(a.resident_name+' &mdash; '+a.funder_name+', follow up')))
  );

  const donationBody = wrap('Donations Brief',
    sec('Codes issued but never redeemed (7+ days)', unredeemed.map(r=>li('<b>'+r.donor_name+'</b> &mdash; '+r.code+' &middot; '+(r.description||'')))) +
    sec('Donations missing an email address', noEmail.slice(0,10).map(r=>li(r.donor_name+' &mdash; no email captured, no thank-you possible')))
  );

  const houseLines = Object.keys(byHouse).map(k=>li(k+': '+byHouse[k].open+' open of '+byHouse[k].beds+' beds'));
  const winBox = (items)=> items.length? '<div style="background:#f2f8f4;border-left:4px solid #78c896;padding:.9rem 1.1rem;margin:1rem 0;border-radius:4px">'
    +'<div style="font-family:Georgia,serif;color:#2f7a52;font-size:1.05rem;margin-bottom:.4rem">Wins This Week</div>'
    +'<ul style="margin:0;padding-left:1.1rem;color:#2c4a38;font-size:.92rem">'+items.join('')+'</ul></div>' : '';

  const leadershipBody = wrap('Daily Command Brief',
    winBox([
      pays.length? li('<b>'+pays.length+' payment'+(pays.length>1?'s':'')+' logged</b> this week &mdash; $'+collectedWk.toLocaleString('en-US')+' collected'):'',
      current.length? li('<b>'+current.length+' of '+active.length+' residents are current</b> on rent'):'',
      docsComplete.length? li('<b>'+docsComplete.length+' resident'+(docsComplete.length>1?'s have':' has')+' all core documents</b> &mdash; ID, SS card, birth certificate'):'',
      employed.length? li('<b>'+employed.length+' resident'+(employed.length>1?'s':'')+' employed</b>'):'',
      savingsTotal? li('<b>$'+savingsTotal.toLocaleString('en-US')+' saved</b> by residents building a cushion'):'',
      newlyIntaked.length? li('<b>'+newlyIntaked.length+' '+(newlyIntaked.length>1?'people have':'person has')+' completed intake</b> &mdash; that is the whole point'):'',
      inkind.filter(r=>(r.status||'')==='redeemed').length? li('<b>'+inkind.filter(r=>(r.status||'')==='redeemed').length+' donation receipt'+(inkind.filter(r=>(r.status||'')==='redeemed').length>1?'s':'')+' generated</b> for donors'):''
    ].filter(Boolean)) +
    sec('Intake', [
      li('New requests: '+intake.filter(r=>(r.status||'new')==='new').length),
      li('Flagged urgent: '+urgent.length+(urgentStale.length?' &mdash; <b>'+urgentStale.length+' untouched over 24h</b>':'')),
      li('Ready for intake: '+ready.length)
    ]) +
    sec('Funding', [
      li('Approved active: '+apps.filter(a=>a.status==='approved').length),
      li('Coverage ending within 30 days: '+expiring.length+(expiring.length?' &mdash; '+expiring.slice(0,4).map(a=>a.resident_name).join(', '):''))
    ]) +
    (residents.length? sec('Housing', houseLines.concat([
      li('Residents owing: '+owing.length+(bigDebt.length?' &middot; <b>'+bigDebt.length+' over $1,500</b>':'')),
      li('Funding cliffs in 30 days: '+fundingCliff.length),
      li('Missing core documents: '+docsMissing.length+' of '+active.length+' residents')
    ])):'') +
    sec('Donations', [
      li('In-kind codes pending redemption: '+inkind.filter(r=>(r.status||'issued')==='issued').length),
      li('Total declared in-kind value: $'+inkind.reduce((t,r)=>t+(Number(r.donor_value)||0),0).toLocaleString('en-US'))
    ])
    + (owing2.length? ('<div style="background:#fdf6ef;border-left:4px solid #c9a96e;padding:.9rem 1.1rem;margin:1.2rem 0;border-radius:4px">'
      +'<div style="font-family:Georgia,serif;color:#8a6a2f;font-size:1.05rem;margin-bottom:.15rem">Money On The Table</div>'
      +'<div style="color:#6b5836;font-size:.86rem;margin-bottom:.6rem">$'+Math.round(totalOwed).toLocaleString('en-US')+' outstanding across '+owing2.length+' residents'
      + (emptyBeds? (' &nbsp;·&nbsp; plus '+emptyBeds+' empty beds worth about $'+Math.round(bedRevenue).toLocaleString('en-US')+'/month'):'')+'</div>'
      +'<ul style="margin:0;padding-left:1.1rem;color:#4a3f2c;font-size:.88rem">'
      + owing2.slice(0,6).map(r=>'<li style="margin:.45rem 0"><b>'+r.name+'</b> &mdash; $'+Math.round(balOf(r)).toLocaleString('en-US')
          +(r.house_name?(' &nbsp;<span style="color:#8a7a5c">'+r.house_name+'</span>'):'')
          +'<br><span style="color:#6b5836;font-size:.84rem">'+offerFor(r)+'</span></li>').join('')
      +'</ul></div>') : '')
    + '<div style="background:#f4f6fb;border-left:4px solid #1a2744;padding:.9rem 1.1rem;margin:1.1rem 0;border-radius:4px">'
      +'<div style="font-family:Georgia,serif;color:#1a2744;font-size:1.05rem;margin-bottom:.45rem">Do These Three Things</div>'
      +'<ol style="margin:0;padding-left:1.2rem;color:#33436a;font-size:.9rem">'
      + [
          (emptyBeds? '<li style="margin:.4rem 0"><b>Fill beds before chasing balances.</b> '+emptyBeds+' open beds are worth about $'+Math.round(bedRevenue).toLocaleString('en-US')+'/month &mdash; more than most of what is owed, and it costs nobody their dignity. Check the intake queue for anyone who flagged &ldquo;housing needed.&rdquo;</li>':''),
          (urgentStale.length? '<li style="margin:.4rem 0"><b>Call the '+urgentStale.length+' urgent intake'+(urgentStale.length>1?'s':'')+' still marked New.</b> Recent use plus no contact is the window that closes fastest.</li>':''),
          (expiring.length? '<li style="margin:.4rem 0"><b>Get ahead of '+expiring.length+' funding cliff'+(expiring.length>1?'s':'')+'.</b> Apply to the next funder now, while there is still coverage &mdash; the Funding Navigator shows who has not used what.</li>':''),
          (owing2.filter(r=>(r.pay_schedule||'monthly')==='monthly').length? '<li style="margin:.4rem 0"><b>Move people to weekly billing.</b> '+owing2.filter(r=>(r.pay_schedule||'monthly')==='monthly').length+' residents owing are billed monthly but paid weekly. That mismatch causes more of this balance than unwillingness does.</li>':''),
          (docsMissing.length? '<li style="margin:.4rem 0"><b>'+docsMissing.length+' residents are missing ID, SS card, or birth certificate.</b> Under $100 each and nothing else works without them &mdash; no job, no bank account, no rent.</li>':'')
        ].filter(Boolean).slice(0,3).join('')
      +'</ol></div>'
    + '<p style="margin-top:1.4rem;font-family:Georgia,serif;font-style:italic;color:#666;font-size:.95rem;text-align:center">&ldquo;I made a difference to that one.&rdquo;</p>'
  );

  // ---------- HOUSE BRIEF (Rob) ----------
  const dayOf = d => d ? Math.floor((now-new Date(d+'T00:00:00').getTime())/DAY) : null;
  const quietRes  = active.filter(r=>{const n=dayOf(r.last_talked); return n===null||n>14;});
  const noUA      = active.filter(r=>{const n=dayOf(r.last_ua); return n===null||n>30;});
  const onNotice  = active.filter(r=>r.on_notice);
  const warned    = active.filter(r=>(Number(r.warnings)||0)>=2 && !r.on_notice);
  const noMeetings= active.filter(r=>((Number(r.house_meetings)||0)+(Number(r.peer_meetings)||0))===0);
  const houseWins = active.filter(r=>((Number(r.house_meetings)||0)+(Number(r.peer_meetings)||0))>=4);
  const nm = r => (r.name||'Resident') + (r.house_name?' &middot; '+r.house_name:'');

  const houseBody = wrap('House Brief',
    (houseWins.length? '<div style="background:#eef7f1;border-left:3px solid #78c896;padding:.8rem 1rem;border-radius:0 6px 6px 0;margin-bottom:1rem">'
      +'<div style="font-family:Georgia,serif;color:#2f6b4a;font-size:1.02rem;margin-bottom:.3rem">Doing the work</div>'
      +'<div style="font-size:.88rem;color:#3b5c4a">'+houseWins.slice(0,6).map(r=>r.name).join(', ')
      +' &mdash; four or more meetings this month. Worth saying out loud to them.</div></div>' : '') +
    sec('On notice &mdash; decide today', onNotice.map(r=>li('<b>'+nm(r)+'</b>'+(r.warning_reason?' &mdash; '+r.warning_reason:'')+' &middot; '+(r.warnings||0)+' warnings'))) +
    sec('Two or more warnings', warned.map(r=>li(nm(r)+' &mdash; '+(r.warnings||0)+' warnings'+(r.last_warning?', last on '+r.last_warning:'')))) +
    sec('Nobody has talked to them in 2 weeks', quietRes.slice(0,12).map(r=>li(nm(r)+' &mdash; last contact '+(r.last_talked||'never recorded')))) +
    sec('No UA on record in 30 days', noUA.slice(0,12).map(r=>li(nm(r)+(r.last_ua?' &mdash; last '+r.last_ua:' &mdash; never')))) +
    sec('No meetings logged this month', noMeetings.slice(0,12).map(r=>li(nm(r)))) +
    sec('Open beds', openBeds.map(r=>li('<b>'+(r.house_name||'')+'</b>'+(r.room?' &middot; room '+r.room:'')+' &mdash; $'+(Number(r.monthly_rent)||775)+'/mo sitting empty'))) +
    sec('Funding ending within 30 days', fundingCliff.map(r=>li('<b>'+nm(r)+'</b> &mdash; '+(r.funding_source||'funding')+' ends '+r.funding_end)))
  );

  // ---------- FUNDING BRIEF (case managers) ----------
  const fundingBody = wrap('Funding Brief',
    sec('Coverage ending within 30 days', expiring.map(a=>li('<b>'+a.resident_name+'</b> &mdash; '+a.funder_name+' ends '+a.coverage_end+' ('+until(a.coverage_end)+' days). Apply to the next funder now, while coverage still exists.'))) +
    sec('Applications pending 14+ days', pendingLong.map(a=>li(a.resident_name+' &mdash; '+a.funder_name+'. Call and ask where it sits.'))) +
    sec('Residents with no funding source on record', active.filter(r=>!r.funding_source && (r.payer_type||'self')==='self' && balOf(r)>0).slice(0,12).map(r=>li(nm(r)+' &mdash; $'+Math.round(balOf(r)).toLocaleString('en-US')+' owed and no source logged. Worth one application.')))
  );

  const messages = [
    { to:TEAM.intake, subject:'Intake Brief &mdash; '+urgentStale.length+' urgent, '+newOvernight.length+' new', html:intakeBody },
    { to:TEAM.donations, subject:'Donations Brief &mdash; '+unredeemed.length+' codes awaiting receipts', html:donationBody },
    { to:TEAM.housing, subject:'House Brief &mdash; '+onNotice.length+' on notice, '+openBeds.length+' open beds', html:houseBody },
    { to:TEAM.funding, subject:'Funding Brief &mdash; '+expiring.length+' coverage'+(expiring.length===1?'':'s')+' ending within 30 days', html:fundingBody },
    { to:TEAM.leadership, subject:'Daily Command Brief &mdash; The Next Right Thing', html:leadershipBody }
  ];

  const preview = url.searchParams.get('preview')==='1';
  if (preview) return new Response(
    messages.map(m=>'<div style="font:600 .7rem/1 Helvetica,Arial;letter-spacing:.12em;text-transform:uppercase;color:#999;max-width:640px;margin:2rem auto .4rem">Goes to: '+m.to.join(', ')+'</div>'+m.html).join('<hr style="margin:2.5rem 0;border:0;border-top:1px solid #ddd">'),
    {headers:{'Content-Type':'text/html; charset=utf-8'}});

  if (!env.RESEND_API_KEY) return json({ ok:false, error:'RESEND_API_KEY not set &mdash; add it in Cloudflare Pages settings, then redeploy.' },500);

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
