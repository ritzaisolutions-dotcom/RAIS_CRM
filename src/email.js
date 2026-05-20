import { S } from './state.js';
import { markDirty, persist, pushDirty, syncCloud } from './sync.js';
import { esc, toast } from './ui.js';
import { td } from './utils.js';
import { WH, whFetch } from './leadgen.js';

export function emailBadge(c) {
  if (c.unsubscribed)    return '<span class="em-badge em-unsub" title="Abgemeldet" onclick="event.stopPropagation();openEsPanel(\'' + c.id + '\')">🚫</span>';
  if (c.reply_received)  return '<span class="em-badge em-reply" title="Hat geantwortet" onclick="event.stopPropagation();openEsPanel(\'' + c.id + '\')">↩</span>';
  if (c.followup_sent)   return '<span class="em-badge em-e3" title="Email 3 gesendet" onclick="event.stopPropagation();openEsPanel(\'' + c.id + '\')">E3</span>';
  if (c.email_2_sent)    return '<span class="em-badge em-e2" title="Email 2 gesendet" onclick="event.stopPropagation();openEsPanel(\'' + c.id + '\')">E2</span>';
  if (c.email_1_sent)    return '<span class="em-badge em-e1" title="Email 1 gesendet" onclick="event.stopPropagation();openEsPanel(\'' + c.id + '\')">E1</span>';
  return '<span class="em-badge em-none" title="Noch keine Email" onclick="event.stopPropagation();openEsPop(\'' + c.id + '\')">—</span>';
}

