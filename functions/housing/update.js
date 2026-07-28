// POST /housing/update -> update a resident, log an event, or delete
export async function onRequestPost(context) {
  const { request, env } = context;
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  const who = await getAuthedEmail(request);
  if (!who) return json({ ok:false, error:'unauthorized' },401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);
  let b; try{ b=await request.json(); }catch{ return json({ok:false,error:'bad request'},400); }
  const H={'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal'};
  const S=(v,n)=> v==null?null:((''+v).trim().slice(0,n)||null);
  const N=v=> (v===''||v==null)?null:(Number(String(v).replace(/[^0-9.\-]/g,''))||0);
  const B=v=> v===true;

  // log an event (payment, maintenance, welfare check…)
  if (b.event) {
    const rec={ house_name:S(b.house_name,120), resident_name:S(b.resident_name,160),
      kind:S(b.kind,40)||'note', amount:N(b.amount), detail:S(b.detail,2000), logged_by:who };
    const r=await fetch(env.SUPABASE_URL+'/rest/v1/house_events',{method:'POST',headers:H,body:JSON.stringify(rec)});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'log failed',detail:d},500);}
    // a logged payment also reduces the balance
    if (rec.kind==='payment' && b.resident_id && rec.amount) {
      const g=await fetch(env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.resident_id)+'&select=amount_paid',{headers:H});
      if(g.ok){ const rows=await g.json(); const prev=(rows[0]&&Number(rows[0].amount_paid))||0;
        await fetch(env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.resident_id),{method:'PATCH',headers:H,body:JSON.stringify({amount_paid:prev+rec.amount,last_contact:new Date().toISOString().slice(0,10)})}); }
    }
    return json({ ok:true });
  }

  if (!b.id) return json({ok:false,error:'id required'},400);
  const base=env.SUPABASE_URL+'/rest/v1/residents?id=eq.'+encodeURIComponent(b.id);

  if (b.action==='delete') {
    const r=await fetch(base,{method:'DELETE',headers:H});
    if(!r.ok){const d=await r.text();return json({ok:false,error:'delete failed',detail:d},500);}
    return json({ ok:true });
  }

  const p={}; const put=(k,v)=>{ if(v!==undefined) p[k]=v; };
  put('name',S(b.name,160)); put('room',S(b.room,40)); put('house_name',S(b.house_name,120));
  put('status',['active','open','moved_out','evicted','graduated'].includes(b.status)?b.status:undefined);
  put('phone',S(b.phone,60)); put('email',S(b.email,200)); put('emergency_contact',S(b.emergency_contact,240));
  put('move_in_date',S(b.move_in_date,20)); put('move_out_date',S(b.move_out_date,20));
  if(b.monthly_rent!==undefined)put('monthly_rent',N(b.monthly_rent));
  if(b.past_due!==undefined)put('past_due',N(b.past_due));
  if(b.current_due!==undefined)put('current_due',N(b.current_due));
  if(b.amount_paid!==undefined)put('amount_paid',N(b.amount_paid));
  if(b.net_income!==undefined)put('net_income',N(b.net_income));
  if(b.savings_balance!==undefined)put('savings_balance',N(b.savings_balance));
  put('pay_schedule',S(b.pay_schedule,20)); put('payer_type',S(b.payer_type,40));
  put('funding_source',S(b.funding_source,160)); put('funding_end',S(b.funding_end,20));
  put('case_manager',S(b.case_manager,120)); put('treatment_level',S(b.treatment_level,40));
  put('employer',S(b.employer,160)); put('job_start_date',S(b.job_start_date,20));
  put('certifications',S(b.certifications,400)); put('notes',S(b.notes,4000));
  ['has_id','has_ss_card','has_birth_cert','bank_account','employed'].forEach(k=>{ if(b[k]!==undefined) p[k]=B(b[k]); });
  p.updated_by=who;
  if(Object.keys(p).length<=1) return json({ok:false,error:'nothing to update'},400);
  const r=await fetch(base,{method:'PATCH',headers:H,body:JSON.stringify(p)});
  if(!r.ok){const d=await r.text();return json({ok:false,error:'update failed',detail:d},500);}
  return json({ ok:true });
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
