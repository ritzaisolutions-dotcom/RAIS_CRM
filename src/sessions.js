import { sbGet, sbUpsert } from './supabase.js';
import { toast } from './ui.js';

// --- STATE ---
// Lives in memory only. Reload ends the session implicitly.
let activeSession = null;  // { id, startedTs, pausedAt, pausedSeconds, timerMode, targetSeconds, breakdown, leadsPlayed }
let timerInterval = null;

const STATUS_GROUPS = {
  positive: ['gewonnen', 'demo_termin', 'door_open', 'interessiert'],
  negative: ['disqualified', 'archiviert'],
  neutral:  ['kein_anschluss', 'gatekeeper', 'callback', 'no_show', 'email_nurture'],
};

function statusColor(s) {
  if (STATUS_GROUPS.positive.includes(s)) return 'var(--sg)';
  if (STATUS_GROUPS.negative.includes(s)) return 'var(--rd)';
  return 'var(--yw)';
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

// --- PANEL DOM HELPERS ---

function panelEl(id) { return document.getElementById(id); }

function setHidden(id, hidden) {
  const el = panelEl(id);
  if (el) el.hidden = hidden;
}

function setText(id, txt) {
  const el = panelEl(id);
  if (el) el.textContent = txt;
}

function renderBreakdown(elId) {
  const el = panelEl(elId);
  if (!el || !activeSession) return;
  const bd = activeSession.breakdown;
  const keys = Object.keys(bd).filter(function(k) { return bd[k] > 0; });
  if (!keys.length) { el.innerHTML = ''; return; }
  el.innerHTML = keys.map(function(k) {
    return '<span class="sp-badge" style="background:' + statusColor(k) + '20;color:' + statusColor(k) + ';border:1px solid ' + statusColor(k) + '40">' +
      k.replace(/_/g,' ') + ': <strong>' + bd[k] + '</strong></span>';
  }).join('');
}

function renderPanel() {
  if (!activeSession) {
    setHidden('sp-idle', false);
    setHidden('sp-running', true);
    setHidden('sp-paused', true);
    setHidden('sp-save-row', true);
    return;
  }
  const elapsed = elapsedSeconds();
  if (activeSession.pausedAt) {
    setHidden('sp-idle', true);
    setHidden('sp-running', true);
    setHidden('sp-paused', false);
    setText('sp-timer-paused', fmtTime(elapsed) + ' ⏸');
    setText('sp-lead-count-p', activeSession.leadsPlayed);
    renderBreakdown('sp-breakdown-paused');
  } else {
    setHidden('sp-idle', true);
    setHidden('sp-running', false);
    setHidden('sp-paused', true);
    if (activeSession.timerMode === 'countdown') {
      const remaining = activeSession.targetSeconds - elapsed;
      setText('sp-timer', fmtTime(remaining));
      const pct = Math.min(100, Math.round((elapsed / activeSession.targetSeconds) * 100));
      const bar = panelEl('sp-progress-bar');
      if (bar) bar.style.width = pct + '%';
      setHidden('sp-progress-wrap', false);
      if (remaining <= 0) {
        pauseSession();
        toast('⏱ Countdown abgelaufen — Session pausiert.');
        return;
      }
    } else {
      setText('sp-timer', fmtTime(elapsed));
      setHidden('sp-progress-wrap', true);
    }
    setText('sp-lead-count', activeSession.leadsPlayed);
    renderBreakdown('sp-breakdown');
  }
}

// --- SESSION LIFECYCLE ---

export async function startSession(config) {
  const timerMode = config.timerMode || 'free';
  const targetSeconds = config.targetSeconds || null;
  try {
    const rows = await sbUpsert('/rest/v1/crm_sessions', [{
      timer_mode: timerMode,
      timer_target_seconds: targetSeconds,
      is_active: true,
      is_paused: false,
    }]);
    // sbUpsert uses return=minimal, so fetch the new row
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
    };
    timerInterval = setInterval(renderPanel, 1000);
    renderPanel();
    toast('▶ Session gestartet.');
  } catch(e) {
    toast('Session-Fehler: ' + e.message);
  }
}

