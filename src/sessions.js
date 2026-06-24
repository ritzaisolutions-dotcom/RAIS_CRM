import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { toast } from './ui.js';
import { navigateTo } from './sidebar.js';
import { applyColPreset } from './prospecting.js';
import { STATUS } from './state.js';
import { weekStart } from './analytics.js';

// --- STATE ---
let activeSession = null;  // { id, startedTs, pausedAt, pausedSeconds, timerMode, targetSeconds, breakdown, leadsPlayed, aktionLeads }
let timerInterval = null;
let _sessionsContainer = null;
let _celebrationAktionLeads = null;

const SESSION_KEY = 'rais_active_session';

const STATUS_GROUPS = {
  positive: ['gewonnen', 'demo_termin', 'door_open', 'interessiert'],
  pre_removed: ['nicht_passend'],
  negative: ['disqualified', 'archiviert', 'ghost'],
  neutral:  ['kein_anschluss', 'kein_anschluss_2', 'gatekeeper', 'callback', 'no_show', 'email_nurture'],
};

function statusColor(s) {
  if (STATUS_GROUPS.positive.includes(s)) return 'var(--sg)';
  if (STATUS_GROUPS.pre_removed.includes(s)) return 'var(--st)';
  if (STATUS_GROUPS.negative.includes(s)) return 'var(--rd)';
  return 'var(--yw)';
}

function statusLabel(s) {
  return (STATUS[s] && STATUS[s].label) || String(s || '').replace(/_/g, ' ');
}

function elapsedSeconds() {
  if (!activeSession) return 0;
  const base = Math.floor((Date.now() - activeSession.startedTs) / 1000) - activeSession.pausedSeconds;
  const pauseExtra = activeSession.pausedAt ? Math.floor((Date.now() - activeSession.pausedAt) / 1000) : 0;
  return base - pauseExtra;
}

function fmtTime(secs) {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return (h ? String(h).padStart(2,'0') + ':' : '') +
    String(m).padStart(2,'0') + ':' + String(sc).padStart(2,'0');
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// --- LOCALSTORAGE PERSISTENCE ---

function _saveSession() {
  if (activeSession) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function _restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.id) return;
    // If it was running when the page reloaded, treat as paused so elapsed time freezes correctly
    if (!s.pausedAt) s.pausedAt = Date.now();
    if (!Array.isArray(s.aktionLeads)) s.aktionLeads = [];
    activeSession = s;
    renderWidget();
    toast('Session wiederhergestellt — ▶ Fortsetzen um weiterzumachen.');
  } catch(e) {
    localStorage.removeItem(SESSION_KEY);
  }
}

// --- HEADER WIDGET RENDER ---

function renderWidget() {
  // Toggle body class so CSS can style prospecting page indicator
  document.body.classList.toggle('session-active', !!activeSession);

  const widget = document.getElementById('sph-widget');
  if (!widget) return;

  if (!activeSession) {
    widget.hidden = true;
    return;
  }

  widget.hidden = false;
  const elapsed = elapsedSeconds();
  const isPaused = !!activeSession.pausedAt;

  widget.classList.toggle('sph-paused', isPaused);
  const dot = document.getElementById('sph-dot');
  if (dot) dot.classList.toggle('paused', isPaused);

  const timerEl = document.getElementById('sph-timer');
  if (timerEl) {
    timerEl.textContent = activeSession.timerMode === 'countdown'
      ? fmtTime(Math.max(0, activeSession.targetSeconds - elapsed))
      : fmtTime(elapsed);
  }
  const openAktion = getOpenAktionLeads().length;
  setText('sph-count', '· ' + activeSession.leadsPlayed + ' Leads' + (openAktion ? ' · ⚡' + openAktion : ''));

  const pauseBtn = document.getElementById('sph-pause-btn');
  const resumeBtn = document.getElementById('sph-resume-btn');
  if (pauseBtn) pauseBtn.hidden = isPaused;
  if (resumeBtn) resumeBtn.hidden = !isPaused;

  // Also tick the sessions-page live timer if it's open
  const pageTimer = document.getElementById('sp-page-timer');
  if (pageTimer) {
    pageTimer.textContent = activeSession.timerMode === 'countdown'
      ? fmtTime(Math.max(0, activeSession.targetSeconds - elapsed))
      : fmtTime(elapsed);
  }

  // Countdown auto-pause
  if (activeSession.timerMode === 'countdown' && !isPaused && elapsed >= activeSession.targetSeconds) {
    pauseSession();
    toast('⏱ Countdown abgelaufen — Session pausiert.');
  }
}

