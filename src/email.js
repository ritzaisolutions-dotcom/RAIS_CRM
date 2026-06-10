import { S } from './state.js';
import { markDirty, persist, pushDirty, syncCloud } from './sync.js';
import { esc, toast } from './ui.js';
import { td } from './utils.js';
import { openP } from './prospecting.js';
import { whFetch } from './wh.js';

const MAIL_ANLASS = [
  { value: 'nach_call', label: 'Nach Telefonat / Rückruf' },
  { value: 'einwand_zu_teuer', label: 'Einwand: zu teuer' },
  { value: 'einwand_kein_bedarf', label: 'Einwand: kein Bedarf' },
  { value: 'einwand_schon_anbieter', label: 'Einwand: schon Anbieter' },
  { value: 'einwand_kein_zeitpunkt', label: 'Einwand: kein Zeitpunkt' },
  { value: 'demo_nachbereitung', label: 'Demo-Nachbereitung' },
  { value: 'erstkontakt', label: 'Erstkontakt / Website-Hinweis' },
  { value: 'sonstiges', label: 'Sonstiges (Notiz verwenden)' },
];

const OUTLINE_BODY =
  'Sehr geehrte Damen und Herren,\n\n' +
  '[Bezug: Gespräch / Einwand kurz ansprechen]\n\n' +
  '[Nutzen / Lösung in 2–3 Sätzen]\n\n' +
  '[Konkreter nächster Schritt — z. B. Rückruf, Termin, Demo]\n\n' +
  'Mit freundlichen Grüßen\nKevin Ritz\nkevin@ritz-ai.solutions';

const SIGNATURE = '\n\nMit freundlichen Grüßen\nKevin Ritz\nkevin@ritz-ai.solutions';

function getContact(id) {
  return S.contacts.find(function(x) { return x.id === id; });
}

function lastTouchNotiz(c) {
  if (!c.touches || !c.touches.length) return '';
  for (let i = c.touches.length - 1; i >= 0; i--) {
    const t = c.touches[i];
    if (t && (t.notiz || '').trim()) return t.notiz.trim();
  }
  return '';
}

function einwandText(c) {
  return (c.notiz || c.besonderheit || lastTouchNotiz(c) || '').trim();
}

function lastEmailLogEntry(c) {
  const log = c.extra && c.extra.email_log;
  if (Array.isArray(log) && log.length) return log[log.length - 1];
  return null;
}

export function logEmailOnContact(c, subject, bodyPreview) {
  if (!c.extra || typeof c.extra !== 'object') c.extra = {};
  if (!Array.isArray(c.extra.email_log)) c.extra.email_log = [];
  c.extra.email_log.push({
    at: new Date().toISOString(),
    subject: subject || '',
    preview: (bodyPreview || '').slice(0, 120),
  });
  if (!c.touches) c.touches = [];
  c.touches.push({
    status: 'Email',
    datum: td(),
    notiz: 'Gesendet: ' + (subject || '(ohne Betreff)'),
  });
}

export function emailCellHtml(c) {
  if (!c.email) {
    return '<span class="em-cell em-none" title="Keine Email-Adresse">—</span>';
  }
  if (c.unsubscribed) {
    return '<span class="em-cell em-unsub" title="Abgemeldet">🚫</span>';
  }
  if (c.reply_received) {
    return '<span class="em-cell em-reply" title="Hat geantwortet">↩</span>';
  }
  const last = lastEmailLogEntry(c);
  const tip = last && last.at
    ? 'Zuletzt: ' + (last.subject || '').slice(0, 40) + ' (' + last.at.slice(0, 10) + ')'
    : 'Email hinterlegt — Rechtsklick: Email senden';
  return '<span class="em-cell em-ok" title="' + esc(tip) + '">✉</span>';
}