export function emailPanelHtml(c) {
  const fmtDate = function(d) { return d ? d : null; };
  const e1sent = fmtDate(c.email_1_sent);
  const e2sent = fmtDate(c.email_2_sent);
  const e3sent = fmtDate(c.followup_sent);
  const hasEmail = !!c.email;

  function row(label, val, btnHtml) {
    return '<div class="email-row"><span class="email-lbl">' + label + '</span>' +
      '<span class="email-val ' + (val ? 'sent' : 'pending') + '">' + (val || '—') + '</span>' +
      (btnHtml || '') + '</div>';
  }

  const canSend1 = hasEmail && !e1sent && !c.unsubscribed && !c.reply_received;
  const canSend2 = hasEmail && e1sent && !e2sent && !c.unsubscribed && !c.reply_received;
  const canSend3 = hasEmail && e2sent && !e3sent && !c.unsubscribed && !c.reply_received;

  let html = '<div id="pEmailSec"><div class="sh">Email</div>';
  if (!hasEmail) {
    html += '<div style="font-family:sans-serif;font-size:12px;color:#B0A898;font-style:italic;margin-bottom:8px">Keine Email-Adresse hinterlegt.</div>';
  } else {
    html += '<div class="email-sec">';
    html += row('Email 1',
      e1sent ? (e1sent + (c.email_1_subject ? ' • "' + c.email_1_subject.slice(0,30) + '"' : '')) : null,
      canSend1 ? '<button class="btn bp bsm" onclick="openEsPop(\'' + c.id + '\');closeP()" style="white-space:nowrap">Senden ▶</button>' : '');
    html += row('Email 2',
      e2sent || null,
      canSend2 ? '<button class="btn bs bsm" onclick="sendEmailBatch(\'' + c.id + '\',2)" style="white-space:nowrap">Senden ▶</button>' : (e1sent && !e2sent ? '<span style="font-size:11px;color:#B0A898;font-family:sans-serif">ab Tag 3</span>' : ''));
    html += row('Email 3',
      e3sent || null,
      canSend3 ? '<button class="btn bs bsm" onclick="sendEmailBatch(\'' + c.id + '\',3)" style="white-space:nowrap">Senden ▶</button>' : (e2sent && !e3sent ? '<span style="font-size:11px;color:#B0A898;font-family:sans-serif">ab Tag 7</span>' : ''));
    html += '</div>';
    html += '<div style="display:flex;gap:6px;margin-top:8px">';
    if (!c.reply_received && !c.unsubscribed) {
      html += '<button class="btn bs bsm" onclick="markReply(\'' + c.id + '\')" style="color:var(--pn)">✓ Geantwortet</button>';
    }
    if (!c.unsubscribed) {
      html += '<button class="btn bs bsm" onclick="markUnsub(\'' + c.id + '\')" style="color:var(--rd)">🚫 Abmelden</button>';
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

export function openEsPop(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  S.esContactId = id;
  document.getElementById('esTitle').textContent = 'Email an: ' + c.firma;
  document.getElementById('esNotiz').textContent = c.notiz || c.besonderheit || '— keine Notiz —';
  document.getElementById('esStep1').style.display = '';
  document.getElementById('esStep2').style.display = 'none';
  document.getElementById('esLoading').style.display = 'none';
  document.getElementById('esGenBtn').style.display = '';
  document.getElementById('esSendBtn').style.display = 'none';
  document.getElementById('esPop').style.display = 'flex';
}

export function closeEsPop() {
  document.getElementById('esPop').style.display = 'none';
  S.esContactId = null;
}

export async function esGenerate() {
  const c = S.contacts.find(function(x) { return x.id === S.esContactId; });
  if (!c) return;
  const anlass = document.getElementById('esAnlass').value;
  document.getElementById('esStep1').style.display = 'none';
  document.getElementById('esLoading').style.display = 'block';
  document.getElementById('esGenBtn').style.display = 'none';
  try {
    const resp = await whFetch(WH.email1, {
      method: 'POST',
      body: JSON.stringify({
        contact_id:  c.id,
        anlass:      anlass,
        notiz:       c.notiz || c.besonderheit || '',
        firma:       c.firma,
        kontakt:     c.kontakt || '',
        website:     c.website || '',
        preview_only: true,
      })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    document.getElementById('esLoading').style.display = 'none';
    document.getElementById('esStep2').style.display = 'block';
    document.getElementById('esSubject').value = data.subject || '';
    document.getElementById('esBody').value    = data.body    || '';
    document.getElementById('esSendBtn').style.display = '';
  } catch(e) {
    document.getElementById('esLoading').style.display = 'none';
    document.getElementById('esStep1').style.display = '';
    document.getElementById('esGenBtn').style.display = '';
    toast('Fehler beim Generieren: ' + e.message);
  }
}

export async function esSend() {
  const c = S.contacts.find(function(x) { return x.id === S.esContactId; });
  if (!c) return;
  const subject = document.getElementById('esSubject').value;
  const body    = document.getElementById('esBody').value;
  if (!subject || !body) { toast('Betreff und Inhalt erforderlich.'); return; }
  const btn = document.getElementById('esSendBtn');
  btn.disabled = true;
  btn.textContent = '📨 Sende…';
  try {
    const sendResp = await whFetch(WH.email1, {
      method: 'POST',
      body: JSON.stringify({
        contact_id: c.id,
        subject:    subject,
        body:       body,
        approved:   true,
      })
    });
    if (!sendResp.ok) throw new Error('HTTP ' + sendResp.status);
    toast('Email gesendet an ' + c.firma + ' ✓');
    c.email_1_sent = td();
    c.email_1_subject = subject;
    c.email_status = 'sent';
    markDirty(c);
    persist(); render();
    closeEsPop();
    setTimeout(syncCloud, 30000);
  } catch(e) {
    toast('Sendefehler: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Senden';
  }
}

export async function sendEmailBatch(id, emailNum) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  const whKey = emailNum === 2 ? 'email2' : 'email3';
  try {
    const batchResp = await whFetch(WH[whKey], { method: 'POST', body: JSON.stringify({ contact_id: id }) });
    if (!batchResp.ok) throw new Error('HTTP ' + batchResp.status);
    if (emailNum === 2) c.email_2_sent = td();
    if (emailNum === 3) c.followup_sent = td();
    c.email_status = 'sent';
    markDirty(c);
    persist(); render();
    openP(id);
    toast('Email ' + emailNum + ' an ' + c.firma + ' gesendet ✓');
    setTimeout(syncCloud, 30000);
  } catch(e) { toast('Fehler: ' + e.message); }
}

export function markReply(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  c.reply_received = true;
  markDirty(c);
  persist(); render(); pushDirty(); openP(id);
  toast('Als geantwortet markiert.');
}

export function markUnsub(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  c.unsubscribed = true;
  markDirty(c);
  persist(); render(); pushDirty(); openP(id);
  toast('Abgemeldet.');
}

export function countEligible(num) {
  return S.contacts.filter(function(c) {
    if (!c.email || c.unsubscribed || c.reply_received) return false;
    if (num === 1) return !c.email_1_sent;
    if (num === 2) return c.email_1_sent && !c.email_2_sent;
    if (num === 3) return c.email_2_sent && !c.followup_sent;
    return false;
  }).length;
}

export async function bulkEmail(num) {
  const cnt = countEligible(num);
  if (!cnt) { toast('Keine Kontakte für Email ' + num + ' eligible.'); return; }
  if (!confirm(cnt + ' Kontakte erhalten Email ' + num + '. Fortfahren?')) return;
  const whKey = num === 1 ? 'email1' : num === 2 ? 'email2' : 'email3';
  try {
    const bulkResp = await whFetch(WH[whKey], { method: 'POST', body: JSON.stringify({ batch: true }) });
    if (!bulkResp.ok) throw new Error('HTTP ' + bulkResp.status);
    toast('Email ' + num + ' Batch gestartet — ' + cnt + ' Kontakte.');
    setTimeout(syncCloud, 60000);
  } catch(e) { toast('Fehler: ' + e.message); }
}
