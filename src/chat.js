import { getAuthToken } from './supabase.js';
import { esc } from './ui.js';

const CHAT_URL = 'https://qdywaenmojdxhfxqbvun.supabase.co/functions/v1/chat-bot';
const STORAGE_KEY = 'rais_marco_history';
const MAX_HISTORY = 40;

let _messages = [];
let _container = null;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'marco') {
    if (_container) initMarcoPage(_container);
  }
});

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _messages = raw ? JSON.parse(raw) : [];
  } catch(e) { _messages = []; }
}

function saveHistory() {
  if (_messages.length > MAX_HISTORY) _messages = _messages.slice(-MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_messages));
}

function renderFeed() {
  const feed = document.getElementById('marco-feed');
  if (!feed) return;
  if (!_messages.length) {
    feed.innerHTML = '<div class="marco-empty">Hallo! Ich bin Marco — frag mich alles über dein Business, deine Leads oder deine Performance.</div>';
    return;
  }
  feed.innerHTML = _messages.map(function(m) {
    return '<div class="marco-msg marco-msg-' + m.role + '">' +
      '<div class="marco-bubble">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' +
    '</div>';
  }).join('');
  feed.scrollTop = feed.scrollHeight;
}

function appendMsg(role, text) {
  _messages.push({ role: role, text: text, ts: Date.now() });
  saveHistory();
  renderFeed();
}

async function sendMessage() {
  const input = document.getElementById('marco-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  appendMsg('user', text);

  const feed = document.getElementById('marco-feed');
  if (feed) {
    const typing = document.createElement('div');
    typing.id = 'marco-typing';
    typing.className = 'marco-msg marco-msg-bot';
    typing.innerHTML = '<div class="marco-bubble marco-typing-dots"><span></span><span></span><span></span></div>';
    feed.appendChild(typing);
    feed.scrollTop = feed.scrollHeight;
  }

  try {
    const authToken = getAuthToken();
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ message: text }),
    });
    document.getElementById('marco-typing')?.remove();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    appendMsg('bot', json.reply || '(keine Antwort)');
  } catch(e) {
    document.getElementById('marco-typing')?.remove();
    appendMsg('bot', 'Verbindungsfehler: ' + e.message);
  }
}

export function initMarcoPage(containerEl) {
  _container = containerEl;
  loadHistory();

  containerEl.innerHTML =
    '<div class="marco-layout">' +
      '<div class="marco-header">' +
        '<div class="marco-title">&#129302; Marco</div>' +
        '<button class="btn bg bsm" onclick="marcoClearChat()" title="Verlauf löschen">&#128465;</button>' +
      '</div>' +
      '<div id="marco-feed" class="marco-feed"></div>' +
      '<div class="marco-foot">' +
        '<textarea id="marco-input" class="marco-input" placeholder="Nachricht eingeben…" rows="2"></textarea>' +
        '<button class="btn bp marco-send-btn" onclick="marcoSend()">&#9654;</button>' +
      '</div>' +
    '</div>';

  renderFeed();

  const input = containerEl.querySelector('#marco-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }
}

window.marcoSend = sendMessage;
window.marcoClearChat = function() {
  if (!confirm('Chatverlauf löschen?')) return;
  _messages = [];
  saveHistory();
  renderFeed();
};