// Update only the active card state on the sessions page (no Supabase fetch)
function renderActiveCardState() {
  if (!activeSession) return;
  const isPaused = !!activeSession.pausedAt;
  const badge = document.querySelector('.sp-active-card .sp-badge');
  if (badge) {
    badge.className = 'sp-badge ' + (isPaused ? 'paused' : 'running');
    badge.textContent = isPaused ? '⏸ Pausiert' : '▶ Läuft';
  }
  const pauseBtn = document.getElementById('sp-page-pause-btn');
  const resumeBtn = document.getElementById('sp-page-resume-btn');
  if (pauseBtn) pauseBtn.hidden = isPaused;
  if (resumeBtn) resumeBtn.hidden = !isPaused;
}

function _refreshSessionsPage() {
  if (_sessionsContainer) initSessionsPage(_sessionsContainer);
}

// --- SESSION LIFECYCLE ---

export async function startSession(config) {
  const timerMode = config.timerMode || 'free';
  const targetSeconds = config.targetSeconds || null;
  try {
    await sbUpsert('/rest/v1/crm_sessions', [{
      timer_mode: timerMode,
      timer_target_seconds: targetSeconds,
      is_active: true,
      is_paused: false,
    }]);
    const recent = await sbGet('/rest/v1/crm_sessions?is_active=eq.true&order=created_at.desc&limit=1');
    const id = recent && recent[0] ? recent[0].id : null;
    activeSession = {
      id: id,
      startedTs: Date.now(),
      pausedAt: null,
      pausedSeconds: 0,
      timerMode: timerMode,
      targetSeconds: targetSeconds,
      breakdown: {},
      leadsPlayed: 0,
      aktionLeads: [],
    };
    _saveSession();
    timerInterval = setInterval(renderWidget, 1000);
    renderWidget();
    toast('▶ Session gestartet.');
    
    // Automatischer Fokus-Preset: Zu kompaktem 'Telefonier'-Preset wechseln (kognitiver Ballast reduzieren)
    try {
      applyColPreset('calling', true);
      toast('▶ Session gestartet. "Telefonieren" Spalten-Preset automatisch aktiviert!');
    } catch(e) {
      console.warn('Could not apply calling preset automatically:', e);
    }
  } catch(e) {
    toast('Session-Fehler: ' + e.message);
  }
}

export function pauseSession() {
  if (!activeSession || activeSession.pausedAt) return;
  activeSession.pausedAt = Date.now();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  _saveSession();
  sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [{ id: activeSession.id, is_paused: true }]);
  renderWidget();
  renderActiveCardState();
}

export function resumeSession() {
  if (!activeSession || !activeSession.pausedAt) return;
  activeSession.pausedSeconds += Math.floor((Date.now() - activeSession.pausedAt) / 1000);
  activeSession.pausedAt = null;
  _saveSession();
  timerInterval = setInterval(renderWidget, 1000);
  sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [{ id: activeSession.id, is_paused: false }]);
  renderWidget();
  renderActiveCardState();
}

export async function endSession(name) {
  if (!activeSession) return;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const elapsed = elapsedSeconds();
  const leads = activeSession.leadsPlayed;
  const bd = activeSession.breakdown;
  const aktionLeads = activeSession.aktionLeads || [];
  const payload = {
    id: activeSession.id,
    is_active: false,
    is_paused: false,
    ended_at: new Date().toISOString(),
    duration_seconds: elapsed,
    leads_played: leads,
    status_breakdown: bd,
    name: name || null,
    action_items: aktionLeads,
  };
  try {
    try {
      await sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [payload]);
    } catch (e) {
      const msg = String(e.message || '');
      if (msg.includes('action_items') || msg.includes('column')) {
        delete payload.action_items;
        await sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [payload]);
        console.warn('action_items column missing — session saved without queue history');
      } else throw e;
    }
    showCelebrationModal(elapsed, leads, bd, name, aktionLeads);
  } catch(e) {
    toast('Fehler beim Speichern: ' + e.message);
  }
  activeSession = null;
  _saveSession();
  renderWidget();
  _refreshSessionsPage();
  if (typeof window.render === 'function') window.render();
}

