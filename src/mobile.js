import { S, STATUS } from './state.js';
import { esc, escJs, toast } from './ui.js';
import { td, relAge, gewerkKuerzel, gewerkSlug } from './utils.js';

// ── Call Queue State ──────────────────────────────────────────────────────────

let _queue = [];
let _idx = 0;
let _currentId = null;

const ACTIVE_STATUSES = new Set([
  'neu', 'kein_anschluss', 'kein_anschluss_2', 'gatekeeper',
  'callback', 'no_show', 'email_nurture', 'interessiert', 'door_open',
]);

function buildCallQueue() {
  const t = td();
  return S.contacts
    .filter(c => ACTIVE_STATUSES.has(c.status || 'neu'))
    .sort((a, b) => {
      const aOver = (a.followup && a.followup <= t) ? 0 : 1;
      const bOver = (b.followup && b.followup <= t) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aTouches = (a.touches || []).filter(tx => tx.status || tx.datum).length;
      const bTouches = (b.touches || []).filter(tx => tx.status || tx.datum).length;
      return aTouches - bTouches;
    });
}

// ── Call Mode ─────────────────────────────────────────────────────────────────

export function openCallMode() {
  _queue = buildCallQueue();
  _idx = 0;
  const el = document.getElementById('call-mode');
  if (!el) return;
  el.classList.add('open');
  _renderCallCard();
}

export function closeCallMode() {
  const el = document.getElementById('call-mode');
  if (el) el.classList.remove('open');
  _currentId = null;
  if (window.render) window.render();
}

function _renderCallCard() {
  if (_idx >= _queue.length) {
    _showDoneState();
    return;
  }
  const c = _queue[_idx];
  _currentId = c.id;

  const progressEl = document.getElementById('cm-progress');
  if (progressEl) progressEl.textContent = `${_idx + 1} / ${_queue.length}`;

  const body = document.getElementById('cm-body');
  if (!body) return;

  const validTouches = (c.touches || []).filter(tx => tx.status || tx.datum);
  const touchCount = validTouches.length;
  const lastTouch = validTouches[validTouches.length - 1];
  const gwBadge = c.gewerk
    ? `<span class="gw-badge gw-${gewerkSlug(c.gewerk)}">${gewerkKuerzel(c.gewerk)}</span>`
    : '';
  const stadtStr = c.stadt ? `<span style="font-size:13px;color:var(--st)">${esc(c.stadt)}</span>` : '';

  let lastTouchHtml = '';
  if (lastTouch && lastTouch.status) {
    lastTouchHtml = `<div class="cm-last-touch">
      <strong>T${touchCount} · ${esc(lastTouch.status)}</strong>${lastTouch.datum ? ` · <span style="font-family:sans-serif">${relAge(lastTouch.datum)}</span>` : ''}
      ${lastTouch.notiz ? `<div style="margin-top:4px;font-size:12px">${esc(lastTouch.notiz)}</div>` : ''}
    </div>`;
  }

  const callBtn = c.telefon
    ? `<a id="cm-call-btn" href="tel:${esc(c.telefon)}" onclick="cmCallTap('${escJs(c.id)}')">&#128222;&nbsp; ${esc(c.telefon)}</a>`
    : `<div style="padding:16px;text-align:center;color:var(--st);font-size:14px;font-family:sans-serif;background:var(--sf);border-radius:12px">Keine Telefonnummer hinterlegt</div>`;

  body.innerHTML = `
    <div>
      <div class="cm-firma">${esc(c.firma)}</div>
      <div class="cm-sub">${gwBadge}${stadtStr}</div>
    </div>
    ${lastTouchHtml}
    ${callBtn}
    <button id="cm-skip" onclick="cmSkip()">&#8592; Überspringen</button>
  `;
}

function _showDoneState() {
  const progressEl = document.getElementById('cm-progress');
  if (progressEl) progressEl.textContent = '';
  const body = document.getElementById('cm-body');
  if (!body) return;
  body.innerHTML = `
    <div class="cm-done">
      <div class="cm-done-emoji">&#127881;</div>
      <h2>Fertig!</h2>
      <p>${_queue.length} Lead${_queue.length !== 1 ? 's' : ''} durchgearbeitet</p>
      <button class="btn bp" onclick="closeCallMode()" style="margin-top:16px">&#8592; Zurück zur Liste</button>
    </div>
  `;
}

