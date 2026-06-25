import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, toast } from './ui.js';

export const TYPE_LABELS = {
  lfc:     'LFC',
  sfc:     'SFC',
  article: 'Article',
};

export const STATUS_LABELS = {
  idee:    'Idee',
  skript:  'Skript',
  dreh:    'Dreh',
  schnitt: 'Schnitt',
  live:    'Live',
};

const STATUS_CLS = {
  idee:    'b-neu',
  skript:  'b-cb',
  dreh:    'b-gk',
  schnitt: 'b-en',
  live:    'b-gw',
};

export const PLATFORM_ICONS = {
  youtube:   '🎬',
  instagram: '📸',
  linkedin:  '💼',
};

const PLATFORM_LABELS = {
  youtube:   'YouTube',
  instagram: 'Instagram',
  linkedin:  'LinkedIn',
};

const CONTENT_KEY_SB = '/rest/v1/crm_content';

let _items = [];
let _editId = null;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'content') initContentPage();
});

export async function initContentPage() {
  await loadContent();
}

export async function loadContent() {
  try {
    const rows = await sbGet(CONTENT_KEY_SB + '?select=*&order=created_at.desc');
    _items = rows || [];
    renderContent();
  } catch (e) {
    toast('Content laden fehlgeschlagen: ' + e.message);
  }
}

/** Dashboard: Live-Content ohne UI-State */
export async function fetchContentSnapshot() {
  try {
    const rows = await sbGet(CONTENT_KEY_SB + '?select=*&order=publish_date.desc');
    return rows || [];
  } catch (_) {
    return [];
  }
}

function getFilteredItems() {
  const typeF     = (document.getElementById('content-filter-type')     || { value: '' }).value;
  const statusF   = (document.getElementById('content-filter-status')   || { value: '' }).value;
  const platformF = (document.getElementById('content-filter-platform') || { value: '' }).value;
  return _items.filter(function(item) {
    if (typeF && item.type !== typeF) return false;
    if (statusF && item.status !== statusF) return false;
    const plat = (item.platforms || 'youtube').split(',')[0].trim();
    if (platformF && plat !== platformF) return false;
    return true;
  });
}

function statusBadge(status) {
  const s = status || 'idee';
  return '<span class="badge ' + (STATUS_CLS[s] || 'b-neu') + '">' + esc(STATUS_LABELS[s] || s) + '</span>';
}

function platformLabel(platforms) {
  const key = (platforms || 'youtube').split(',')[0].trim();
  return esc(PLATFORM_LABELS[key] || key);
}

function linkCell(item) {
  const plat = (item.platforms || 'youtube').split(',')[0].trim();
  const url = plat === 'instagram' ? item.url_instagram
    : plat === 'linkedin' ? item.url_linkedin
    : item.url_youtube;
  if (!url) return '<span style="color:#ccc">—</span>';
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + (PLATFORM_ICONS[plat] || '↗') + '</a>';
}

function renderStats() {
  const el = document.getElementById('content-stats');
  if (!el) return;
  const counts = { lfc: 0, sfc: 0, article: 0, live: 0 };
  _items.forEach(function(item) {
    if (counts[item.type] !== undefined) counts[item.type]++;
    if (item.status === 'live') counts.live++;
  });
  el.innerHTML =
    '<span class="content-stat"><strong>LFC:</strong> ' + counts.lfc + '</span>' +
    '<span class="content-stat"><strong>SFC:</strong> ' + counts.sfc + '</span>' +
    '<span class="content-stat"><strong>Article:</strong> ' + counts.article + '</span>' +
    '<span class="content-stat-sep">|</span>' +
    '<span class="content-stat content-stat-live">✅ Live: ' + counts.live + '</span>' +
    '<span class="content-stat">📝 Gesamt: ' + _items.length + '</span>';
}

export function renderContent() {
  renderStats();
  const list  = getFilteredItems();
  const tbody = document.getElementById('content-tbody');
  const empty = document.getElementById('content-empty');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = list.map(function(item, i) {
    return '<tr>' +
      '<td style="color:#B0A898;font-family:sans-serif;font-size:12px;text-align:right;padding-right:8px">' + (i + 1) + '</td>' +
      '<td class="fc">' + esc(item.title) + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + esc(TYPE_LABELS[item.type] || item.type) + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px">' + platformLabel(item.platforms) + '</td>' +
      '<td>' + statusBadge(item.status) + '</td>' +
      '<td style="font-family:sans-serif;font-size:12px;color:var(--st)">' + esc(item.publish_date || '—') + '</td>' +
      '<td style="font-size:16px">' + linkCell(item) + '</td>' +
      '<td onclick="event.stopPropagation()"><div class="ra" style="opacity:1">' +
        '<button class="btn bg bsm" onclick="openContentEdit(\'' + item.id + '\')" title="Bearbeiten">✎</button>' +
        '<button class="btn bg bsm" onclick="delContent(\'' + item.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
      '</div></td>' +
      '</tr>';
  }).join('');
}

