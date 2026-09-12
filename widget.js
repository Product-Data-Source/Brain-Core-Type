/* ════════════════════════════════════════════════════════════
   AI WIDGET — client logic
   Self-contained: injects its own HTML into <body> on load, so
   index.html only needs to load this file + widget.css. No other
   HTML edits required. Works on every screen of the SPA because
   it lives outside the .screen containers, fixed to the viewport.
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── CONFIG — edit this after deploying the Supabase Edge Function ──
  const CONFIG = {
    ENDPOINT: 'https://zwhomfxsalcchmevulot.supabase.co/functions/v1/Ai-chat',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aG9tZnhzYWxjY2htZXZ1bG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTQyMjMsImV4cCI6MjA5NTAzMDIyM30.eFGjW43o4GRK_DNuDEsPNKASgxMkRUichQLqEInCh1k', // sent as Bearer token; the function itself holds the real Anthropic key
    GREETING: 'ถามอะไรก็ได้เกี่ยวกับ Brain & Core — Core ของคุณ, ด่านต่างๆ, หรือระบบฝึกประจำวัน',
    MAX_HISTORY_TURNS: 12 // trim conversation sent to the backend to keep requests small
  };

  let state = {
    open: false,
    sending: false,
    messages: [] // { role: 'user' | 'assistant', content: string }
  };

  // ── Inject markup ──
  function buildDOM() {
    const fab = document.createElement('button');
    fab.className = 'aiw-fab';
    fab.setAttribute('aria-label', 'Ask the Archive');
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>';

    const panel = document.createElement('div');
    panel.className = 'aiw-panel';
    panel.innerHTML =
      '<div class="aiw-header">' +
        '<span>Ask the Archive</span>' +
        '<button class="aiw-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="aiw-messages" id="aiwMessages">' +
        '<div class="aiw-empty">' + CONFIG.GREETING + '</div>' +
      '</div>' +
      '<div class="aiw-input-row">' +
        '<textarea class="aiw-input" id="aiwInput" rows="1" placeholder="พิมพ์คำถาม..."></textarea>' +
        '<button class="aiw-send" id="aiwSend" aria-label="Send">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    return { fab, panel };
  }

  function togglePanel(fab, panel, force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    fab.classList.toggle('is-open', state.open);
    panel.classList.toggle('is-open', state.open);
    if (state.open) {
      const input = panel.querySelector('#aiwInput');
      if (input) setTimeout(function () { input.focus(); }, 200);
    }
  }

  function appendMessage(container, role, text) {
    const empty = container.querySelector('.aiw-empty');
    if (empty) empty.remove();
    const el = document.createElement('div');
    el.className = 'aiw-msg aiw-msg--' + role;
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function appendTyping(container) {
    const el = document.createElement('div');
    el.className = 'aiw-msg aiw-msg--assistant aiw-msg--typing';
    el.textContent = 'กำลังพิมพ์...';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  async function sendMessage(text, container, sendBtn) {
    if (!text.trim() || state.sending) return;

    state.sending = true;
    sendBtn.disabled = true;

    appendMessage(container, 'user', text);
    state.messages.push({ role: 'user', content: text });

    const typingEl = appendTyping(container);

    try {
      const payload = {
        messages: state.messages.slice(-CONFIG.MAX_HISTORY_TURNS * 2)
      };

      const res = await fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Request failed: ' + res.status);

      const data = await res.json();
      const reply = data.reply || 'ขออภัย ไม่สามารถตอบได้ในตอนนี้';

      typingEl.remove();
      appendMessage(container, 'assistant', reply);
      state.messages.push({ role: 'assistant', content: reply });

    } catch (err) {
      typingEl.remove();
      appendMessage(container, 'assistant', 'เกิดข้อผิดพลาดในการเชื่อมต่อ ลองใหม่อีกครั้งครับ');
      console.error('[ai-widget]', err);
    } finally {
      state.sending = false;
      sendBtn.disabled = false;
    }
  }

  function init() {
    const { fab, panel } = buildDOM();
    const messagesEl = panel.querySelector('#aiwMessages');
    const inputEl = panel.querySelector('#aiwInput');
    const sendBtn = panel.querySelector('#aiwSend');
    const closeBtn = panel.querySelector('.aiw-close');

    fab.addEventListener('click', function () { togglePanel(fab, panel); });
    closeBtn.addEventListener('click', function () { togglePanel(fab, panel, false); });

    function submit() {
      const text = inputEl.value;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      sendMessage(text, messagesEl, sendBtn);
    }

    sendBtn.addEventListener('click', submit);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