export function cmCallTap(id) {
  // Short delay so the tel: link fires before the sheet opens
  setTimeout(() => _openQuickLogSheet(id, true), 500);
}

export function cmSkip() {
  _idx++;
  _renderCallCard();
}

// ── Quick-Log Bottom Sheet ────────────────────────────────────────────────────

const QUICK_STATUS_ITEMS = [
  { icon: '&#10006;', label: 'Kein Anschluss',     status: 'kein_anschluss' },
  { icon: '&#10006;', label: 'Kein Anschluss 2',   status: 'kein_anschluss_2' },
  { icon: '&#128231;', label: 'Gatekeeper',         status: 'gatekeeper' },
  { icon: '&#128197;', label: 'Rückruf erbeten',    status: 'callback' },
  { icon: '&#128197;', label: 'Demo Termin',        status: 'demo_termin' },
  { icon: '&#11088;', label: 'Interessiert',        status: 'interessiert' },
  { icon: '&#128226;', label: 'Nicht interessiert', status: 'disqualified' },
  { icon: '&#128247;', label: 'No-Show',            status: 'no_show' },
];

function _openQuickLogSheet(id, autoAdvance) {
  const c = S.contacts.find(x => x.id === id);
  if (!c) return;

  const sheet = document.getElementById('bs-quicklog');
  const overlay = document.getElementById('bs-overlay');
  if (!sheet || !overlay) return;

  const notizInput = sheet.querySelector('#bs-notiz-input');
  if (notizInput) notizInput.value = '';

  sheet.dataset.contactId = id;
  sheet.dataset.autoAdvance = autoAdvance ? '1' : '0';

  const titleEl = sheet.querySelector('.bs-title strong');
  if (titleEl) titleEl.textContent = c.firma;

  const itemsEl = sheet.querySelector('.bs-ql-items');
  if (itemsEl) {
    itemsEl.innerHTML = QUICK_STATUS_ITEMS.map(item =>
      `<button class="bs-item" onclick="cmStatusPick('${item.status}')">
        <span class="bs-item-icon">${item.icon}</span>
        <span class="bs-item-label">${item.label}</span>
      </button>`
    ).join('');
  }

  requestAnimationFrame(() => {
    sheet.classList.add('open');
    overlay.classList.add('open');
  });
}

export function openQuickStatusSheet(id) {
  _openQuickLogSheet(id, false);
}

export function cmStatusPick(status) {
  const sheet = document.getElementById('bs-quicklog');
  if (!sheet) return;
  const id = sheet.dataset.contactId;
  const autoAdvance = sheet.dataset.autoAdvance === '1';
  const notizInput = sheet.querySelector('#bs-notiz-input');
  const notiz = notizInput ? notizInput.value.trim() : '';

  _closeAllSheets();

  if (window.qs) window.qs(id, status);

  // Append note to the touch that qs() just created
  if (notiz) {
    const c = S.contacts.find(x => x.id === id);
    if (c && c.touches && c.touches.length > 0) {
      c.touches[c.touches.length - 1].notiz = notiz;
      if (window.render) window.render();
    }
  }

  if (autoAdvance) {
    _idx++;
    setTimeout(() => _renderCallCard(), 150);
  }
}

export function cmOpenDetails() {
  const sheet = document.getElementById('bs-quicklog');
  if (!sheet) return;
  const id = sheet.dataset.contactId;
  _closeAllSheets();
  if (window.openP) window.openP(id);
}

export function closeBottomSheet() {
  _closeAllSheets();
}