function showCelebrationModal(elapsed, leads, breakdown, name, aktionLeads) {
  _celebrationAktionLeads = (aktionLeads || []).map(function(x) {
    return Object.assign({}, x);
  });
  const pop = document.getElementById('sessionCelebrationPop');
  if (!pop) return;
  
  const headlineEl = document.getElementById('sc-headline');
  const textEl = document.getElementById('sc-text');
  const durEl = document.getElementById('sc-duration');
  const leadsEl = document.getElementById('sc-leads');
  const breakdownEl = document.getElementById('sc-breakdown');
  const queueHost = document.getElementById('sc-aktion-queue');
  
  durEl.textContent = fmtTime(elapsed);
  leadsEl.textContent = leads;
  
  // Dynamische Motivationstexte basierend auf der Leistung (Gamification)
  if (leads === 0) {
    headlineEl.textContent = 'Session beendet!';
    textEl.textContent = 'Jeder Schritt zählt. Auch ohne Anruf hast du wertvolle Vorbereitung geleistet!';
  } else if (leads < 5) {
    headlineEl.textContent = 'Guter Start!';
    textEl.textContent = 'Du hast den Anfang gemacht. Dranbleiben sichert den langfristigen Erfolg!';
  } else if (leads < 12) {
    headlineEl.textContent = 'Starke Leistung!';
    textEl.textContent = 'Ein produktiver Calling-Block! Dein Fleiß füllt die Pipeline.';
  } else {
    headlineEl.textContent = 'Absolute Spitzenklasse! 🚀';
    textEl.textContent = 'Hervorragender Rhythmus und fantastische Ausdauer! Du bist unaufhaltbar!';
  }
  
  // Breakdown-Pills rendern
  const bdKeys = Object.keys(breakdown).filter(function(k) { return breakdown[k] > 0; });
  if (bdKeys.length > 0) {
    breakdownEl.innerHTML = bdKeys.map(function(k) {
      const col = statusColor(k);
      return '<span class="badge" style="background-color:rgba(120,110,100,0.06); color:' + col + '; border:1px solid ' + col + '; font-size:10px; margin:2px">' +
        statusLabel(k) + ': ' + breakdown[k] +
      '</span>';
    }).join('');
  } else {
    breakdownEl.innerHTML = '<span style="font-family:sans-serif; font-size:11px; color:var(--st); font-style:italic">Keine Statusänderungen aufgezeichnet.</span>';
  }

  if (queueHost) {
    renderAktionQueueHtml(queueHost, aktionLeads || [], { collapsible: true, defaultOpen: true });
  }

  const openCnt = (aktionLeads || []).filter(function(x) { return !x.done; }).length;
  if (openCnt > 0) {
    textEl.textContent = (textEl.textContent || '') + ' Noch ' + openCnt + ' Lead(s) mit offener Aktion.';
  }
  
  pop.classList.add('on');
}

export function getOpenAktionLeads() {
  if (!activeSession || !Array.isArray(activeSession.aktionLeads)) return [];
  return activeSession.aktionLeads.filter(function(x) { return !x.done; });
}

export function upsertAktionLead(contactId, contactName, aktionNotiz) {
  if (!activeSession) return;
  if (!Array.isArray(activeSession.aktionLeads)) activeSession.aktionLeads = [];
  const id = String(contactId);
  let entry = activeSession.aktionLeads.find(function(x) { return x.contact_id === id; });
  if (entry) {
    entry.contact_name = contactName || entry.contact_name;
    entry.aktion_notiz = aktionNotiz;
    entry.done = false;
  } else {
    activeSession.aktionLeads.push({
      contact_id: id,
      contact_name: contactName || '',
      aktion_notiz: aktionNotiz,
      done: false,
      marked_at: new Date().toISOString(),
    });
  }
  _saveSession();
  renderWidget();
  renderAktionQueueBar();
}

export function removeAktionLead(contactId) {
  if (!activeSession || !Array.isArray(activeSession.aktionLeads)) return;
  const id = String(contactId);
  activeSession.aktionLeads = activeSession.aktionLeads.filter(function(x) { return x.contact_id !== id; });
  _saveSession();
  renderWidget();
  renderAktionQueueBar();
}

