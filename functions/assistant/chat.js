// POST /assistant/chat { module, message, history? } -> { reply }
// Backend for the in-module training assistant widget (assistant-widget.js).
// Staff-only: requires the same identity check as every other module, then
// requires that identity to actually have access to the module being asked
// about - the assistant is a tour guide for a room, not a master key.
import { getAuthedEmail } from '../_lib/auth.js';
import { allowedFor } from '../_lib/roster.js';
import { assistantConfigFor } from '../_lib/assistant-prompts.js';

const MAX_MESSAGE = 2000;
const MAX_HISTORY_TURNS = 6; // user+assistant pairs; keeps cost and context bounded

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

  const who = await getAuthedEmail(request, env);
  if (!who) return json({ error: 'Not signed in. Open the module itself first to log in, then reload.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const config = assistantConfigFor((body.module || '').toString().trim());
  if (!config) return json({ error: 'Unknown module.' }, 400);
  if (config.rosterKey && !allowedFor(config.rosterKey).includes(who)) {
    return json({ error: 'Your account does not have access to this module, so the assistant for it is not available either.' }, 403);
  }

  const message = (body.message || '').toString().trim().slice(0, MAX_MESSAGE);
  if (!message) return json({ error: 'Ask a question first.' }, 400);

  // Trusts only role+content from the client's own prior turns - never lets the
  // client inject a system-role message to override the module's guardrails.
  const history = Array.isArray(body.history) ? body.history : [];
  const turns = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS * 2)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE) }));

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'The training assistant is not set up yet. Ask an admin to add ANTHROPIC_API_KEY in Cloudflare Pages settings.' }, 500);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: config.prompt,
      messages: [...turns, { role: 'user', content: message }]
    })
  });

  if (!res.ok) {
    // Anthropic's raw error text can describe internal request/config details
    // (model name, auth setup) - log it server-side, but never forward it to
    // a browser the way Supabase failures do elsewhere in this codebase.
    console.error('assistant/chat: Anthropic API error', res.status, await res.text());
    return json({ error: 'The assistant could not respond just now. Try again in a moment.' }, 502);
  }

  const data = await res.json();
  const reply = (data.content || []).map(b => b.text || '').join('').trim() || 'I did not get a usable response - try asking again.';
  return json({ reply, module: config.label });
}