export function filterContent() {
  renderContent();
}

function readPlatformFromModal() {
  const el = document.querySelector('input[name="cnt-platform"]:checked');
  return el ? el.value : 'youtube';
}

function setPlatformInModal(platform) {
  const val = platform || 'youtube';
  document.querySelectorAll('input[name="cnt-platform"]').forEach(function(el) {
    el.checked = el.value === val.split(',')[0].trim();
  });
  toggleContentUrlFields(val.split(',')[0].trim());
}

function toggleContentUrlFields(plat) {
  const y = document.getElementById('cntUrlYoutubeRow');
  const i = document.getElementById('cntUrlInstagramRow');
  const l = document.getElementById('cntUrlLinkedinRow');
  if (y) y.style.display = plat === 'youtube' ? '' : 'none';
  if (i) i.style.display = plat === 'instagram' ? '' : 'none';
  if (l) l.style.display = plat === 'linkedin' ? '' : 'none';
}

export function openContentAdd() {
  _editId = null;
  document.getElementById('cntModalTitle').textContent = 'Neuer Content';
  document.getElementById('cntEid').value = '';
  document.getElementById('cntTitle').value = '';
  document.getElementById('cntType').value = 'lfc';
  document.getElementById('cntStatus').value = 'idee';
  document.getElementById('cntDatum').value = '';
  document.getElementById('cntUrlYoutube').value = '';
  document.getElementById('cntUrlInstagram').value = '';
  document.getElementById('cntUrlLinkedin').value = '';
  document.getElementById('cntNotiz').value = '';
  setPlatformInModal('youtube');
  document.getElementById('contentModal').classList.add('on');
}

export function openContentEdit(id) {
  const item = _items.find(function(x) { return x.id === id; });
  if (!item) return;
  _editId = id;
  document.getElementById('cntModalTitle').textContent = 'Content bearbeiten';
  document.getElementById('cntEid').value = id;
  document.getElementById('cntTitle').value = item.title || '';
  document.getElementById('cntType').value = item.type || 'lfc';
  document.getElementById('cntStatus').value = item.status || 'idee';
  document.getElementById('cntDatum').value = item.publish_date || '';
  document.getElementById('cntUrlYoutube').value = item.url_youtube || '';
  document.getElementById('cntUrlInstagram').value = item.url_instagram || '';
  document.getElementById('cntUrlLinkedin').value = item.url_linkedin || '';
  document.getElementById('cntNotiz').value = item.notiz || '';
  setPlatformInModal(item.platforms);
  document.getElementById('contentModal').classList.add('on');
}

export function closeContentModal() {
  document.getElementById('contentModal').classList.remove('on');
}

export async function saveContent() {
  const title = document.getElementById('cntTitle').value.trim();
  if (!title) { toast('Titel fehlt.'); return; }
  const plat = readPlatformFromModal();
  const row = {
    title:         title,
    type:          document.getElementById('cntType').value,
    status:        document.getElementById('cntStatus').value,
    platforms:     plat,
    publish_date:  document.getElementById('cntDatum').value || null,
    url_youtube:   plat === 'youtube'   ? (document.getElementById('cntUrlYoutube').value.trim()   || null) : null,
    url_instagram: plat === 'instagram' ? (document.getElementById('cntUrlInstagram').value.trim() || null) : null,
    url_linkedin:  plat === 'linkedin'  ? (document.getElementById('cntUrlLinkedin').value.trim()  || null) : null,
    notiz:         document.getElementById('cntNotiz').value.trim() || null,
  };
  if (_editId) row.id = _editId;
  try {
    await sbUpsert(CONTENT_KEY_SB, [row]);
    if (_editId) {
      const idx = _items.findIndex(function(x) { return x.id === _editId; });
      if (idx >= 0) _items[idx] = Object.assign({}, _items[idx], row);
      renderContent();
    } else {
      await loadContent();
    }
    closeContentModal();
    toast(_editId ? 'Content gespeichert.' : 'Content hinzugefügt.');
  } catch (e) {
    toast('Fehler: ' + e.message);
  }
}

export async function delContent(id) {
  if (!confirm('Content wirklich löschen?')) return;
  try {
    await sbDelete(CONTENT_KEY_SB + '?id=eq.' + id);
    _items = _items.filter(function(x) { return x.id !== id; });
    renderContent();
    toast('Content gelöscht.');
  } catch (e) {
    toast('Fehler: ' + e.message);
  }
}

window.setContentPlatform = function(plat) {
  toggleContentUrlFields(plat);
};