export function pauseSession() {
  if (!activeSession || activeSession.pausedAt) return;
  activeSession.pausedAt = Date.now();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [{ id: activeSession.id, is_paused: true }]);
  renderPanel();
}

export function resumeSession() {
  if (!activeSession || !activeSession.pausedAt) return;
  activeSession.pausedSeconds += Math.floor((Date.now() - activeSession.pausedAt) / 1000);
  activeSession.pausedAt = null;
  timerInterval = setInterval(renderPanel, 1000);
  sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [{ id: activeSession.id, is_paused: false }]);
  renderPanel();
}

export async function endSession(name) {
  if (!activeSession) return;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const elapsed = elapsedSeconds();
  try {
    await sbUpsert('/rest/v1/crm_sessions?id=eq.' + activeSession.id, [{
      id: activeSession.id,
      is_active: false,
      is_paused: false,
      ended_at: new Date().toISOString(),
      duration_seconds: elapsed,
      leads_played: activeSession.leadsPlayed,
      status_breakdown: activeSession.breakdown,
      name: name || null,
    }]);
    toast('✅ Session gespeichert' + (name ? ': ' + name : '') + '.');
  } catch(e) {
    toast('Fehler beim Speichern: ' + e.message);
  }
  activeSession = null;
  renderPanel();
}

export function onStatusChanged(contactId, contactName, fromStatus, toStatus) {
  if (!activeSession) return;
  if (toStatus === 'neu') return;
  activeSession.leadsPlayed += 1;
  activeSession.breakdown[toStatus] = (activeSession.breakdown[toStatus] || 0) + 1;
  sbUpsert('/rest/v1/crm_session_events', [{
    session_id: activeSession.id,
    contact_id: String(contactId),
    contact_name: contactName || null,
    status_from: fromStatus || null,
    status_to: toStatus,
  }]);
  renderPanel();
}

export function getActiveSession() { return activeSession; }

// --- SESSION PANEL INIT ---

export function initSessionPanel(containerEl) {
  containerEl.innerHTML =
    '<div id="session-panel" class="session-panel">' +

    '<div id="sp-idle">' +
      '<div class="sp-config">' +
        '<label class="sp-radio"><input type="radio" name="sp-mode" value="free" checked> Frei</label>' +
        '<label class="sp-radio"><input type="radio" name="sp-mode" value="countdown"> Countdown: ' +
          '<input type="number" id="sp-countdown-min" value="90" min="1" max="480" style="width:52px"> min</label>' +
      '</div>' +
      '<button id="sp-start-btn" class="btn bp bsm">▶ Session starten</button>' +
    '</div>' +

    '<div id="sp-running" hidden>' +
      '<div class="sp-row">' +
        '<span id="sp-timer" class="sp-timer">00:00</span>' +
        '<span class="sp-count">📞 <strong id="sp-lead-count">0</strong> gespielt</span>' +
        '<button id="sp-pause-btn" class="btn bs bsm">⏸ Pause</button>' +
        '<button id="sp-end-btn" class="btn bs bsm">⏹ Beenden</button>' +
      '</div>' +
      '<div id="sp-progress-wrap" hidden class="sp-progress-wrap"><div id="sp-progress-bar" class="sp-progress-bar"></div></div>' +
      '<div id="sp-breakdown" class="sp-breakdown"></div>' +
    '</div>' +

    '<div id="sp-paused" hidden>' +
      '<div class="sp-row">' +
        '<span id="sp-timer-paused" class="sp-timer sp-timer--paused">00:00 ⏸</span>' +
        '<span class="sp-count">📞 <strong id="sp-lead-count-p">0</strong> gespielt</span>' +
        '<button id="sp-resume-btn" class="btn bp bsm">▶ Fortsetzen</button>' +
        '<button id="sp-end-btn-paused" class="btn bs bsm">⏹ Beenden</button>' +
      '</div>' +
      '<div id="sp-breakdown-paused" class="sp-breakdown"></div>' +
    '</div>' +

    '<div id="sp-save-row" class="sp-save-row" hidden>' +
      '<span style="font-family:sans-serif;font-size:13px;color:var(--st)">Speichern als:</span>' +
      '<input type="text" id="sp-name-input" class="sp-name-input" placeholder="Session Name (optional)">' +
      '<button id="sp-save-btn" class="btn bp bsm">Speichern</button>' +
      '<button id="sp-save-noname-btn" class="btn bs bsm">Ohne Name</button>' +
    '</div>' +

    '</div>';

  containerEl.querySelector('#sp-start-btn').addEventListener('click', function() {
    const mode = containerEl.querySelector('input[name="sp-mode"]:checked').value;
    const mins = parseInt(containerEl.querySelector('#sp-countdown-min').value) || 90;
    startSession({ timerMode: mode, targetSeconds: mode === 'countdown' ? mins * 60 : null });
  });

  containerEl.querySelector('#sp-pause-btn').addEventListener('click', pauseSession);
  containerEl.querySelector('#sp-resume-btn').addEventListener('click', resumeSession);

  function showSaveRow() {
    pauseSession();
    setHidden('sp-running', true);
    setHidden('sp-paused', true);
    setHidden('sp-save-row', false);
    const inp = panelEl('sp-name-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  containerEl.querySelector('#sp-end-btn').addEventListener('click', showSaveRow);
  containerEl.querySelector('#sp-end-btn-paused').addEventListener('click', showSaveRow);

  containerEl.querySelector('#sp-save-btn').addEventListener('click', function() {
    const name = (panelEl('sp-name-input').value || '').trim();
    endSession(name || null);
    setHidden('sp-save-row', true);
  });

  containerEl.querySelector('#sp-save-noname-btn').addEventListener('click', function() {
    endSession(null);
    setHidden('sp-save-row', true);
  });

  containerEl.querySelector('#sp-name-input') && containerEl.querySelector('#sp-name-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') containerEl.querySelector('#sp-save-btn').click();
    if (e.key === 'Escape') { endSession(null); setHidden('sp-save-row', true); }
  });
}