function _closeAllSheets() {
  ['bs-quicklog', 'bs-action'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  const overlay = document.getElementById('bs-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ── Action Sheet (long-press on cards) ───────────────────────────────────────

let _longPressTimer = null;
let _suppressNextClick = false;

function _initLongPress() {
  document.addEventListener('touchstart', function(e) {
    const card = e.target.closest('.mc');
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;
    _longPressTimer = setTimeout(() => {
      _suppressNextClick = true;
      _showActionSheet(id);
    }, 500);
  }, { passive: true });

  document.addEventListener('touchend', _cancelLongPress, { passive: true });
  document.addEventListener('touchmove', _cancelLongPress, { passive: true });
  document.addEventListener('touchcancel', _cancelLongPress, { passive: true });

  // Suppress browser context menu on mobile cards
  document.addEventListener('contextmenu', function(e) {
    if (window.innerWidth <= 768 && e.target.closest('.mc')) {
      e.preventDefault();
    }
  });

  // Suppress card click immediately after long-press
  document.addEventListener('click', function(e) {
    if (_suppressNextClick) {
      const card = e.target.closest('.mc');
      if (card) { e.stopPropagation(); e.preventDefault(); }
      _suppressNextClick = false;
    }
  }, true);
}

function _cancelLongPress() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

function _actionBtn(icon, label, handler, cls) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bs-item' + (cls ? ' ' + cls : '');
  btn.innerHTML = '<span class="bs-item-icon">' + icon + '</span><span class="bs-item-label">' + label + '</span>';
  btn.addEventListener('click', function() {
    _closeAllSheets();
    handler();
  });
  return btn;
}

function _showActionSheet(id) {
  const c = S.contacts.find(x => x.id === id);
  if (!c) return;

  const sheet = document.getElementById('bs-action');
  const overlay = document.getElementById('bs-overlay');
  if (!sheet || !overlay) return;

  const titleEl = sheet.querySelector('.bs-title strong');
  if (titleEl) titleEl.textContent = c.firma;

  const listEl = sheet.querySelector('.bs-action-items');
  if (!listEl) return;
  listEl.replaceChildren();

  const tel = c.telefon || '';

  if (tel) {
    listEl.appendChild(_actionBtn('&#128222;', 'Anrufen', function() {
      window.location.href = 'tel:' + tel;
    }));
  }
  listEl.appendChild(_actionBtn('&#9889;', 'Status ändern', function() { openQuickStatusSheet(id); }));
  listEl.appendChild(_actionBtn('&#9998;', 'Bearbeiten', function() { if (window.openE) window.openE(id); }));
  listEl.appendChild(_actionBtn('&#128203;', 'Schnellnotiz', function() { if (window.openQN) window.openQN(id); }));
  listEl.appendChild(_actionBtn('&#9889;', 'Markieren…', function() { if (window.openAktionPop) window.openAktionPop(id); }));
  if (c.email) {
    listEl.appendChild(_actionBtn('&#128231;', 'Email…', function() { if (window.openMailCompose) window.openMailCompose(id); }));
  }
  listEl.appendChild(_actionBtn('&#127891;', 'Sales Rep…', function() { if (window.openSalesRepPop) window.openSalesRepPop(id); }));
  listEl.appendChild(_actionBtn('&#128197;', 'Rückruf planen', function() { if (window.openCalPop) window.openCalPop(id, 'rueckruf'); }));
  listEl.appendChild(_actionBtn('&#128197;', 'Demo / Sales Call', function() { if (window.openCalPop) window.openCalPop(id, 'demo'); }));
  listEl.appendChild(_actionBtn('&#128197;', 'Kundentermin', function() { if (window.openCalPop) window.openCalPop(id, 'kundentermin'); }));
  listEl.appendChild(_actionBtn('&#128465;', 'Lead entfernen', function() { if (window.del) window.del(id); }, 'bs-item-destructive'));

  requestAnimationFrame(() => {
    sheet.classList.add('open');
    overlay.classList.add('open');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

let _mobileInited = false;

export function initMobile() {
  if (_mobileInited) return;
  _mobileInited = true;
  _initLongPress();

  const overlay = document.getElementById('bs-overlay');
  if (overlay) overlay.addEventListener('click', _closeAllSheets);
}

// Expose on window so inline HTML handlers can call these
window.openCallMode = openCallMode;
window.closeCallMode = closeCallMode;
window.cmCallTap = cmCallTap;
window.cmSkip = cmSkip;
window.cmStatusPick = cmStatusPick;
window.cmOpenDetails = cmOpenDetails;
window.openQuickStatusSheet = openQuickStatusSheet;
window.closeBottomSheet = closeBottomSheet;