function renderAktionQueueHtml(hostEl, items, opts) {
  if (!hostEl) return;
  const open = (items || []).filter(function(x) { return !x.done; });
  const done = (items || []).filter(function(x) { return x.done; });
  if (!open.length && !done.length) {
    hostEl.innerHTML = '';
    hostEl.hidden = true;
    return;
  }
  hostEl.hidden = false;
  const esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  };
  let inner = '';
  if (open.length) {
    inner += open.map(function(item) {
      return '<label class="sc-aktion-row">' +
        '<input type="checkbox" onchange="checkAktionItem(\'' + esc(item.contact_id) + '\')">' +
        '<span class="sc-aktion-body">' +
          '<span class="sc-aktion-firma" onclick="event.preventDefault();openP(\'' + esc(item.contact_id) + '\')">' + esc(item.contact_name) + '</span>' +
          (item.aktion_notiz ? '<span class="sc-aktion-notiz">' + esc(item.aktion_notiz) + '</span>' : '') +
        '</span></label>';
    }).join('');
  } else {
    inner += '<p class="sc-aktion-done-msg">Alle Aktionen erledigt.</p>';
  }
  if (done.length) {
    inner += '<details class="sc-aktion-done-details"><summary>Erledigt (' + done.length + ')</summary>' +
      done.map(function(item) {
        return '<div class="sc-aktion-row sc-aktion-row-done"><span>' + esc(item.contact_name) + '</span></div>';
      }).join('') + '</details>';
  }
  if (opts && opts.collapsible) {
    hostEl.innerHTML = '<details class="sc-aktion-details"' + (opts.defaultOpen && open.length ? ' open' : '') + '>' +
      '<summary class="sc-aktion-summary">Noch Aktion nötig (' + open.length + ')</summary>' +
      '<div class="sc-aktion-list">' + inner + '</div></details>';
  } else {
    hostEl.innerHTML = '<div class="sc-aktion-list">' + inner + '</div>';
  }
}

export function renderAktionQueueBar() {
  const bar = document.getElementById('aktion-queue-bar');
  if (!bar) return;
  if (!activeSession) {
    bar.innerHTML = '';
    bar.hidden = true;
    return;
  }
  renderAktionQueueHtml(bar, activeSession.aktionLeads || [], { collapsible: true, defaultOpen: true });
}

export function completeAktionItem(contactId) {
  const id = String(contactId);
  [activeSession && activeSession.aktionLeads, _celebrationAktionLeads].forEach(function(arr) {
    if (!arr) return;
    const entry = arr.find(function(x) { return x.contact_id === id; });
    if (entry) entry.done = true;
  });
  if (activeSession) _saveSession();
  refreshAktionQueueUIs();
}

export function refreshAktionQueueUIs() {
  renderAktionQueueBar();
  const host = document.getElementById('sc-aktion-queue');
  if (host && _celebrationAktionLeads) {
    renderAktionQueueHtml(host, _celebrationAktionLeads, { collapsible: true, defaultOpen: true });
  }
}

export function clearCelebrationAktionQueue() {
  _celebrationAktionLeads = null;
}

export async function discardSession() {
  if (!activeSession) return;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const id = activeSession.id;
  activeSession = null;
  _saveSession();
  renderWidget();
  try {
    await sbDelete('/rest/v1/crm_sessions?id=eq.' + id);
    toast('Session verworfen.');
  } catch(e) {
    toast('Fehler beim Verwerfen: ' + e.message);
  }
  _refreshSessionsPage();
}

export function onStatusChanged(contactId, contactName, fromStatus, toStatus) {
  if (!activeSession) return;
  if (toStatus === 'neu') return;
  activeSession.leadsPlayed += 1;
  activeSession.breakdown[toStatus] = (activeSession.breakdown[toStatus] || 0) + 1;
  _saveSession();
  sbUpsert('/rest/v1/crm_session_events', [{
    session_id: activeSession.id,
    contact_id: String(contactId),
    contact_name: contactName || null,
    status_from: fromStatus || null,
    status_to: toStatus,
  }]);
  renderWidget();
}

export function onOutreachRecorded(contactId, contactName, statusFrom, statusTo) {
  if (!activeSession) return;
  const key = statusTo || 'kein_anschluss_2';
  activeSession.leadsPlayed += 1;
  activeSession.breakdown[key] = (activeSession.breakdown[key] || 0) + 1;
  _saveSession();
  sbUpsert('/rest/v1/crm_session_events', [{
    session_id: activeSession.id,
    contact_id: String(contactId),
    contact_name: contactName || null,
    status_from: statusFrom || null,
    status_to: key,
  }]);
  renderWidget();
}