// --- SESSIONS HISTORY PAGE ---

export async function initSessionsPage(containerEl) {
  containerEl.innerHTML =
    '<main style="padding:24px 28px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
      '<h2 style="font-size:20px;font-weight:700;color:var(--ch);margin:0">🏁 Sessions</h2>' +
      '<button id="sp-new-session-btn" class="btn bp bsm">▶ Neue Session →</button>' +
    '</div>' +
    '<div id="sp-history-body"><div style="font-family:sans-serif;font-size:13px;color:var(--st)">Wird geladen…</div></div>' +
    '</main>';

  containerEl.querySelector('#sp-new-session-btn').addEventListener('click', function() {
    if (typeof navigateTo === 'function') navigateTo('prospecting');
    else window.dispatchEvent(new CustomEvent('rais:page-change', { detail: { page: 'prospecting' } }));
  });

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
  } catch(e) {
    containerEl.querySelector('#sp-history-body').innerHTML =
      '<div style="font-family:sans-serif;font-size:13px;color:var(--rd)">Fehler: ' + e.message + '</div>';
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
      '<span class="sbr-label">' + k.replace(/_/g,' ') + '</span>' +
      '<div class="sbr-bar-wrap"><div class="sbr-bar" style="width:' + pct + '%;background:' + col + '"></div></div>' +
      '<span class="sbr-count">' + bd[k] + '</span>' +
      '<span class="sbr-pct">' + pct + '%</span>' +
    '</div>';
  }).join('');

  return '<div class="sp-card">' +
    '<div class="sp-card-head">' +
      '<div>' +
        '<div class="sp-card-date">📅 ' + dateStr + (timeStr ? ' · ' + timeStr + (endStr ? '–' + endStr : '') : '') + (dur !== '—' ? ' · ' + dur : '') + '</div>' +
        '<div class="sp-card-name" id="sp-name-' + s.id + '">' + (s.name ? '"' + s.name + '"' : '<span style="color:var(--st);font-style:italic">Unbenannt</span>') + '</div>' +
      '</div>' +
      '<button class="btn bg bsm sp-rename-btn" data-id="' + s.id + '" title="Umbenennen">✏</button>' +
    '</div>' +
    '<div class="sp-card-meta">📞 ' + (s.leads_played || 0) + ' Leads gespielt</div>' +
    (barsHtml ? '<div class="sp-bars">' + barsHtml + '</div>' : '') +
  '</div>';
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
