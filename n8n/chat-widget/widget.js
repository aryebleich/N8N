/*!
 * Support chat widget for the n8n dual-LLM support workflow.
 * Vanilla JavaScript, no dependencies, works on any static site (GitHub Pages included).
 *
 * Embed with one tag:
 *   <script src="https://YOUR-SITE/chat-widget/widget.js" defer></script>
 *
 * Optional attributes on the <script> tag:
 *   data-webhook-url="https://n8n.example.com/webhook/support-chat"   (overrides WEBHOOK_URL)
 *   data-title="Northwind Goods support"
 *   data-accent="#0b6e4f"
 *   data-session-token="..."  data-customer-email="..."  data-customer-name="..."
 *   data-site-url="https://support-admin.example.com"   (admin console: greeting + teammate replies)
 *
 * Signed-in customers: your login backend inserts a row into Turso `session_tokens`
 * and passes the token to the page, either with the data-* attributes above or with
 *   window.SupportChat.identify({ token, email, name })
 * The widget stores the token and sends it with every message. When the server
 * reports the token as invalid or expired (sessionToken: null), the widget drops it.
 */
(function () {
  'use strict';

  // ---- The values you normally change -----------------------------------------
  var WEBHOOK_URL = 'https://your-n8n-host.example.com/webhook/support-chat';
  // Admin console URL. Leave empty to skip the console greeting and teammate replies.
  var SITE_URL = '';
  // -----------------------------------------------------------------------------
  var POLL_INTERVAL_MS = 15000;

  var REQUEST_TIMEOUT_MS = 20000;
  var STORE_KEY = 'supportChat.v1';
  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var attr = function (name) { return script ? script.getAttribute(name) : null; };
  var globalCfg = window.SUPPORT_CHAT_CONFIG || {};

  var config = {
    webhookUrl: attr('data-webhook-url') || globalCfg.webhookUrl || WEBHOOK_URL,
    siteUrl: (attr('data-site-url') || globalCfg.siteUrl || SITE_URL || '').replace(/\/+$/, ''),
    title: attr('data-title') || globalCfg.title || 'Support',
    accent: attr('data-accent') || globalCfg.accent || '#0b6e4f',
    greeting: globalCfg.greeting || 'Hi! Ask us about orders, shipping, returns or your account.'
  };

  // ---- Persistent state (localStorage, guarded) --------------------------------
  function load() {
    try { return JSON.parse(window.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  var state = load();
  state.messages = Array.isArray(state.messages) ? state.messages.slice(-50) : [];
  state.conversationId = state.conversationId || 'chat:' + uuid();
  state.lastHumanId = state.lastHumanId || 0;
  if (attr('data-session-token')) state.sessionToken = attr('data-session-token');
  if (attr('data-customer-email')) state.email = attr('data-customer-email');
  if (attr('data-customer-name')) state.name = attr('data-customer-name');
  save();

  // ---- Safe Markdown rendering (escape first, then a small whitelist) ---------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function markdown(md) {
    return String(md || '').replace(/\r/g, '').split(/\n{2,}/).map(function (block) {
      var lines = block.split('\n');
      var bullet = lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); });
      var numbered = lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); });
      if (bullet) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-*•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      if (numbered) return '<ol>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; }).join('') + '</ol>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }

  // ---- DOM (Shadow DOM keeps host-page CSS out) ---------------------------------
  var host = document.createElement('div');
  host.setAttribute('data-support-chat', '');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var css = [
    ':host{all:initial}',
    '[hidden]{display:none !important}',
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.sc-bubble{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--sc-accent);color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);display:grid;place-items:center;transition:transform .15s}',
    '.sc-bubble:hover{transform:scale(1.06)}.sc-bubble:focus-visible{outline:3px solid #fff;outline-offset:-6px}',
    '.sc-panel{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 72px);z-index:2147483000;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));background:#fff;color:#1f2328;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}',
    '.sc-panel[hidden]{display:none}',
    '.sc-head{background:var(--sc-accent);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}',
    '.sc-head h2{margin:0;font-size:15px;font-weight:600;flex:1}.sc-head small{display:block;font-weight:400;opacity:.85;font-size:12px}',
    '.sc-x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}.sc-x:focus-visible{outline:2px solid #fff}',
    '.sc-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f8fa}',
    '.sc-msg{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word}',
    '.sc-msg p{margin:0 0 6px}.sc-msg p:last-child{margin:0}.sc-msg ul,.sc-msg ol{margin:4px 0;padding-left:20px}.sc-msg a{color:inherit}',
    '.sc-msg code{background:rgba(0,0,0,.06);padding:0 4px;border-radius:4px;font-size:13px}',
    '.sc-me{align-self:flex-end;background:var(--sc-accent);color:#fff;border-bottom-right-radius:4px}',
    '.sc-bot{align-self:flex-start;background:#fff;border:1px solid #d0d7de;border-bottom-left-radius:4px}',
    '.sc-note{align-self:center;font-size:12px;color:#57606a;text-align:center}',
    '.sc-typing{align-self:flex-start;color:#57606a;font-size:13px;font-style:italic}',
    '.sc-form{border-top:1px solid #d0d7de;padding:10px;display:flex;gap:8px;background:#fff}',
    '.sc-form textarea{flex:1;resize:none;border:1px solid #d0d7de;border-radius:10px;padding:9px 10px;font-size:14px;min-height:40px;max-height:120px}',
    '.sc-form textarea:focus,.sc-pre input:focus{outline:2px solid var(--sc-accent);outline-offset:-1px;border-color:transparent}',
    '.sc-send{border:0;border-radius:10px;background:var(--sc-accent);color:#fff;padding:0 14px;font-size:14px;font-weight:600;cursor:pointer}.sc-send:disabled{opacity:.5;cursor:default}',
    '.sc-pre{padding:16px;display:flex;flex-direction:column;gap:10px;background:#fff;border-top:1px solid #d0d7de}',
    '.sc-pre p{margin:0;font-size:13px;color:#57606a}',
    '.sc-pre label{font-size:13px;font-weight:600;display:flex;flex-direction:column;gap:4px}',
    '.sc-pre input{border:1px solid #d0d7de;border-radius:8px;padding:8px 10px;font-size:14px;font-weight:400}',
    '.sc-err{color:#cf222e;font-size:12px;min-height:16px}',
    '@media (prefers-reduced-motion:reduce){.sc-bubble{transition:none}}'
  ].join('\n');

  root.innerHTML =
    '<style>' + css + '</style>' +
    '<button class="sc-bubble" type="button" aria-label="Open support chat" aria-expanded="false">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<section class="sc-panel" role="dialog" aria-label="Support chat" hidden>' +
      '<header class="sc-head"><h2></h2><button class="sc-x" type="button" aria-label="Close chat">×</button></header>' +
      '<div class="sc-log" role="log" aria-live="polite"></div>' +
      '<form class="sc-pre" hidden novalidate>' +
        '<p>Tell us who you are so a teammate can follow up if needed.</p>' +
        '<label>Name<input name="name" autocomplete="name" maxlength="120"></label>' +
        '<label>Email<input name="email" type="email" autocomplete="email" required maxlength="320"></label>' +
        '<div class="sc-err" aria-live="assertive"></div>' +
        '<button class="sc-send" type="submit" style="padding:10px">Start chat</button>' +
      '</form>' +
      '<form class="sc-form" hidden>' +
        '<textarea name="message" rows="1" maxlength="4000" placeholder="Type your message" aria-label="Message"></textarea>' +
        '<button class="sc-send" type="submit">Send</button>' +
      '</form>' +
    '</section>';

  var $ = function (sel) { return root.querySelector(sel); };
  var bubble = $('.sc-bubble'), panel = $('.sc-panel'), log = $('.sc-log');
  var pre = $('.sc-pre'), form = $('.sc-form'), input = form.querySelector('textarea'), sendBtn = form.querySelector('.sc-send');
  host.style.setProperty('--sc-accent', config.accent);
  $('.sc-head h2').innerHTML = esc(config.title) + '<small>Usually replies in seconds</small>';

  function add(role, text, isHtml) {
    var div = document.createElement('div');
    div.className = role === 'me' ? 'sc-msg sc-me' : role === 'note' ? 'sc-note' : 'sc-msg sc-bot';
    if (role === 'me' || role === 'note') div.textContent = text; else div.innerHTML = isHtml ? text : markdown(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }
  function render() {
    log.innerHTML = '';
    add('bot', config.greeting);
    state.messages.forEach(function (m) { add(m.role, m.text); });
    var identified = !!state.email;
    pre.hidden = identified;
    form.hidden = !identified;
    if (state.sessionToken) add('note', 'Signed in' + (state.email ? ' as ' + state.email : ''));
  }

  function open() {
    panel.hidden = false;
    bubble.setAttribute('aria-expanded', 'true');
    (state.email ? input : pre.querySelector('input[name="email"]')).focus();
  }
  function close() {
    panel.hidden = true;
    bubble.setAttribute('aria-expanded', 'false');
    bubble.focus();
  }
  bubble.addEventListener('click', function () { panel.hidden ? open() : close(); });
  $('.sc-x').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  pre.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = pre.elements.namedItem('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      pre.querySelector('.sc-err').textContent = 'Please enter a valid email address.';
      return;
    }
    state.email = email.toLowerCase();
    state.name = pre.elements.namedItem('name').value.trim() || null;
    save();
    render();
    input.focus();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = '';
    add('me', text);
    state.messages.push({ role: 'me', text: text });
    save();
    var typing = add('note', 'Support is typing…');
    typing.className = 'sc-typing';

    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);
    var sentToken = state.sessionToken || null;

    fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId: state.conversationId,
        sessionToken: sentToken,
        email: state.email,
        name: state.name,
        pageUrl: window.location.href
      }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        var d = r.data || {};
        if (d.conversationId) state.conversationId = d.conversationId;
        // Keep the token the server confirmed; drop one it rejected.
        if (Object.prototype.hasOwnProperty.call(d, 'sessionToken')) {
          if (d.sessionToken) state.sessionToken = d.sessionToken;
          else if (sentToken) { state.sessionToken = null; add('note', 'Your sign-in has expired. Sign in again to see order details.'); }
        }
        var reply = d.reply || (r.ok ? '' : 'Sorry, something went wrong. Please try again.');
        if (reply) {
          add('bot', reply);
          state.messages.push({ role: 'bot', text: reply });
        }
        save();
      })
      .catch(function () {
        var msg = 'We could not reach support right now. Please try again in a moment, or email us.';
        add('bot', msg);
      })
      .then(function () {
        clearTimeout(timer);
        typing.remove();
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  });

  // ---- Public API for the host page --------------------------------------------
  window.SupportChat = {
    open: open,
    close: close,
    identify: function (who) {
      who = who || {};
      if (who.token) state.sessionToken = String(who.token);
      if (who.email) state.email = String(who.email).toLowerCase();
      if (who.name) state.name = String(who.name);
      save();
      render();
    },
    signOut: function () {
      state.sessionToken = null;
      save();
      render();
    },
    reset: function () {
      state = { messages: [], conversationId: 'chat:' + uuid(), lastHumanId: 0 };
      save();
      render();
    },
    config: config
  };

  // ---- Admin console: greeting text and teammate replies (polled) --------------
  function loadGreeting() {
    if (!config.siteUrl || globalCfg.greeting) return;
    fetch(config.siteUrl + '/api/public/widget-config', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.greeting) { config.greeting = String(d.greeting).slice(0, 500); render(); }
      })
      .catch(function () { /* keep the default greeting */ });
  }

  var polling = false;
  function poll() {
    if (!config.siteUrl || polling || !state.messages.length) return;
    polling = true;
    var url = config.siteUrl + '/api/public/chat/messages?conversationId=' + encodeURIComponent(state.conversationId) + '&after=' + encodeURIComponent(state.lastHumanId || 0);
    fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
      .then(function (d) {
        (d.messages || []).forEach(function (m) {
          state.lastHumanId = Math.max(state.lastHumanId || 0, Number(m.id) || 0);
          var text = String(m.text || '');
          add('bot', text);
          state.messages.push({ role: 'bot', text: text });
          if (panel.hidden) bubble.setAttribute('aria-label', 'Open support chat (new reply from our team)');
        });
        save();
      })
      .catch(function () { /* try again next time */ })
      .then(function () { polling = false; });
  }

  function mount() {
    document.body.appendChild(host);
    render();
    loadGreeting();
    if (config.siteUrl) {
      setInterval(function () { if (!document.hidden) poll(); }, POLL_INTERVAL_MS);
      poll();
    }
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