export function getActiveSession() { return activeSession; }

// --- HEADER WIDGET INIT ---

export function initHeaderWidget(containerEl) {
  containerEl.innerHTML =
    '<span class="sph-live-dot" id="sph-dot"></span>' +
    '<span id="sph-timer" class="sph-timer">00:00</span>' +
    '<span id="sph-count" class="sph-count"></span>' +
    '<button id="sph-pause-btn" class="btn bg bsm sph-btn" title="Pause">⏸</button>' +
    '<button id="sph-resume-btn" class="btn bg bsm sph-btn" title="Fortsetzen" hidden>▶</button>' +
    '<button id="sph-end-btn" class="btn bg bsm sph-btn" title="Beenden">⏹</button>';

  containerEl.querySelector('#sph-pause-btn').addEventListener('click', pauseSession);
  containerEl.querySelector('#sph-resume-btn').addEventListener('click', resumeSession);
  containerEl.querySelector('#sph-end-btn').addEventListener('click', function() {
    navigateTo('sessions');
  });

  _restoreSession();
}

// --- SESSIONS PAGE ---

export async function initSessionsPage(containerEl) {
  _sessionsContainer = containerEl;

  let topHtml = '';
  if (activeSession) {
    const elapsed = elapsedSeconds();
    const isPaused = !!activeSession.pausedAt;
    topHtml =
      '<div class="session-panel sp-active-card">' +
        '<div class="sp-active-head">' +
          '<span class="sp-badge ' + (isPaused ? 'paused' : 'running') + '">' + (isPaused ? '⏸ Pausiert' : '▶ Läuft') + '</span>' +
          '<span id="sp-page-timer" class="sp-timer">' + fmtTime(elapsed) + '</span>' +
          '<span class="sp-count">📞 <strong>' + activeSession.leadsPlayed + '</strong> gespielt</span>' +
        '</div>' +
        '<div class="sp-active-actions">' +
          '<button id="sp-page-pause-btn" class="btn bs bsm"' + (isPaused ? ' hidden' : '') + '>⏸ Pause</button>' +
          '<button id="sp-page-resume-btn" class="btn bp bsm"' + (!isPaused ? ' hidden' : '') + '>▶ Fortsetzen</button>' +
          '<button id="sp-page-end-btn" class="btn bs bsm">⏹ Beenden</button>' +
        '</div>' +
        '<div id="sp-page-save-row" class="sp-save-row" hidden>' +
          '<span style="font-family:sans-serif;font-size:13px;color:var(--st)">Speichern als:</span>' +
          '<input type="text" id="sp-page-name-input" placeholder="Session Name (optional)">' +
          '<button id="sp-page-save-btn" class="btn bp bsm">Speichern</button>' +
          '<button id="sp-page-save-noname-btn" class="btn bs bsm">Ohne Name</button>' +
          '<button id="sp-page-discard-btn" class="btn bs bsm" style="color:var(--rd)">Verwerfen</button>' +
        '</div>' +
      '</div>';
  } else {
    topHtml =
      '<div class="session-panel" id="sp-start-form">' +
        '<div class="sp-config">' +
          '<label class="sp-radio"><input type="radio" name="sp-mode" value="free" checked> Frei</label>' +
          '<label class="sp-radio"><input type="radio" name="sp-mode" value="countdown"> Countdown: ' +
            '<input type="number" id="sp-countdown-min" value="90" min="1" max="480" style="width:52px"> min</label>' +
        '</div>' +
        '<button id="sp-start-btn" class="btn bp bsm">▶ Session starten</button>' +
      '</div>';
  }

  containerEl.innerHTML =
    '<main style="padding:28px">' +
    topHtml +
    '<h2 style="font-size:20px;font-weight:700;color:var(--ch);margin:20px 0 16px">🏁 Sessions</h2>' +
    '<div id="sp-history-body"><div style="font-family:sans-serif;font-size:13px;color:var(--st)">Wird geladen…</div></div>' +
    '</main>';

  if (activeSession) {
    const pauseBtn = containerEl.querySelector('#sp-page-pause-btn');
    const resumeBtn = containerEl.querySelector('#sp-page-resume-btn');
    const endBtn = containerEl.querySelector('#sp-page-end-btn');
    const saveRow = containerEl.querySelector('#sp-page-save-row');

    if (pauseBtn) pauseBtn.addEventListener('click', pauseSession);
    if (resumeBtn) resumeBtn.addEventListener('click', resumeSession);

    endBtn.addEventListener('click', function() {
      pauseSession();
      saveRow.hidden = false;
      const inp = containerEl.querySelector('#sp-page-name-input');
      if (inp) { inp.value = ''; inp.focus(); }
    });

    containerEl.querySelector('#sp-page-save-btn').addEventListener('click', function() {
      const name = (containerEl.querySelector('#sp-page-name-input').value || '').trim();
      endSession(name || null);
    });
    containerEl.querySelector('#sp-page-save-noname-btn').addEventListener('click', function() {
      endSession(null);
    });
    containerEl.querySelector('#sp-page-discard-btn').addEventListener('click', function() {
      discardSession();
    });
    const inp = containerEl.querySelector('#sp-page-name-input');
    if (inp) inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') containerEl.querySelector('#sp-page-save-btn').click();
      if (e.key === 'Escape') discardSession();
    });
  } else {
    containerEl.querySelector('#sp-start-btn').addEventListener('click', async function() {
      const mode = containerEl.querySelector('input[name="sp-mode"]:checked').value;
      const mins = parseInt(containerEl.querySelector('#sp-countdown-min').value) || 90;
      await startSession({ timerMode: mode, targetSeconds: mode === 'countdown' ? mins * 60 : null });
      _refreshSessionsPage();
    });
  }

  // Load history
  try {
    const rows = await sbGet('/rest/v1/crm_sessions?is_active=eq.false&order=started_at.desc&limit=20');
    const el = containerEl.querySelector('#sp-history-body');
    if (!rows || !rows.length) {
      el.innerHTML = '<div style="font-family:sans-serif;font-size:13px;color:var(--st)">Noch keine abgeschlossenen Sessions.</div>';
      return;
    }
    el.innerHTML = rows.map(function(s) { return renderSessionCard(s); }).join('');
    el.querySelectorAll('.sp-rename-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { startRename(btn.dataset.id, el); });
    });
    el.querySelectorAll('.sp-events-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { toggleSessionEvents(btn.dataset.id, btn); });
    });
  } catch(e) {
    const el = containerEl.querySelector('#sp-history-body');
    if (el) el.innerHTML = '<div style="font-family:sans-serif;font-size:13px;color:var(--rd)">Fehler: ' + e.message + '</div>';
  }
}