export function emailPanelHtml(c) {
  let html = '<div id="pEmailSec"><div class="sh">Email</div>';
  if (!c.email) {
    html += '<p class="email-panel-hint">Keine Email-Adresse hinterlegt.</p>';
  } else {
    html += '<p class="email-panel-addr">' + esc(c.email) + '</p>';
    const log = (c.extra && c.extra.email_log) || [];
    if (log.length) {
      html += '<div class="email-log">';
      log.slice(-5).reverse().forEach(function(entry) {
        const d = entry.at ? entry.at.slice(0, 10) : '—';
        html += '<div class="email-log-row"><span class="email-log-date">' + esc(d) + '</span> ' +
          esc(entry.subject || '—') + '</div>';
      });
      html += '</div>';
    } else {
      html += '<p class="email-panel-hint">Noch keine Email aus dem CRM gesendet.</p>';
    }
    html += '<div class="email-panel-actions">';
    html += '<button type="button" class="btn bp bsm" onclick="openMailCompose(\'' + c.id + '\',\'ai\')">✉️ Email senden…</button>';
    if (!c.reply_received && !c.unsubscribed) {
      html += '<button type="button" class="btn bs bsm" onclick="markReply(\'' + c.id + '\')">✓ Geantwortet</button>';
    }
    if (!c.unsubscribed) {
      html += '<button type="button" class="btn bs bsm" onclick="markUnsub(\'' + c.id + '\')">🚫 Abmelden</button>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

export function openEsPanel(id) {
  openP(id);
  setTimeout(function() {
    const el = document.getElementById('pEmailSec');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

function _mailComposeContact() {
  return getContact(S.mailComposeId);
}

function _setComposeStep(step) {
  const s1 = document.getElementById('mcStepSetup');
  const s2 = document.getElementById('mcStepEdit');
  const loading = document.getElementById('mcLoading');
  if (s1) s1.style.display = step === 'setup' ? '' : 'none';
  if (s2) s2.style.display = step === 'edit' ? '' : 'none';
  if (loading) loading.style.display = step === 'loading' ? 'block' : 'none';
  const genBtn = document.getElementById('mcGenBtn');
  const sendBtn = document.getElementById('mcSendBtn');
  if (genBtn) genBtn.style.display = step === 'setup' && S.mailComposeMode === 'ai' ? '' : 'none';
  if (sendBtn) sendBtn.style.display = step === 'edit' ? '' : 'none';
}

function _fillAnlassSelect() {
  const sel = document.getElementById('mcAnlass');
  if (!sel || sel.dataset.ready) return;
  sel.dataset.ready = '1';
  sel.innerHTML = MAIL_ANLASS.map(function(a) {
    return '<option value="' + esc(a.value) + '">' + esc(a.label) + '</option>';
  }).join('');
}

export function mailComposeSetMode(mode) {
  S.mailComposeMode = mode;
  document.querySelectorAll('.mc-mode-tab').forEach(function(btn) {
    btn.classList.toggle('on', btn.dataset.mode === mode);
  });
  const anlassSelectRow = document.getElementById('mcAnlassSelectRow');
  const setup = document.getElementById('mcStepSetup');
  if (anlassSelectRow) anlassSelectRow.hidden = mode !== 'ai';
  if (setup) setup.hidden = mode !== 'ai';
  if (mode === 'ai') {
    document.getElementById('mcSubject').value = '';
    document.getElementById('mcBody').value = '';
    _setComposeStep('setup');
  } else if (mode === 'outline') {
    document.getElementById('mcSubject').value = '';
    document.getElementById('mcBody').value = OUTLINE_BODY;
    _setComposeStep('edit');
  } else {
    document.getElementById('mcSubject').value = '';
    document.getElementById('mcBody').value = SIGNATURE.trim();
    _setComposeStep('edit');
  }
}

export function openMailCompose(id, mode) {
  const c = getContact(id);
  if (!c) return;
  if (!c.email) {
    toast('Keine Email-Adresse für diesen Lead.');
    return;
  }
  S.mailComposeId = id;
  S.mailComposeMode = mode || 'ai';
  _fillAnlassSelect();
  const pop = document.getElementById('mailComposePop');
  if (!pop) return;
  document.getElementById('mcTitle').textContent = 'Email an: ' + c.firma;
  document.getElementById('mcTo').textContent = c.email;
  document.getElementById('mcNotiz').textContent = einwandText(c) || '— keine Notiz —';
  document.getElementById('mcSubject').value = '';
  document.getElementById('mcBody').value = '';
  mailComposeSetMode(S.mailComposeMode);
  pop.classList.add('on');
}

export function closeMailCompose() {
  const pop = document.getElementById('mailComposePop');
  if (pop) pop.classList.remove('on');
  S.mailComposeId = null;
}

export async function mailComposeGenerate() {
  const c = _mailComposeContact();
  if (!c) return;
  const anlass = document.getElementById('mcAnlass').value;
  _setComposeStep('loading');
  try {
    const resp = await whFetch('wf7-compose', {
      contact_id: c.id,
      anlass: anlass,
      notiz: c.notiz || c.besonderheit || '',
      einwand: einwandText(c),
      firma: c.firma,
      kontakt: c.kontakt || '',
      email: c.email,
      website: c.website || '',
      preview_only: true,
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    document.getElementById('mcSubject').value = data.subject || '';
    document.getElementById('mcBody').value = data.body || '';
    _setComposeStep('edit');
  } catch (e) {
    toast('Fehler beim Generieren: ' + e.message);
    _setComposeStep('setup');
  }
}

export async function mailComposeSend() {
  const c = _mailComposeContact();
  if (!c) return;
  const subject = (document.getElementById('mcSubject').value || '').trim();
  const body = (document.getElementById('mcBody').value || '').trim();
  if (!subject || !body) {
    toast('Betreff und Inhalt erforderlich.');
    return;
  }
  const msg = 'Email wirklich senden?\n\nAn: ' + c.email + '\nFirma: ' + c.firma + '\nBetreff: ' + subject;
  if (!confirm(msg)) return;
  const btn = document.getElementById('mcSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sende…'; }
  try {
    const resp = await whFetch('wf7-compose', {
      contact_id: c.id,
      to: c.email,
      subject: subject,
      body: body,
      firma: c.firma,
      kontakt: c.kontakt || '',
      approved: true,
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    logEmailOnContact(c, subject, body);
    markDirty(c);
    persist();
    pushDirty();
    if (typeof window.render === 'function') window.render();
    toast('Email gesendet an ' + c.firma + '.');
    closeMailCompose();
    setTimeout(syncCloud, 30000);
  } catch (e) {
    toast('Sendefehler: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Senden'; }
  }
}

export function markReply(id) {
  const c = getContact(id);
  if (!c) return;
  c.reply_received = true;
  markDirty(c);
  persist();
  if (typeof window.render === 'function') window.render();
  pushDirty();
  openP(id);
  toast('Als geantwortet markiert.');
}

export function markUnsub(id) {
  const c = getContact(id);
  if (!c) return;
  c.unsubscribed = true;
  markDirty(c);
  persist();
  if (typeof window.render === 'function') window.render();
  pushDirty();
  openP(id);
  toast('Abgemeldet.');
}
