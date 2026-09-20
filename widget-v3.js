/* ════════════════════════════════════════════════════════════
   AI WIDGET — client logic (v3: extensible user context)
   Self-contained: injects its own HTML into <body> on load.

   DESIGN NOTE for future phases: getUserContext() builds one `ctx`
   object. Each data source (Core/Level, mood, reflection, tasks...)
   is fetched in its OWN try/catch block. To add a new phase's data
   later, add a new try/catch block that sets another ctx.xxx field —
   never edit or remove an existing block. This keeps every phase
   additive instead of requiring rework.
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CONFIG = {
    ENDPOINT: 'https://zwhomfxsalcchmevulot.supabase.co/functions/v1/Ai-chat',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
    GREETING: 'ถามอะไรก็ได้เกี่ยวกับ Brain & Core — Core ของคุณ, ด่านต่างๆ, หรือระบบฝึกประจำวัน',
    MAX_HISTORY_TURNS: 12
  };

  let state = {
    open: false,
    sending: false,
    messages: [],
    userContext: undefined // undefined = not fetched yet this session
  };

  // ── Build the user context object. Additive by design — see note above. ──
  async function getUserContext() {
    if (state.userContext !== undefined) return state.userContext; // cache per session

    const ctx = {};
    let dashCtx = null; // shared across blocks below (core/lv/log/user)

    // [Phase 1] Primary Core + Level
    try {
      if (typeof _getDashUserCtx === 'function') {
        dashCtx = await _getDashUserCtx();
        if (dashCtx && dashCtx.core && dashCtx.core !== '◈' &&
            typeof CHARACTERS !== 'undefined' && CHARACTERS[dashCtx.core]) {
          ctx.core = CHARACTERS[dashCtx.core].name || dashCtx.core;
          ctx.level = dashCtx.lv || 1;
        }
      }
    } catch (e) {
      console.warn('[ai-widget] core/level context unavailable:', e);
    }

    // [Phase 2] Today's mood check-in
    try {
      if (typeof dashState !== 'undefined' && dashState.mood && typeof _todayKey === 'function') {
        const mood = dashState.mood[_todayKey()];
        if (mood) ctx.mood = mood;
      }
    } catch (e) {
      console.warn('[ai-widget] mood context unavailable:', e);
    }

    // [Phase 2] Today's Focus task completion
    try {
      if (dashCtx && dashCtx.core && typeof _getDashTasks === 'function') {
        const t = _getDashTasks(dashCtx.core, dashCtx.lv, dashCtx.log, dashCtx.user);
        if (t && Array.isArray(t.tasks) && t.tasks.length) {
          const done = t.tasks.filter(function (x) { return x.done; }).length;
          ctx.tasksToday = done + '/' + t.tasks.length + ' completed';
        }
      }
    } catch (e) {
      console.warn('[ai-widget] tasks context unavailable:', e);
    }

    // [Phase 3] Tonight's Reflection note
    try {
      if (typeof dashState !== 'undefined' && dashState.reflections && typeof _todayKey === 'function') {
        const note = dashState.reflections[_todayKey()];
        if (note) ctx.reflection = note;
      }
    } catch (e) {
      console.warn('[ai-widget] reflection context unavailable:', e);
    }

    // ── ADD FUTURE PHASES HERE — new try/catch block, new ctx.xxx field ──

    state.userContext = Object.keys(ctx).length ? ctx : null;
    return state.userContext;
  }

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
      getUserContext(); // warm the cache as soon as the panel opens
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
      const userContext = await getUserContext();

      const payload = {
        messages: state.messages.slice(-CONFIG.MAX_HISTORY_TURNS * 2),
        userContext: userContext
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
