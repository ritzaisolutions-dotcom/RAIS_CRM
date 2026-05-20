import { S } from './state.js';
import { sbGet } from './supabase.js';
import { sbadge, esc, toast } from './ui.js';
import { syncCloud } from './sync.js';

export const WH_BASE  = 'https://n8n.ritz-ai.solutions/webhook/';
export const WH_TOKEN = 'ESyfcQbQHy5sFFJBRsmPJSPIs1-87jQw7zCGHetsGpc';
export const WH = {
  wf1:    WH_BASE + 'wf1-discover',
  wf2:    WH_BASE + 'wf2-qualify',
  wf3:    WH_BASE + 'wf3-enrich',
  email1: WH_BASE + 'wf4-email1',
  email2: WH_BASE + 'wf5-email2',
  email3: WH_BASE + 'wf6-email3',
};

export function whFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-RAIS-Token': WH_TOKEN }, opts.headers || {});
  return fetch(url, opts);
}

export function switchTab(name) {
  ['leadgen','prospecting','clients'].forEach(function(t) {
    document.getElementById('sec-' + t).classList.toggle('active', t === name);
  });
  document.querySelectorAll('.tab-nav-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  if (name === 'leadgen')  loadLgPreview();
  if (name === 'clients')  window.loadClients && window.loadClients();
  location.hash = name;
}

(function() {
  const btns = document.querySelectorAll('.tab-nav-btn');
  const tabs = ['leadgen','prospecting','clients'];
  btns.forEach(function(btn, i) { if (tabs[i]) btn.dataset.tab = tabs[i]; });
  const h = location.hash.replace('#','');
  if (h === 'leadgen' || h === 'clients') switchTab(h);
})();

export async function runWF(num) {
  const stadt = document.getElementById('lgStadt').value.trim();
  if (!stadt) { toast('Bitte Stadt eingeben.'); return; }
  const query   = document.getElementById('lgGewerk').value;
  const radius  = parseInt(document.getElementById('lgRadius').value) * 1000;
  const btn  = document.getElementById('wfBtn' + num);
  const stat = document.getElementById('wfSt' + num);
  btn.classList.add('running');
  btn.disabled = true;
  stat.textContent = '⏳ läuft…';
  stat.className = 'wf-status running';

  const payload = { query: query, stadt: stadt, radius: radius };
  try {
    const wfKey = 'wf' + num;
    const runStartedAt = new Date().toISOString();
    const wfResp = await whFetch(WH[wfKey], { method: 'POST', body: JSON.stringify(payload) });
    if (!wfResp.ok) throw new Error('HTTP ' + wfResp.status);
    if (S.lgPollTimer) { clearInterval(S.lgPollTimer); S.lgPollTimer = null; }
    S.lgCurrentRun = { wf: wfKey, stadt: stadt, num: num, startedAt: runStartedAt };
    S.lgPollTimer = setInterval(function() { pollWfRun(num); }, 15000);
    toast('WF' + num + ' gestartet — läuft im Hintergrund.');
  } catch(e) {
    btn.classList.remove('running');
    btn.classList.add('error');
    stat.textContent = '✗ Fehler';
    stat.className = 'wf-status error';
    toast('Fehler: ' + e.message);
  }
}

export async function pollWfRun(num) {
  if (!S.lgCurrentRun) return;
  try {
    const rows = await sbGet('/rest/v1/wf_runs?wf=eq.' + S.lgCurrentRun.wf + '&created_at=gte.' + encodeURIComponent(S.lgCurrentRun.startedAt) + '&order=created_at.desc&limit=1');
    if (!rows || !rows.length) return;
    const run = rows[0];
    if (run.status === 'done') {
      clearInterval(S.lgPollTimer);
      const btn  = document.getElementById('wfBtn' + num);
      const stat = document.getElementById('wfSt' + num);
      btn.classList.remove('running');
      btn.classList.add('done');
      btn.disabled = false;
      stat.textContent = '✓ ' + (run.count || '') + ' Leads';
      stat.className = 'wf-status done';
      if (num < 3) {
        const nextBtn = document.getElementById('wfBtn' + (num + 1));
        if (nextBtn) nextBtn.disabled = false;
      }
      if (num === 3) document.getElementById('lgImportBtn').disabled = false;
      loadLgPreview();
      toast('WF' + num + ' fertig — ' + (run.count||0) + ' Einträge.');
    }
  } catch(e) { /* ignore poll errors */ }
}

export async function loadLgPreview() {
  const stadt = document.getElementById('lgStadt').value.trim();
  const body  = document.getElementById('lgPreviewBody');
  const cntEl = document.getElementById('lgPreviewCount');
  try {
    let url = '/rest/v1/crm_contacts?select=firma,website,reviews,kontakt,email,status&order=created.desc&limit=30';
    if (stadt) url += '&stadt=ilike.*' + encodeURIComponent(stadt) + '*';
    const rows = await sbGet(url);
    if (!rows || !rows.length) {
      body.innerHTML = '<div class="lg-empty">Keine Ergebnisse für "' + (stadt||'alle') + '".</div>';
      cntEl.textContent = '';
      return;
    }
    cntEl.textContent = '(' + rows.length + ')';
    body.innerHTML = '<table><thead><tr>' +
      '<th>Firma</th><th>Website</th><th>Reviews</th><th>Kontakt</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr>' +
          '<td style="font-weight:600">' + esc(r.firma||'') + '</td>' +
          '<td>' + (r.website ? '<a href="' + esc(r.website) + '" target="_blank" style="color:var(--bl);text-decoration:none;font-size:11px">' + esc(r.website.replace(/^https?:\/\//,'').slice(0,30)) + '</a>' : '<span style="color:#D9D1C7">—</span>') + '</td>' +
          '<td>' + esc(r.reviews||'—') + '</td>' +
          '<td>' + esc(r.kontakt||'—') + '</td>' +
          '<td>' + sbadge(r.status||'neu') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  } catch(e) {
    body.innerHTML = '<div class="lg-empty" style="color:var(--rd)">Fehler: ' + esc(e.message) + '</div>';
  }
}

export async function lgImportToCRM() {
  await syncCloud();
  switchTab('prospecting');
  toast('Leads übernommen — Prospecting CRM aktualisiert.');
}
