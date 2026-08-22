// POST /api/concern -> public, anonymous. No login. No IP stored. No cookies read.
// Anyone - a client, a resident, a family member, a staff member - can raise a concern here.
import { LEADERSHIP_NOTIFY } from '../_lib/roster.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json; charset=utf-8'}});

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok:false, error:'not configured' },500);

  let b; try { b = await request.json(); } catch { return json({ ok:false, error:'bad request' },400); }

  // Honeypot. Real people never fill this in; bots do.
  if (b.website) return json({ ok:true, case_number:'VOICE-0000-0000' });

  const msg = (b.message || '').trim();
  if (msg.length < 10) return json({ ok:false, error:'Please tell us a little more so we can look into it.' },400);

  const S = (v,n)=> v==null ? null : ((''+v).trim().slice(0,n) || null);
  const PROGRAMS = ['sober_living','treatment_center','unsure'];

  const rec = {
    occurred_on:    S(b.occurred_on, 20),
    program:        PROGRAMS.includes(b.program) ? b.program : 'unsure',
    house_name:     S(b.house_name, 120),
    concern_type:   S(b.concern_type, 80),
    message:        msg.slice(0, 6000),
    contact:        S(b.contact, 240),          // blank = fully anonymous
    wants_response: b.wants_response === true && !!S(b.contact, 240),
    status:         'new'
  };

  const H = {
    'Content-Type':'application/json',
    'apikey':env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
    'Prefer':'return=representation'
  };
  const r = await fetch(env.SUPABASE_URL+'/rest/v1/concerns', { method:'POST', headers:H, body:JSON.stringify(rec) });
  if (!r.ok) return json({ ok:false, error:'Could not save. Please call (801) 816-4977.' },500);
  const saved = (await r.json())[0] || {};

  // Receipt to the person who spoke up - ONLY if they gave contact and asked for a reply.
  // Deliberately says nothing about what they reported: someone else may see their screen.
  if (env.RESEND_API_KEY && rec.wants_response && (rec.contact||'').includes('@')) {
    try {
      await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.RESEND_API_KEY},
        body: JSON.stringify({
          from: env.RESEND_FROM || 'The Next Right Thing <patrol@nextrighthing.com>',
          to: [rec.contact.trim()],
          subject: 'We received your message &mdash; ' + (saved.case_number || ''),
          html: '<meta charset="utf-8">'
            + '<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a2744">'
            + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.6rem;margin-bottom:1.2rem">'
            + '<div style="font-family:Georgia,serif;font-size:1.4rem">Thank you for speaking up.</div></div>'
            + '<p style="color:#333;font-size:.96rem;line-height:1.7">We received what you sent and someone is going to look at it. '
            + 'You asked to hear back, so you will.</p>'
            + '<div style="background:#f4f1ea;border:1px solid #c9a96e;border-radius:8px;padding:1rem 1.2rem;margin:1.2rem 0;text-align:center">'
            + '<div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#8a6d3b">Your reference</div>'
            + '<div style="font-family:Georgia,serif;font-size:1.7rem;color:#1a2744;margin-top:.2rem">'+(saved.case_number||'')+'</div></div>'
            + '<p style="color:#555;font-size:.88rem;line-height:1.7">Keep this number if you want to follow up. '
            + 'We have not put any details of what you told us in this email, on purpose &mdash; in case someone else sees your screen.</p>'
            + '<p style="color:#555;font-size:.88rem;line-height:1.7">Nothing about raising a concern changes your care, your housing, or how you are treated. '
            + 'If you would rather go outside the organization, the Utah Office of Licensing investigates concerns about licensed programs at (801)&nbsp;890-2007.</p>'
            + '<p style="color:#555;font-size:.88rem;line-height:1.7">If you are in danger right now, call 911. If you are struggling, call or text 988, any hour.</p>'
            + '<p style="margin-top:1.6rem;padding-top:1rem;border-top:1px solid #eee;font-size:.78rem;color:#999;line-height:1.6">'
            + 'The Next Right Thing in Recovery &middot; 8901 South 1300 West, West Jordan, UT 84088 &middot; (801) 816-4977<br>'
            + '<em style="font-family:Georgia,serif;color:#8a6d3b">"I made a difference to that one."</em></p></div>'
        })
      });
    } catch (_) { /* a failed receipt must never lose the report */ }
  }

  // Tell leadership something arrived. The message body is NOT emailed -
  // it stays in the system, so an anonymous report cannot leak through an inbox.
  if (env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.RESEND_API_KEY},
        body: JSON.stringify({
          from: env.RESEND_FROM || 'NRT Patrol <patrol@nextrighthing.com>',
          to: LEADERSHIP_NOTIFY,
          subject: 'Someone used the Speak Up line &mdash; ' + (saved.case_number || ''),
          html: '<meta charset="utf-8"><div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;color:#1a2744">'
            + '<div style="border-bottom:3px solid #c9a96e;padding-bottom:.5rem;margin-bottom:1rem;font-family:Georgia,serif;font-size:1.3rem">Speak Up line</div>'
            + '<p style="color:#333;font-size:.95rem;line-height:1.6">A concern was submitted. '
            + 'The message itself is not in this email on purpose &mdash; read it in the log.</p>'
            + '<table style="font-size:.9rem;color:#333">'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Reference</td><td><b>'+(saved.case_number||'')+'</b></td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Type</td><td>'+(rec.concern_type||'not stated')+'</td></tr>'
            + '<tr><td style="padding:.2rem .8rem .2rem 0;color:#888">Wants a reply</td><td>'+(rec.wants_response?'Yes':'No &mdash; anonymous')+'</td></tr>'
            + '</table>'
            + '<p style="margin-top:1.4rem;font-size:.85rem"><a href="https://nextrighthing.com/incident-log">Open the log &rarr;</a></p></div>'
        })
      });
    } catch (_) {}
  }

  return json({ ok:true, case_number: saved.case_number || null });
}
