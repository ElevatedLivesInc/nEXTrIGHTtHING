// assistant-widget.js
// Shared training-assistant chat widget, loaded on every staff module with:
//   <script src="/assistant-widget.js" data-module="housing" defer></script>
// Self-contained (own styles, own markup) so it drops into any staff page
// without fighting that page's CSS. Talks to /assistant/chat, which is the
// only thing that knows which module gets which system prompt.
(function () {
  var scriptTag = document.currentScript;
  var moduleKey = scriptTag && scriptTag.dataset ? scriptTag.dataset.module : '';
  if (!moduleKey) return; // no module configured - nothing to mount

  var history = []; // {role:'user'|'assistant', content} - lives only for this page load
  var open = false;
  var sending = false;

  var style = document.createElement('style');
  style.textContent = [
    '#nrtAssist{position:fixed;bottom:1.2rem;right:1.2rem;z-index:99999;font-family:Raleway,Helvetica,Arial,sans-serif;}',
    '#nrtAssistBtn{width:52px;height:52px;border-radius:50%;background:linear-gradient(145deg,#e8d5b0,#c9a96e);border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);font-size:1.4rem;color:#1a2744;}',
    '#nrtAssistPanel{display:none;position:fixed;bottom:4.6rem;right:1.2rem;width:min(340px,92vw);max-height:70vh;background:#121c33;border:1px solid rgba(201,169,110,.4);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);flex-direction:column;overflow:hidden;}',
    '#nrtAssistPanel.open{display:flex;}',
    '#nrtAssistHead{padding:.8rem 1rem;background:#1a2744;border-bottom:1px solid rgba(201,169,110,.3);display:flex;justify-content:space-between;align-items:center;}',
    '#nrtAssistHead b{color:#e8d5b0;font-family:Georgia,serif;font-weight:400;font-size:1rem;}',
    '#nrtAssistClose{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:1.1rem;line-height:1;}',
    '#nrtAssistLog{flex:1;overflow-y:auto;padding:.8rem 1rem;font-size:.85rem;color:rgba(255,255,255,.9);display:flex;flex-direction:column;gap:.6rem;}',
    '#nrtAssistLog .msg{padding:.5rem .7rem;border-radius:8px;line-height:1.5;white-space:pre-wrap;}',
    '#nrtAssistLog .u{background:rgba(201,169,110,.18);align-self:flex-end;max-width:85%;}',
    '#nrtAssistLog .a{background:rgba(255,255,255,.06);align-self:flex-start;max-width:90%;}',
    '#nrtAssistLog .hint{color:rgba(255,255,255,.5);font-size:.78rem;font-style:italic;}',
    '#nrtAssistForm{display:flex;gap:.4rem;padding:.7rem;border-top:1px solid rgba(201,169,110,.25);}',
    '#nrtAssistInput{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;padding:.5rem .6rem;font-size:.82rem;font-family:inherit;resize:none;}',
    '#nrtAssistSend{background:#c9a96e;border:none;border-radius:6px;color:#1a2744;font-weight:700;padding:0 .9rem;cursor:pointer;font-size:.8rem;}',
    '#nrtAssistSend:disabled{opacity:.5;cursor:default;}'
  ].join('');
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'nrtAssist';
  root.innerHTML =
    '<button id="nrtAssistBtn" title="Help with this screen" aria-label="Open training assistant">?</button>' +
    '<div id="nrtAssistPanel">' +
      '<div id="nrtAssistHead"><b>How this works</b><button id="nrtAssistClose" aria-label="Close">&times;</button></div>' +
      '<div id="nrtAssistLog"><div class="hint">Ask anything about using this screen - where a button is, what a workflow does, what a status means. It cannot see resident data and is not a substitute for a supervisor.</div></div>' +
      '<form id="nrtAssistForm">' +
        '<textarea id="nrtAssistInput" rows="1" placeholder="Ask a question..."></textarea>' +
        '<button id="nrtAssistSend" type="submit">Send</button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);

  var btn = root.querySelector('#nrtAssistBtn');
  var panel = root.querySelector('#nrtAssistPanel');
  var log = root.querySelector('#nrtAssistLog');
  var form = root.querySelector('#nrtAssistForm');
  var input = root.querySelector('#nrtAssistInput');
  var send = root.querySelector('#nrtAssistSend');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function addMessage(role, text) {
    var div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'u' : 'a');
    div.innerHTML = esc(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  btn.addEventListener('click', function () {
    open = !open;
    panel.classList.toggle('open', open);
    if (open) input.focus();
  });
  root.querySelector('#nrtAssistClose').addEventListener('click', function () {
    open = false;
    panel.classList.remove('open');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || sending) return;
    input.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    sending = true;
    send.disabled = true;
    var thinking = document.createElement('div');
    thinking.className = 'msg a hint';
    thinking.textContent = 'Thinking...';
    log.appendChild(thinking);
    log.scrollTop = log.scrollHeight;

    fetch('/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: moduleKey, message: text, history: history.slice(0, -1) })
    }).then(function (res) {
      return res.json().then(function (d) { return { status: res.status, body: d }; });
    }).then(function (r) {
      thinking.remove();
      if (r.status === 401) { addMessage('assistant', 'You are not signed in. Reload this page and sign in, then try again.'); return; }
      if (r.status === 403) { addMessage('assistant', r.body.error || 'Your account does not have access to this assistant.'); return; }
      if (!r.body.reply) { addMessage('assistant', r.body.error || 'Something went wrong. Try again in a moment.'); return; }
      addMessage('assistant', r.body.reply);
      history.push({ role: 'assistant', content: r.body.reply });
    }).catch(function () {
      thinking.remove();
      addMessage('assistant', 'Could not reach the assistant. Check your connection and try again.');
    }).finally(function () {
      sending = false;
      send.disabled = false;
    });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
})();
