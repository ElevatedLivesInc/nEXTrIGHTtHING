// POST /work/signup -> a resident puts their name down for the Rent A Husband crew.
//
// Public on purpose. Residents do not have staff logins, and requiring one
// would put a login screen between somebody and the first job they have been
// offered in years. Same reasoning as the public intake form.
export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ok:false,error:'bad request'},400); }
  const S=(v,n)=> v==null?null:((''+v).trim().slice(0,n)||null);

  const name = S(b.name,160);
  if (!name) return json({ok:false,error:'Tell us your name so we know who to call.'},400);
  if (!S(b.phone,60) && !S(b.email,200)) return json({ok:false,error:'We need a phone number or an email to get back to you.'},400);
  // Honeypot. Bots fill every field; a human never sees this one.
  if (S(b.website,200)) return json({ ok:true });

  const rec = {
    name, phone:S(b.phone,60), email:S(b.email,200), house_name:S(b.house_name,120),
    skills:S(b.skills,1000), has_transport:b.has_transport===true, has_tools:b.has_tools===true,
    availability:S(b.availability,120), hours_wanted:S(b.hours_wanted,80), notes:S(b.notes,2000)
  };

  const r = await fetch(env.SUPABASE_URL+'/rest/v1/work_signups',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,
             'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Prefer':'return=minimal'},
    body: JSON.stringify(rec)
  });
  if (!r.ok) return json({ok:false,error:'Could not save that. Try again in a minute.',detail:await r.text()},500);
  return json({ ok:true });
}
