import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, toast } from './ui.js';
import { initThumbnailEditor } from './thumbnail.js';

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
  x:         '🐦',
};

const PLATFORM_LABELS = {
  youtube:   'YouTube',
  instagram: 'Instagram',
  x:         'X',
};

const CONTENT_KEY_SB = '/rest/v1/crm_content';

let _items = [];
let _editId = null;
let _contentView = 'pipeline';
let _thumbnailInited = false;

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'content') initContentPage();
});

function initContentSubnav() {
  const root = document.getElementById('page-content');
  if (!root || root.dataset.subnavBound) return;
  root.dataset.subnavBound = '1';
  root.querySelectorAll('.content-subtab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchContentView(btn.dataset.view || 'pipeline');
    });
  });
}

export function switchContentView(view) {
  _contentView = view === 'thumbnail' ? 'thumbnail' : 'pipeline';
  document.querySelectorAll('.content-subtab').forEach(function(btn) {
    const on = btn.dataset.view === _contentView;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const pipeline = document.getElementById('content-view-pipeline');
  const thumbnail = document.getElementById('content-view-thumbnail');
  if (pipeline) pipeline.hidden = _contentView !== 'pipeline';
  if (thumbnail) thumbnail.hidden = _contentView !== 'thumbnail';
  if (_contentView === 'thumbnail' && !_thumbnailInited) {
    initThumbnailEditor();
    _thumbnailInited = true;
  }
}

export async function initContentPage() {
  initContentSubnav();
  switchContentView(_contentView);
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

function getFilteredItems() {
  const typeF     = (document.getElementById('content-filter-type')     || { value: '' }).value;
  const statusF   = (document.getElementById('content-filter-status')   || { value: '' }).value;
  const platformF = (document.getElementById('content-filter-platform') || { value: '' }).value;
  return _items.filter(function(item) {
    if (typeF && item.type !== typeF) return false;
    if (statusF && item.status !== statusF) return false;
    if (platformF && !(item.platforms || '').split(',').map(function(p) { return p.trim(); }).includes(platformF)) return false;
    return true;
  });
}

function statusBadge(status) {
  const s = status || 'idee';
  return '<span class="badge ' + (STATUS_CLS[s] || 'b-neu') + '">' + esc(STATUS_LABELS[s] || s) + '</span>';
}

function platformIcons(platforms) {
  if (!platforms) return '—';
  return platforms.split(',').map(function(p) {
    const key = p.trim();
    return '<span title="' + esc(PLATFORM_LABELS[key] || key) + '">' + (PLATFORM_ICONS[key] || '') + '</span>';
  }).join(' ');
}

function linkCell(item) {
  const parts = [];
  if (item.url_youtube)   parts.push('<a href="' + esc(item.url_youtube)   + '" target="_blank" rel="noopener" title="YouTube">'   + PLATFORM_ICONS.youtube   + '</a>');
  if (item.url_instagram) parts.push('<a href="' + esc(item.url_instagram) + '" target="_blank" rel="noopener" title="Instagram">' + PLATFORM_ICONS.instagram + '</a>');
  if (item.url_x)         parts.push('<a href="' + esc(item.url_x)         + '" target="_blank" rel="noopener" title="X">'         + PLATFORM_ICONS.x         + '</a>');
  return parts.length ? parts.join(' ') : '<span style="color:#ccc">—</span>';
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
      '<td style="font-size:16px">' + platformIcons(item.platforms) + '</td>' +
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

function readPlatformsFromModal() {
  const checked = [];
  document.querySelectorAll('.cnt-platform:checked').forEach(function(el) {
    checked.push(el.value);
  });
  return checked.length ? checked.join(',') : 'youtube';
}

function setPlatformsInModal(platforms) {
  const set = (platforms || 'youtube').split(',').map(function(p) { return p.trim(); });
  document.querySelectorAll('.cnt-platform').forEach(function(el) {
    el.checked = set.includes(el.value);
  });
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
  document.getElementById('cntUrlX').value = '';
  document.getElementById('cntNotiz').value = '';
  setPlatformsInModal('youtube');
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
  document.getElementById('cntUrlX').value = item.url_x || '';
  document.getElementById('cntNotiz').value = item.notiz || '';
  setPlatformsInModal(item.platforms);
  document.getElementById('contentModal').classList.add('on');
}

export function closeContentModal() {
  document.getElementById('contentModal').classList.remove('on');
}

export async function saveContent() {
  const title = document.getElementById('cntTitle').value.trim();
  if (!title) { toast('Titel fehlt.'); return; }
  const row = {
    title:         title,
    type:          document.getElementById('cntType').value,
    status:        document.getElementById('cntStatus').value,
    platforms:     readPlatformsFromModal(),
    publish_date:  document.getElementById('cntDatum').value || null,
    url_youtube:   document.getElementById('cntUrlYoutube').value.trim()   || null,
    url_instagram: document.getElementById('cntUrlInstagram').value.trim() || null,
    url_x:         document.getElementById('cntUrlX').value.trim()         || null,
    notiz:         document.getElementById('cntNotiz').value.trim()       || null,
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
