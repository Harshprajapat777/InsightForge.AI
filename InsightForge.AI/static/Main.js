/* ================================================================
   InsightForge.AI — Main.js
   Handles chat UI: send query, render answer, citations, steps
   ================================================================ */

const API_URL   = '/chat';
const LOGO_URL  = '/logo/InsightAI.jpg';

const welcomeEl  = document.getElementById('welcome');
const messagesEl = document.getElementById('messages');
const inputEl    = document.getElementById('queryInput');
const sendBtn    = document.getElementById('sendBtn');

let isLoading = false;

// ── Sidebar quick-query ─────────────────────────────────────────
function setQuery(text) {
  inputEl.value = text;
  autoResize(inputEl);
  inputEl.focus();
}

// ── Auto-resize textarea ────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ── Enter = send, Shift+Enter = new line ────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendQuery();
  }
}

// ── Show messages panel, hide welcome ──────────────────────────
function showMessages() {
  if (welcomeEl) welcomeEl.style.display = 'none';
  messagesEl.style.display = 'flex';
}

// ── Scroll chat to bottom ───────────────────────────────────────
function scrollBottom() {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

// ── Format timestamp ────────────────────────────────────────────
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ── Append user message bubble ──────────────────────────────────
function appendUserMsg(text) {
  showMessages();
  const el = document.createElement('div');
  el.className = 'msg-user';
  el.innerHTML = `<div class="msg-user-bubble">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(el);
  scrollBottom();
}

// ── Loading state messages — cycle while agent is processing ────
const LOADING_STEPS = [
  { icon: '💭', text: 'Thinking about your query'      },
  { icon: '🔍', text: 'Searching the document'         },
  { icon: '📋', text: 'Retrieving relevant data'       },
  { icon: '⚙️',  text: 'Running agent tools'            },
  { icon: '🧠', text: 'Reasoning through the findings' },
  { icon: '📝', text: 'Composing the response'         },
];

let _loadingMsgInterval = null;
let _loadingTimeInterval = null;
let _loadingStep = 0;
let _loadingStart = 0;

function appendTyping() {
  const el = document.createElement('div');
  el.className = 'msg-agent typing-indicator';
  el.id = 'typing';
  el.innerHTML = `
    <div class="agent-avatar">
      <img src="${LOGO_URL}" alt="Agent"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <span class="avatar-initials" style="display:none;">IF</span>
    </div>
    <div class="typing-bubble">
      <span class="typing-icon" id="typingIcon">${LOADING_STEPS[0].icon}</span>
      <div class="typing-status">
        <span class="typing-text" id="typingText">${LOADING_STEPS[0].text}</span>
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
      <span class="typing-elapsed" id="typingElapsed">0s</span>
    </div>`;
  messagesEl.appendChild(el);
  scrollBottom();

  // Cycle status messages every 2.4 s
  _loadingStep  = 0;
  _loadingStart = Date.now();

  _loadingMsgInterval = setInterval(() => {
    _loadingStep = (_loadingStep + 1) % LOADING_STEPS.length;
    const { icon, text } = LOADING_STEPS[_loadingStep];
    const textEl = document.getElementById('typingText');
    const iconEl = document.getElementById('typingIcon');
    if (!textEl) return;
    textEl.classList.add('fading');
    setTimeout(() => {
      if (textEl) { textEl.textContent = text; textEl.classList.remove('fading'); }
      if (iconEl) iconEl.textContent = icon;
    }, 220);
  }, 2400);

  // Tick elapsed time every second
  _loadingTimeInterval = setInterval(() => {
    const el = document.getElementById('typingElapsed');
    if (!el) return;
    const secs = Math.floor((Date.now() - _loadingStart) / 1000);
    el.textContent = secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`;
  }, 1000);
}

function removeTyping() {
  clearInterval(_loadingMsgInterval);
  clearInterval(_loadingTimeInterval);
  _loadingMsgInterval = _loadingTimeInterval = null;
  const el = document.getElementById('typing');
  if (el) el.remove();
}

