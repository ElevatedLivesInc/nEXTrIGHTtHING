// POST /in-kind-report/send { id, email?, force? }
// One tap: generate the donor's numbered receipt (if it does not exist yet) and
// email it to them from The Right Thing in Recovery. Same roster as the report.
import { gate, json, sendInkindReceipt } from '../_lib/outbox.js';

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'in-kind-report'); if (g.res) return g.res;
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const id = String((b && b.id) || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: 'invalid id' }, 400);
  try {
    const out = await sendInkindReceipt(env, { id, email: b.email, who: g.who, origin: new URL(request.url).origin, force: b.force === true });
    return json(out, out.ok ? 200 : (out.needs_email ? 422 : 500));
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}