function renderSessionCard(s) {
  const start = s.started_at ? new Date(s.started_at) : null;
  const end   = s.ended_at   ? new Date(s.ended_at)   : null;
  const dateStr = start ? start.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
  const timeStr = start ? start.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
  const endStr  = end   ? end.toLocaleTimeString('de-DE',   { hour:'2-digit', minute:'2-digit' }) : '';
  const dur = s.duration_seconds ? fmtTime(s.duration_seconds) : '—';
  const bd  = s.status_breakdown || {};
  const total = Object.values(bd).reduce(function(a, b) { return a + b; }, 0);

  const barsHtml = Object.keys(bd).filter(function(k) { return bd[k] > 0; }).sort(function(a,b) { return bd[b]-bd[a]; }).map(function(k) {
    const pct = total ? Math.round((bd[k] / total) * 100) : 0;
    const col = statusColor(k);
    return '<div class="sbr">' +
      '<span class="sbr-label">' + statusLabel(k) + '</span>' +
      '<div class="sbr-bar-wrap"><div class="sbr-bar" style="width:' + pct + '%;background:' + col + '"></div></div>' +
      '<span class="sbr-count">' + bd[k] + '</span>' +
      '<span class="sbr-pct">' + pct + '%</span>' +
    '</div>';
  }).join('');

  return '<div class="sp-card">' +
    '<div class="sp-card-head">' +
      '<div>' +
        '<div class="sp-card-date">📅 ' + dateStr + (timeStr ? ' · ' + timeStr + (endStr ? '–' + endStr : '') : '') + (dur !== '—' ? ' · ' + dur : '') + '</div>' +
        '<div class="sp-card-name" id="sp-name-' + s.id + '" data-name="' + (s.name || '') + '">' + (s.name ? '"' + s.name + '"' : '<span style="color:var(--st);font-style:italic">Unbenannt</span>') + '</div>' +
      '</div>' +
      '<button class="btn bg bsm sp-rename-btn" data-id="' + s.id + '" title="Umbenennen">✏</button>' +
    '</div>' +
    '<div class="sp-card-meta">📞 ' + (s.leads_played || 0) + ' Leads gespielt</div>' +
    (barsHtml ? '<div class="sp-bars">' + barsHtml + '</div>' : '') +
    (s.leads_played > 0 ? '<button class="btn bg bsm sp-events-btn" data-id="' + s.id + '" style="margin-top:8px;font-size:11px">Details ▸</button><div class="sp-events" id="sp-events-' + s.id + '" hidden></div>' : '') +
  '</div>';
}

