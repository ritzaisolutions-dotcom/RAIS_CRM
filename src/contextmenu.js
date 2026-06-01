import { S } from './state.js';
import { toast } from './ui.js';

let _ctxId = null;

function getContact(id) {
  return S.contacts.find(function(x) { return x.id === id; });
}

function closeCtxMenu() {
  const menu = document.getElementById('ctxMenu');
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = '';
  }
  _ctxId = null;
}

function clampMenuPosition(menu, x, y) {
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const pad = 8;
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = Math.max(pad, left) + 'px';
  menu.style.top = Math.max(pad, top) + 'px';
}

/** Für inline oncontextmenu auf Tabellenzeilen (zuverlässig auch nach Deploy / SW) */
export function showCtxMenuAtEvent(e, id) {
  if (!e) return false;
  e.preventDefault();
  e.stopPropagation();
  showCtxMenu(e.clientX, e.clientY, id);
  return false;
}

function showCtxMenu(x, y, id) {
  const c = getContact(id);
  if (!c) return;
  _ctxId = id;
  const menu = document.getElementById('ctxMenu');
  if (!menu) return;
  const hasEmail = !!c.email;
  const hasTel = !!c.telefon;
  const hasWeb = !!c.website;

  menu.innerHTML =
    '<button type="button" class="ctx-item" data-action="aktion">⚡ Markieren…</button>' +
    '<button type="button" class="ctx-item"' + (hasEmail ? '' : ' disabled') + ' data-action="mail">✉️ Email senden…</button>' +
    '<button type="button" class="ctx-item" data-action="cal-demo">📅 Demo in Kalender (15 Min)</button>' +
    '<button type="button" class="ctx-item" data-action="cal-rueckruf">📅 Rückruf in Kalender (5 Min)</button>' +
    '<button type="button" class="ctx-item ctx-danger" data-action="del">🗑 Lead entfernen</button>' +
    '<div class="ctx-sep"></div>' +
    '<button type="button" class="ctx-item" data-action="open">Details öffnen</button>' +
    '<button type="button" class="ctx-item" data-action="qn">Schnellnotiz</button>' +
    (hasTel ? '<button type="button" class="ctx-item" data-action="call">📞 Anrufen</button>' : '') +
    (hasWeb ? '<button type="button" class="ctx-item" data-action="web">🌐 Website öffnen</button>' : '') +
    '<button type="button" class="ctx-item" data-action="edit">✏️ Bearbeiten</button>';

  menu.querySelectorAll('.ctx-item').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      if (btn.disabled) return;
      ctxAction(btn.dataset.action, id);
    });
  });

  menu.style.left = '0';
  menu.style.top = '0';
  clampMenuPosition(menu, x, y);
}

export function ctxAction(action, id) {
  closeCtxMenu();
  const c = getContact(id);
  if (!c) return;

  if (action === 'aktion') {
    if (typeof window.openAktionPop === 'function') window.openAktionPop(id);
    return;
  }
  if (action === 'mail') {
    if (!c.email) { toast('Keine Email-Adresse.'); return; }
    if (typeof window.openMailCompose === 'function') window.openMailCompose(id, 'ai');
    return;
  }
  if (action === 'cal-demo') {
    if (typeof window.openCalPop === 'function') window.openCalPop(id, 'demo');
    return;
  }
  if (action === 'cal-rueckruf') {
    if (typeof window.openCalPop === 'function') window.openCalPop(id, 'rueckruf');
    return;
  }
  if (action === 'del') {
    if (typeof window.del === 'function') window.del(id);
    return;
  }
  if (action === 'open') {
    if (typeof window.openP === 'function') window.openP(id);
    return;
  }
  if (action === 'qn') {
    if (typeof window.openQN === 'function') window.openQN(id);
    return;
  }
  if (action === 'call' && c.telefon) {
    window.location.href = 'tel:' + c.telefon;
    return;
  }
  if (action === 'web' && c.website) {
    window.open(c.website, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action === 'edit') {
    if (typeof window.openE === 'function') window.openE(id);
  }
}

let _ctxMenuBound = false;

export function initContextMenu() {
  if (_ctxMenuBound) return;
  _ctxMenuBound = true;

  // Capture-Phase: vor Browser-Kontextmenü, auch wenn Kind-Elemente den Event nutzen
  document.addEventListener('contextmenu', function(e) {
    const page = document.getElementById('page-prospecting');
    if (!page || !page.classList.contains('active')) return;

    const row = e.target.closest('#tbody tr[data-id]');
    const card = e.target.closest('#page-prospecting .mc[data-id]');
    const el = row || card;
    if (!el || !el.dataset.id) return;

    e.preventDefault();
    e.stopPropagation();
    showCtxMenu(e.clientX, e.clientY, el.dataset.id);
  }, true);

  document.addEventListener('click', function(e) {
    if (e.target.closest('#ctxMenu')) return;
    closeCtxMenu();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeCtxMenu();
  });
  window.addEventListener('scroll', closeCtxMenu, true);
}