// ── Append agent response ───────────────────────────────────────
function appendAgentMsg(data) {
  const el = document.createElement('div');
  el.className = 'msg-agent';

  // Citations — outside card
  let citationsHtml = '';
  if (data.citations && data.citations.length) {
    const badges = data.citations
      .map(c => `<span class="citation-badge">${escapeHtml(c)}</span>`)
      .join('');
    citationsHtml = `
      <div class="meta-section">
        <span class="meta-label">Sources</span>
        <div class="citations-row">${badges}</div>
      </div>`;
  }

  // Tools used — outside card
  let toolsHtml = '';
  if (data.tools_used && data.tools_used.length) {
    const tags = data.tools_used
      .map(t => `<span class="tool-tag">${escapeHtml(t)}</span>`)
      .join('');
    toolsHtml = `
      <div class="meta-section">
        <span class="meta-label">Tools Used</span>
        <div class="tools-row">${tags}</div>
      </div>`;
  }

  // Agent steps accordion — outside card, properly labeled
  let stepsHtml = '';
  if (data.agent_steps && data.agent_steps.length) {
    const stepItems = data.agent_steps.map((s, i) => {
      // Try to pretty-print JSON action inputs
      let inputHtml = '';
      if (s.action_input) {
        let inputDisplay = s.action_input;
        try {
          const parsed = JSON.parse(s.action_input);
          inputDisplay = JSON.stringify(parsed, null, 2);
        } catch (e) { /* keep as-is */ }
        inputHtml = `<div class="step-input">${escapeHtml(inputDisplay)}</div>`;
      }
      return `
      <div class="step-item">
        <div class="step-header"><span class="step-num">Step ${i + 1}</span></div>
        ${s.thought    ? `<div class="step-thought">${escapeHtml(s.thought)}</div>` : ''}
        ${s.action     ? `<div class="step-action">&#9881;&nbsp; ${escapeHtml(s.action)}</div>` : ''}
        ${inputHtml}
        ${s.observation ? `<div class="step-obs">${escapeHtml(s.observation)}</div>` : ''}
      </div>`;
    }).join('');

    stepsHtml = `
      <div class="steps-accordion">
        <button class="steps-toggle" onclick="toggleSteps(this)">
          &#128270;&nbsp; Agent Reasoning &amp; Tool Calls
          <span style="display:flex;align-items:center;gap:8px;">
            <span style="background:rgba(139,92,246,0.15);color:var(--purple);font-size:0.62rem;padding:1px 7px;border-radius:99px;">${data.agent_steps.length} steps</span>
            <span class="arrow">&#9660;</span>
          </span>
        </button>
        <div class="steps-body hidden">${stepItems}</div>
      </div>`;
  }

  // Metadata block — rendered outside the answer card
  const metaHtml = (citationsHtml || toolsHtml || stepsHtml)
    ? `<div class="response-meta">${citationsHtml}${toolsHtml}${stepsHtml}</div>`
    : '';

  el.innerHTML = `
    <div class="agent-avatar">
      <img src="${LOGO_URL}" alt="Agent"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <span class="avatar-initials" style="display:none;">IF</span>
    </div>
    <div class="msg-agent-body">
      <div class="agent-name">InsightForge.AI</div>
      <div class="agent-answer-card">${formatAnswer(data.answer)}</div>
      ${metaHtml}
      <div class="msg-time">${fmtTime(data.timestamp)}</div>
    </div>`;

  messagesEl.appendChild(el);
  scrollBottom();
}

// ── Append error card ───────────────────────────────────────────
function appendError(msg) {
  const el = document.createElement('div');
  el.className = 'msg-agent';
  el.innerHTML = `
    <div class="agent-avatar"><img src="${LOGO_URL}" alt="Agent" /></div>
    <div class="msg-agent-body">
      <div class="agent-name">InsightForge.AI</div>
      <div class="error-card">&#9888; ${escapeHtml(msg)}</div>
    </div>`;
  messagesEl.appendChild(el);
  scrollBottom();
}

// ── Toggle steps accordion ──────────────────────────────────────
function toggleSteps(btn) {
  btn.classList.toggle('open');
  const body = btn.nextElementSibling;
  body.classList.toggle('hidden');
}

// ── Main send function ──────────────────────────────────────────
async function sendQuery() {
  if (isLoading) return;
  const query = inputEl.value.trim();
  if (!query) return;

  isLoading = true;
  sendBtn.disabled = true;
  inputEl.value = '';
  inputEl.style.height = 'auto';

  appendUserMsg(query);
  appendTyping();

  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query }),
    });

    removeTyping();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      appendError(err.detail || `Server error ${res.status}`);
      return;
    }

    const data = await res.json();
    appendAgentMsg(data);

  } catch (err) {
    removeTyping();
    appendError('Could not reach the server. Is it running on port 8001?');
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ── XSS-safe HTML escape ────────────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Format answer — split Source: lines into styled citation blocks ──
function formatAnswer(rawText) {
  if (!rawText) return '';

  const lines      = rawText.split('\n');
  const mainLines  = [];
  const srcLines   = [];

  for (const line of lines) {
    if (/^Source:/i.test(line.trim())) {
      srcLines.push(line.trim());
    } else {
      mainLines.push(line);
    }
  }

  // Main answer text (pre-wrap handles newlines)
  let html = `<div class="answer-text">${escapeHtml(mainLines.join('\n').trim())}</div>`;

  if (srcLines.length) {
    const items = srcLines.map(line => {
      // Split "Source: Page X" from the rest of the line
      const m = line.match(/^(Source:\s*(?:Page\s*[\d\w]+)?)\s*[—\-]?\s*(.*)/is);
      if (m) {
        const label = escapeHtml(m[1].trim());
        const quote = m[2] ? escapeHtml(m[2].trim()) : '';
        return `<div class="inline-source">
          <span class="src-label">${label}</span>${quote ? `<span class="src-sep"> — </span><span class="src-quote">${quote}</span>` : ''}
        </div>`;
      }
      return `<div class="inline-source">${escapeHtml(line)}</div>`;
    }).join('');
    html += `<div class="inline-sources">${items}</div>`;
  }

  return html;
}