async function toggleSessionEvents(sessionId, btn) {
  const container = document.getElementById('sp-events-' + sessionId);
  if (!container) return;
  if (!container.hidden) {
    container.hidden = true;
    btn.textContent = 'Details ▸';
    return;
  }
  container.hidden = false;
  btn.textContent = 'Details ▾';
  if (container.dataset.loaded) return;
  container.innerHTML = '<div class="sp-event-row" style="color:var(--st)">Lädt…</div>';
  try {
    const events = await sbGet('/rest/v1/crm_session_events?session_id=eq.' + sessionId + '&order=changed_at.asc');
    container.dataset.loaded = '1';
    if (!events || !events.length) {
      container.innerHTML = '<div class="sp-event-row" style="color:var(--st)">Keine Events.</div>';
      return;
    }
    container.innerHTML = events.map(function(ev) {
      const t = ev.changed_at ? new Date(ev.changed_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
      const col = statusColor(ev.status_to);
      return '<div class="sp-event-row">' +
        '<span class="sp-event-time">' + t + '</span>' +
        '<span class="sp-event-name">' + (ev.contact_name || '—') + '</span>' +
        '<span class="sp-event-arrow">→</span>' +
        '<span class="sp-event-status" style="color:' + col + '">' + statusLabel(ev.status_to) + '</span>' +
      '</div>';
    }).join('');
  } catch(e) {
    container.innerHTML = '<div class="sp-event-row" style="color:var(--rd)">Fehler: ' + e.message + '</div>';
  }
}

function startRename(sessionId, containerEl) {
  const nameEl = containerEl.querySelector('#sp-name-' + sessionId);
  if (!nameEl) return;
  const current = nameEl.dataset.name || '';
  nameEl.innerHTML = '<input type="text" class="sp-rename-input" value="' + current + '" placeholder="Session Name">';
  const inp = nameEl.querySelector('input');
  inp.focus(); inp.select();
  async function save() {
    const val = inp.value.trim();
    try {
      await sbUpsert('/rest/v1/crm_sessions?id=eq.' + sessionId, [{ id: parseInt(sessionId), name: val || null }]);
      nameEl.dataset.name = val;
      nameEl.innerHTML = val ? '"' + val + '"' : '<span style="color:var(--st);font-style:italic">Unbenannt</span>';
    } catch(e) {
      toast('Umbenennen fehlgeschlagen: ' + e.message);
      nameEl.innerHTML = val ? '"' + val + '"' : '<span style="color:var(--st);font-style:italic">Unbenannt</span>';
    }
  }
  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') {
      nameEl.innerHTML = current ? '"' + current + '"' : '<span style="color:var(--st);font-style:italic">Unbenannt</span>';
    }
  });
}

export async function getSessionStats(period) {
  try {
    const start = weekStart(new Date());
    if (period === 'prev_week') {
      start.setDate(start.getDate() - 7);
    }
    const rows = await sbGet('/rest/v1/crm_sessions?is_active=eq.false&started_at=gte.' + start.toISOString() + '&select=leads_played,duration_seconds');
    let totalLeads = 0;
    let totalMinutes = 0;
    (rows || []).forEach(function(r) {
      totalLeads += r.leads_played || 0;
      totalMinutes += (r.duration_seconds || 0) / 60;
    });
    return { count: (rows || []).length, totalLeads: totalLeads, totalMinutes: totalMinutes };
  } catch (e) {
    return { count: 0, totalLeads: 0, totalMinutes: 0 };
  }
}
