// POST /incident/save -> file a new incident, or update an existing one
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor, ESCALATION, LEADERSHIP_NOTIFY, LEADERSHIP_PRIMARY } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  // Client-side operations data. Nonprofit-only staff must NOT be on this list.
  // To add someone: add their @nextrighthing.com address to _lib/roster.js AND
  // to the "Allowed admins" policy in Cloudflare Zero Trust.
  const ALLOWED = allowedFor('incident');
  const who = await getAuthedEmail(request, env);
  if (!who) return json({ ok:false, error:'not signed in' },401);
  if (!ALLOWED.includes(who)) return json({ ok:false, error:'Your account does not have access to incident reports.' },403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ ok:false, error:'bad request' },400); }

  const H = {
    'Content-Type':'application/json',
    'apikey':env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer':'return=representation'
  };
  const S = (v,n)=> v==null ? null : ((''+v).trim().slice(0,n) || null);
  const B = v => v===true || v==='true';

  const PROGRAMS = ['sober_living','treatment_center'];
  const SEVERITY = ['minor','moderate','serious','critical'];
  const STATUS   = ['open','under_review','corrective_action','closed'];

  // Who each escalation step goes to. Level 0 is the person who filed it.
  // (Lives in _lib/roster.js as ESCALATION, alongside every other staff list.)
  const CHAIN = ESCALATION;

  // ---- escalate one step up the chain
  if (b.id && b.escalate) {
    const g = await fetch(env.SUPABASE_URL+'/rest/v1/incidents?id=eq.'+encodeURIComponent(b.id)+'&select=*',
      { headers:H });
    if (!g.ok) return json({ ok:false, error:'not found' },404);
    const cur = (await g.json())[0];
    if (!cur) return json({ ok:false, error:'not found' },404);

    const next = Math.min(3, (Number(cur.escalation_level)||0) + 1);
    if (next === cur.escalation_level)
      return json({ ok:false, error:'Already at the top of the chain.' },400);

    const step = CHAIN[next];
    const stamp = new Date().toISOString().slice(0,16).replace('T',' ');
    const line = stamp + ' UTC  ' + who + ' escalated to ' + step.label
               + (b.reason ? ' - ' + (''+b.reason).trim().slice(0,400) : '');
    const p = {
      escalation_level: next,
      escalated_to: step.to,
      escalated_at: new Date().toISOString(),
      escalation_log: (cur.escalation_log ? cur.escalation_log + '\n' : '') + line,
      status: cur.status === 'closed' ? 'under_review' : cur.status,
      updated_by: who
    };
    const r = await fetch(env.SUPABASE_URL+'/rest/v1/incidents?id=eq.'+encodeURIComponent(b.id),
      { method:'PATCH', headers:H, body:JSON.stringify(p) });
    if (!r.ok) return json({ ok:false, error:'escalate failed', detail: await r.text() },500);
    const saved = (await r.json())[0] || {};

    if (env.RESEND_API_KEY && step.to) {
      try {
        await fetch('https://api.resend.com/emails', {
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.RESEND_API_KEY},
          body: JSON.stringify({
            from: env.RESEND_FROM || 'NRT Patrol <patrol@nextrighthing.com>',
            to: [step.to],
            subject: 'Escalated to you &mdash; ' + (saved.case_number||'') + ' (' + (saved.incident_date||'') + ')',
            html: '<meta charset="utf-8"><div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;color:#1a2744">'
              + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.5rem;margin-bottom:1rem;font-family:Georgia,serif;font-size:1.3rem">Incident escalated to you</div>'
              + '<p style="color:#333;font-size:.95rem;line-height:1.6">'
              + 'Case <b>'+(saved.case_number||'')+'</b> has been escalated to <b>'+step.label+'</b> by '+who+'. '
              + 'No details are included in this email on purpose.</p>'
              + (b.reason ? '<p style="color:#555;font-size:.9rem;font-style:italic">Reason given: '
                  + (''+b.reason).replace(/[<>]/g,'').slice(0,400) + '</p>' : '')
              + '<p style="margin-top:1.4rem;font-size:.85rem"><a href="https://nextrighthing.com/incident-log">Read the full report &rarr;</a></p></div>'
          })
        });
      } catch (_) {}
    }
    return json({ ok:true, incident: saved });
  }

  // ---- update an existing report (review, corrective action, licensing follow-through)
  if (b.id) {
    const p = { updated_by: who };
    const put = (k,v)=>{ if (v !== undefined) p[k] = v; };
    if (STATUS.includes(b.status)) p.status = b.status;
    put('review_notes',     S(b.review_notes, 4000));
    put('corrective_actions', S(b.corrective_actions, 4000));
    put('follow_up_due',    S(b.follow_up_due, 20));
    put('ol_reference',     S(b.ol_reference, 200));
    put('ol_reported_at',   S(b.ol_reported_at, 20));
    if (b.ol_reported !== undefined) p.ol_reported = B(b.ol_reported);
    if (b.status === 'closed' || b.review_notes) { p.reviewed_by = who; p.reviewed_at = new Date().toISOString(); }

    const r = await fetch(env.SUPABASE_URL+'/rest/v1/incidents?id=eq.'+encodeURIComponent(b.id),
      { method:'PATCH', headers:H, body:JSON.stringify(p) });
    if (!r.ok) return json({ ok:false, error:'update failed', detail: await r.text() },500);
    const rows = await r.json();
    return json({ ok:true, incident: rows[0] || null });
  }

  // ---- new report
  if (!b.incident_date) return json({ ok:false, error:'The date it happened is required.' },400);
  if (!b.incident_type) return json({ ok:false, error:'Incident type is required.' },400);
  if (!b.narrative || (''+b.narrative).trim().length < 20)
    return json({ ok:false, error:'Please describe what happened in a few sentences.' },400);

  // No future-dating. An incident cannot happen tomorrow.
  const today = new Date().toISOString().slice(0,10);
  if ((''+b.incident_date).slice(0,10) > today)
    return json({ ok:false, error:'The incident date cannot be in the future.' },400);

  const rec = {
    incident_date:  S(b.incident_date, 20),
    incident_time:  S(b.incident_time, 20),
    program:        PROGRAMS.includes(b.program) ? b.program : 'sober_living',
    house_name:     S(b.house_name, 120),
    location_detail:S(b.location_detail, 240),
    incident_type:  S(b.incident_type, 80),
    severity:       SEVERITY.includes(b.severity) ? b.severity : 'moderate',
    critical_incident: B(b.critical_incident),
    persons_involved:  S(b.persons_involved, 600),
    witnesses:         S(b.witnesses, 600),
    narrative:         S(b.narrative, 8000),
    contributing_factors: S(b.contributing_factors, 4000),
    immediate_actions:    S(b.immediate_actions, 4000),
    corrective_actions:   S(b.corrective_actions, 4000),
    injuries:          B(b.injuries),
    medical_attention: S(b.medical_attention, 1000),
    law_enforcement:   B(b.law_enforcement),
    le_agency:         S(b.le_agency, 160),
    le_case_number:    S(b.le_case_number, 120),
    notified:          S(b.notified, 600),
    follow_up_due:     S(b.follow_up_due, 20),
    status:            'open',
    reported_by:       who,
    updated_by:        who
  };

  const r = await fetch(env.SUPABASE_URL+'/rest/v1/incidents', { method:'POST', headers:H, body:JSON.stringify(rec) });
  if (!r.ok) return json({ ok:false, error:'save failed', detail: await r.text() },500);
  const rows = await r.json();
  const saved = rows[0] || {};

  // Notify leadership that a report exists. Deliberately contains NO client
  // information - just the case number and where to read it.
  if (env.RESEND_API_KEY) {
    try {
      const to = rec.critical_incident || rec.severity === 'critical' || rec.severity === 'serious'
        ? LEADERSHIP_NOTIFY
        : LEADERSHIP_PRIMARY;
      const label = rec.critical_incident ? 'CRITICAL INCIDENT' : 'Incident report';
      await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.RESEND_API_KEY},
        body: JSON.stringify({
          from: env.RESEND_FROM || 'NRT Patrol <patrol@nextrighthing.com>',
          to,
          subject: label + ' filed &mdash; ' + (saved.case_number || '') + ' (' + rec.incident_date + ')',
          html: '<meta charset="utf-8">'
            + '<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;color:#1a2744">'
            + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.5rem;margin-bottom:1rem;font-family:Georgia,serif;font-size:1.3rem">'
            + label + '</div>'
            + '<p style="color:#333;font-size:.95rem;line-height:1.6">A report has been filed. '
            + 'No details are included in this email on purpose.</p>'
            + '<table style="font-size:.9rem;color:#333">'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Case</td><td><b>'+(saved.case_number||'')+'</b></td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Occurred</td><td>'+rec.incident_date+(rec.incident_time?' at '+rec.incident_time:'')+'</td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Program</td><td>'+(rec.program==='sober_living'?'Sober Living':'Treatment Center')+'</td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Severity</td><td>'+rec.severity+'</td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Filed by</td><td>'+who+'</td></tr>'
            + '</table>'
            + (rec.critical_incident
                ? '<p style="background:#fdf0f0;border-left:3px solid #b45454;padding:.8rem 1rem;color:#5a4444;font-size:.9rem;line-height:1.6;margin-top:1rem">'
                  + '<b>This was marked a critical incident.</b> Utah Office of Licensing expects a report through the '
                  + 'OL Provider Portal within one business day of the occurrence. Confirm it has been submitted and record the reference number.</p>'
                : '')
            + '<p style="margin-top:1.4rem;font-size:.85rem"><a href="https://nextrighthing.com/incident-log">Read the full report &rarr;</a></p>'
            + '</div>'
        })
      });
    } catch (_) { /* never let email failure block the save */ }
  }

  return json({ ok:true, incident: saved });
}
