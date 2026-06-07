/** RAIS Content Thumbnail Editor — lazy-init from Content sub-tab */

const RAIS_LOGO =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">' +
    '<path transform="translate(0,1024) scale(0.1,-0.1)" fill="#EC6A37" d="M5095 7745c-5-2-22-6-37-9-34-8-94-59-114-97-18-35-18-120 0-162 7-18 32-49 55-69l41-35 0-776 0-777-27-6c-51-11-104-25-119-31l-14-5 0 393 0 394-70 73c-38 39-73 73-77 73-5 1-45 41-90 89l-83 88 0 74 0 74 41 39c22 22 48 53 56 70l16 29 0 51 1 50-22 42c-26 50-63 78-126 94l-47 12-42-13c-79-23-128-76-142-153l-7-38 12-45 13-45 48-43 49-44 0-114 0-113 155-155 155-155 0-406 0-407-17-8c-25-10-46-6-60 13-30 38-185 193-194 193-6 0-8 4-5 9 6 9-133 146-149 146-5 1-9 6-8 11 2 12-137 153-152 154-5 0-10 4-10 8 0 6-380 386-512 511l-15 14 7 42 6 43-12 46-11 46-39 38-38 38-39 12c-57 17-92 15-142-10l-45-23-29-42-29-42-5-49-4-49 20-45 20-45 33-26c43-32 101-48 153-41l41 6 269-271c148-148 274-267 279-264 6 3 7 2 4-4-8-12 497-516 507-506 4 4 7 3 5-2-1-6 1-18 6-28l7-17-12-15-13-16-403 3-404 3 0 10c0 6-2 10-4 10-2 0-4 4-4 10l0 10 403 3 404 3 13-16 12-15-7-17c-5-10-7-22-6-28 2-5 1-6-5-2-10 10-515 494-507 506 3 6 2 7-4 4-5-3-131 116-279 264l-269 271-41-6c-52-7-110 9-153 41l-33 26-20 45-20 45 4 49 5 49 29 42 29 42 45 23c50 25 85 27 142 10l39-12 38-38 39-38 11-46 12-46-6-43-7-42 15-14c132-125 512-505 512-511 0-4 5-8 10-8 15-1 154-142 152-154-1-5 3-10 8-11 16 0 155-137 149-146-3-5-1-9 5-9 9 0 164-155 194-193 14-19 35-23 60-13l17 8 0 407 0 406 155 155 155 155 0 113 0 114-49 44-48 43-13 45-12 45 7 38c14 77 63 130 142 153l42 13 47-12c63-16 100-44 126-94l22-42-1-50 0-51-16-29c-8-17-34-48-56-70l-41-39 0-74 0-74 83-88c45-48 85-88 90-89 4 0 39-34 77-73l70-73 0-394 0-393 14 5c15 6 68 20 119 31l27 6 0 777 0 776-41 35c-23 20-48 51-55 69-18 42-18 127 0 162 20 38 80 89 114 97 15 3 32 7 37 9 5 2 22 6 37 9 34 8 94 59 114 97 18 35 18 120 0 162-7 18-32 49-55 69l-41 35 0 776 0 777 27 6c51 11 104 25 119 31l14 5 0-393 0-394 70-73c38-39 73-73 77-73 5-1 45-41 90-89l83-88 0-74 0-74-41-39c-22-22-48-53-56-70l-16-29 0-51-1-50 22-42c26-50 63-78 126-94l47-12 42 13c79 23 128 76 142 153l7 38-12 45-13 45-48 43-49 44 0 114 0 113-155 155-155 155 0 406 0 407 17 8c25 10 46 6 60-13 30-38 185-193 194-193 6 0 8-4 5-9-6-9 133-146 149-146 5-1 9-6 8-11-2-12 137-153 152-154 5 0 10-4 10-8 0-6 380-386 512-511l15-14-7-42-6-43 12-46 11-46 39-38 38-38 39-12c57-17 92-15 142 10l45 23 29 42 29 42 5 49 4 49-20 45-20 45-33 26c-43 32-101 48-153 41l-41-6-269 271c-148 148-274 267-279 264-6-3-7-2-4 4 8 12-497 516-507 506-4-4-7-3-5 2 1 6-1 18-6 28l-7 17 12 15 13 16 403-3 404-3 0-10c0-6 2-10 4-10 2 0 4-4 4-10l0-10-403-3-404-3-13 16-12 15 7 17c5 10 7 22 6 28-2 5-1 6 5 2 10-10 515-494 507-506-3-6-2-7 4-4 5 3 131-116 279-264l269-271 41 6c52 7 110-9 153-41l33-26 20-45 20-45-4-49-5-49-29-42-29-42-45-23c-50-25-85-27-142-10l-39 12-38 38-39 38-11 46-12 46 6 43 7 42-15 14c-132 125-512 505-512 511 0 4-5 8-10 8-15 1-154 142-152 154 1 5-3 10-8 11-16 0-155 137-149 146 3 5 1 9-5 9-9 0-164 155-194 193-14 19-35 23-60 13l-17-8 0-407 0-406-155-155-155-155 0-113 0-114 49-44 48-43 13-45 12-45-7-38c-14-77-63-130-142-153l-42-13-47 12c-63 16-100 44-126 94l-22 42 1 50 0 51 16 29c8 17 34 48 56 70l41 39 0 74 0 74-83 88c-45 48-85 88-90 89-4 0-39 34-77 73l-70 73 0 394 0 393-14-5c-15-6-68-20-119-31l-27-6 0-777 0-776 41-35c23-20 48-51 55-69 18-42 18-127 0-162-20-38-80-89-114-97-15-3-32-7-37-9z"/>' +
    '</svg>'
  );

const PRESETS = [
  { label: 'Variante 1', ep: '#01', hl: 'KI-Automatisierung\nfür', kw: 'Handwerk', sl: 'Kevin Ritz · RAIS Solutions', kwpos: 'after' },
  { label: 'Variante 2', ep: '#02', hl: 'n8n Workflows\nohne', kw: 'Code', sl: 'Automatisierung für KMUs', kwpos: 'after' },
  { label: 'Variante 3', ep: 'VIDEO', hl: 'CRM & Vertrieb', kw: 'automatisieren', sl: 'Mehr Deals, weniger Admin', kwpos: 'after' },
  { label: 'Variante 4', ep: 'SFC', hl: 'Das musst du\nüber KI', kw: 'wissen', sl: 'Short-Form Hook · kevin_ritz', kwpos: 'after' },
];

let _inited = false;
let hlSizePct = 3.2;
let slSizePct = 1.6;
let epSizePct = 1.3;
let darkRgb = { r: 32, g: 28, b: 23 };

function $(id) { return document.getElementById(id); }

function hexToRgb(hex) {
  const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return darkRgb;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbaFromVar(varName, alpha) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#201C17';
  const c = hexToRgb(hex.startsWith('#') ? hex : '#201C17');
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

function toggleTnSection(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('collapsed');
}

function renderHeadline(hl, kw, kwpos) {
  const container = $('tn-headline');
  if (!container) return;
  const lines = hl.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
  if (kwpos === 'hidden' || !kw) {
    container.innerHTML = lines.join('<br>');
  } else if (kwpos === 'after') {
    container.innerHTML = lines.join('<br>') + (lines.length ? '<br>' : '') +
      '<span class="tn-keyword">' + kw + '</span>';
  } else {
    const last = lines.pop();
    const prev = lines.length ? lines.join('<br>') + '<br>' : '';
    container.innerHTML = prev + last + ' <span class="tn-keyword">' + kw + '</span>';
  }
}

function applyFontSizes() {
  const preview = $('tn-preview');
  if (!preview) return;
  const w = preview.offsetWidth;
  const hl = $('tn-headline');
  const sl = $('tn-subline');
  const ep = $('tn-ep');
  if (hl) hl.style.fontSize = (w * hlSizePct / 100) + 'px';
  if (sl) sl.style.fontSize = (w * slSizePct / 100) + 'px';
  if (ep) ep.style.fontSize = (w * epSizePct / 100) + 'px';
}

function updateTextPos() {
  const x = $('rng-textx').value;
  const y = $('rng-texty').value;
  const w = $('rng-textw').value;
  $('val-textx').textContent = x + '%';
  $('val-texty').textContent = y + '%';
  $('val-textw').textContent = w + '%';
  const el = $('tn-text');
  el.style.left = x + '%';
  el.style.bottom = y + '%';
  el.style.width = w + '%';
}

function updateLogoSize(v) {
  $('val-logo').textContent = v + '%';
  $('tn-logo').style.width = v + '%';
}

function updateLogoSide(side) {
  const el = $('tn-logo');
  if (side === 'left') {
    el.style.right = 'auto';
    el.style.left = '2.5%';
  } else {
    el.style.left = 'auto';
    el.style.right = '2.5%';
  }
}

function updateColor(varName, hex, hexInputId) {
  document.documentElement.style.setProperty('--tn-' + varName, hex);
  if (hexInputId && $(hexInputId)) $(hexInputId).value = hex;
  if (varName === 'dark') darkRgb = hexToRgb(hex);
  updateOverlay();
}

function updateColorFromHex(varName, val) {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) updateColor(varName, val, 'hex-' + varName);
}

function updateBars(v) {
  $('tn-bar-top').style.display = (v === 'both' || v === 'top') ? 'block' : 'none';
  $('tn-bar-bottom').style.display = (v === 'both' || v === 'bottom') ? 'block' : 'none';
}

function updatePhotoFilter() {
  const bright = $('rng-bright').value;
  const sat = $('rng-sat').value;
  $('val-bright').textContent = bright + '%';
  $('val-sat').textContent = sat + '%';
  $('tn-bg').style.filter = 'brightness(' + (bright / 100) + ') saturate(' + (sat / 100) + ')';
}

function updateOverlay() {
  const op = parseFloat($('rng-overlay').value);
  const reach = parseInt($('rng-ovreach').value, 10);
  $('val-overlay').textContent = op + '%';
  $('val-ovreach').textContent = reach + '%';
  const full = rgbaFromVar('--tn-dark', op / 100);
  const mid = rgbaFromVar('--tn-dark', (op * 0.75) / 100);
  const reach2 = Math.min(reach + 30, 100);
  $('tn-overlay').style.background =
    'linear-gradient(to right, ' + full + ' 0%, ' + mid + ' ' + reach + '%, rgba(32,28,23,0.1) ' + reach2 + '%, rgba(32,28,23,0) 100%)';
}

function updateEp(v) { $('tn-ep').textContent = v; }

function updateHeadline() {
  renderHeadline($('inp-hl').value, $('inp-kw').value, $('inp-kwpos').value);
  applyFontSizes();
}

function updateSubline(v) { $('tn-subline').textContent = v; }

function updateHlSize(v) {
  hlSizePct = parseFloat(v);
  $('val-hlsize').textContent = v + '%';
  applyFontSizes();
}

function updateSlSize(v) {
  slSizePct = parseFloat(v);
  $('val-slsize').textContent = v + '%';
  applyFontSizes();
}

function updateEpSize(v) {
  epSizePct = parseFloat(v);
  $('val-epsize').textContent = v + '%';
  applyFontSizes();
}

function applyPreset(n) {
  const p = PRESETS[n];
  if (!p) return;
  $('inp-ep').value = p.ep;
  $('inp-hl').value = p.hl;
  $('inp-kw').value = p.kw;
  $('inp-sl').value = p.sl;
  $('inp-kwpos').value = p.kwpos;
  $('tn-preset-label').textContent = p.label + ' aktiv';
  updateEp(p.ep);
  updateSubline(p.sl);
  updateHeadline();
}

function loadBg(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  $('tn-bg').src = URL.createObjectURL(file);
}

function loadLogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  $('tn-logo-img').src = URL.createObjectURL(file);
}

export function openTnExportModal() {
  $('tnExportModal').classList.add('on');
}

export function closeTnExportModal() {
  $('tnExportModal').classList.remove('on');
}

function buildSidebar() {
  const sidebar = $('tn-sidebar');
  if (!sidebar || sidebar.dataset.built) return;
  sidebar.dataset.built = '1';
  sidebar.innerHTML =
    '<div class="tn-section" id="sec-presets">' +
      '<div class="tn-section-head" data-sec="sec-presets"><span class="tn-section-title">Schnell-Presets</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body"><div class="tn-preset-grid">' +
        PRESETS.map(function(p, i) {
          return '<button type="button" class="tn-preset-btn" data-preset="' + i + '"><strong>' + p.label + '</strong>' + p.sl + '</button>';
        }).join('') +
      '</div></div></div>' +
    '<div class="tn-section" id="sec-text">' +
      '<div class="tn-section-head" data-sec="sec-text"><span class="tn-section-title">Text</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Badge</label><input class="tn-ctrl-input" id="inp-ep" value="#01"></div>' +
        '<div><label class="tn-ctrl-label">Headline (Zeilenumbruch mit Enter)</label><textarea class="tn-ctrl-textarea" id="inp-hl" rows="2"></textarea></div>' +
        '<div><label class="tn-ctrl-label">Keyword (Orange-Hervorhebung)</label><input class="tn-ctrl-input" id="inp-kw"></div>' +
        '<div><label class="tn-ctrl-label">Subline</label><input class="tn-ctrl-input" id="inp-sl"></div>' +
        '<div><label class="tn-ctrl-label">Keyword Position</label><select class="tn-ctrl-select" id="inp-kwpos">' +
          '<option value="after">Nach Headline (neue Zeile)</option><option value="inline">In Headline integriert</option><option value="hidden">Kein Keyword</option>' +
        '</select></div>' +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-typo">' +
      '<div class="tn-section-head" data-sec="sec-typo"><span class="tn-section-title">Typografie</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        rangeRow('Headline Größe', 'rng-hlsize', 'val-hlsize', 2, 6, 0.1, 3.2) +
        rangeRow('Subline Größe', 'rng-slsize', 'val-slsize', 0.8, 2.5, 0.1, 1.6) +
        rangeRow('Badge Größe', 'rng-epsize', 'val-epsize', 0.8, 2, 0.1, 1.3) +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-pos">' +
      '<div class="tn-section-head" data-sec="sec-pos"><span class="tn-section-title">Position & Layout</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        rangeRow('Text Abstand Links', 'rng-textx', 'val-textx', 2, 60, 0.5, 3.5) +
        rangeRow('Text Abstand unten', 'rng-texty', 'val-texty', 2, 50, 0.5, 9) +
        rangeRow('Text Block Breite', 'rng-textw', 'val-textw', 30, 90, 1, 54) +
        rangeRow('Logo Größe', 'rng-logo', 'val-logo', 6, 22, 0.5, 13) +
        '<div><label class="tn-ctrl-label">Logo Seite</label><select class="tn-ctrl-select" id="inp-logoside"><option value="right">Rechts</option><option value="left">Links</option></select></div>' +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-colors">' +
      '<div class="tn-section-head" data-sec="sec-colors"><span class="tn-section-title">Farben</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        colorRow('Akzent (Orange)', 'accent', '#EC6A37') +
        colorRow('Haupttext', 'text', '#FFFFFF') +
        colorRow('Dunkel (Overlay)', 'dark', '#201C17') +
        '<div><label class="tn-ctrl-label">Akzent-Bars (oben/unten)</label><select class="tn-ctrl-select" id="inp-bars">' +
          '<option value="both">Beide sichtbar</option><option value="top">Nur oben</option><option value="bottom">Nur unten</option><option value="none">Keine</option>' +
        '</select></div>' +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-photo">' +
      '<div class="tn-section-head" data-sec="sec-photo"><span class="tn-section-title">Foto & Overlay</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Hintergrundfoto</label><div class="tn-upload-zone" id="tn-bg-zone">Klicken zum Hochladen · JPG / PNG</div><input type="file" id="file-bg" accept="image/*" hidden></div>' +
        rangeRow('Foto Helligkeit', 'rng-bright', 'val-bright', 0, 100, 1, 38) +
        rangeRow('Foto Sättigung', 'rng-sat', 'val-sat', 0, 150, 1, 50) +
        '<div><label class="tn-ctrl-label">Foto Position Y</label><select class="tn-ctrl-select" id="inp-bgpos">' +
          '<option value="20%">Oben (20%)</option><option value="50%">Mitte (50%)</option><option value="top">Ganz oben</option><option value="bottom">Ganz unten</option>' +
        '</select></div>' +
        rangeRow('Overlay Deckkraft (links)', 'rng-overlay', 'val-overlay', 0, 100, 1, 92) +
        rangeRow('Overlay Reichweite', 'rng-ovreach', 'val-ovreach', 20, 100, 1, 42) +
        '<div><label class="tn-ctrl-label">Logo Datei</label><div class="tn-upload-zone" id="tn-logo-zone">Klicken zum Hochladen · PNG</div><input type="file" id="file-logo" accept="image/*" hidden></div>' +
      '</div></div>';

  sidebar.querySelectorAll('.tn-section-head').forEach(function(head) {
    head.addEventListener('click', function() { toggleTnSection(head.dataset.sec); });
  });
  sidebar.querySelectorAll('[data-preset]').forEach(function(btn) {
    btn.addEventListener('click', function() { applyPreset(parseInt(btn.dataset.preset, 10)); });
  });

  $('inp-ep').addEventListener('input', function() { updateEp(this.value); });
  $('inp-hl').addEventListener('input', updateHeadline);
  $('inp-kw').addEventListener('input', updateHeadline);
  $('inp-kwpos').addEventListener('change', updateHeadline);
  $('inp-sl').addEventListener('input', function() { updateSubline(this.value); });
  $('rng-hlsize').addEventListener('input', function() { updateHlSize(this.value); });
  $('rng-slsize').addEventListener('input', function() { updateSlSize(this.value); });
  $('rng-epsize').addEventListener('input', function() { updateEpSize(this.value); });
  $('rng-textx').addEventListener('input', updateTextPos);
  $('rng-texty').addEventListener('input', updateTextPos);
  $('rng-textw').addEventListener('input', updateTextPos);
  $('rng-logo').addEventListener('input', function() { updateLogoSize(this.value); });
  $('inp-logoside').addEventListener('change', function() { updateLogoSide(this.value); });
  $('inp-bars').addEventListener('change', function() { updateBars(this.value); });
  $('rng-bright').addEventListener('input', updatePhotoFilter);
  $('rng-sat').addEventListener('input', updatePhotoFilter);
  $('inp-bgpos').addEventListener('change', function() { $('tn-bg').style.objectPosition = 'center ' + this.value; });
  $('rng-overlay').addEventListener('input', updateOverlay);
  $('rng-ovreach').addEventListener('input', updateOverlay);
  $('tn-bg-zone').addEventListener('click', function() { $('file-bg').click(); });
  $('file-bg').addEventListener('change', function() { loadBg(this); });
  $('tn-logo-zone').addEventListener('click', function() { $('file-logo').click(); });
  $('file-logo').addEventListener('change', function() { loadLogo(this); });

  ['accent', 'text', 'dark'].forEach(function(name) {
    const picker = $('color-' + name);
    const hex = $('hex-' + name);
    if (picker) picker.addEventListener('input', function() { updateColor(name, this.value, 'hex-' + name); });
    if (hex) hex.addEventListener('input', function() { updateColorFromHex(name, this.value); });
  });
}

function rangeRow(label, rngId, valId, min, max, step, val) {
  return '<div><label class="tn-ctrl-label">' + label + '</label><div class="tn-range-wrap">' +
    '<input type="range" class="tn-range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" id="' + rngId + '">' +
    '<span class="tn-range-val" id="' + valId + '">' + val + '%</span></div></div>';
}

function colorRow(label, name, defaultHex) {
  return '<div><label class="tn-ctrl-label">' + label + '</label><div class="tn-color-wrap">' +
    '<input type="color" class="tn-color" value="' + defaultHex + '" id="color-' + name + '">' +
    '<input class="tn-color-hex" id="hex-' + name + '" value="' + defaultHex + '"></div></div>';
}

export function initThumbnailEditor() {
  if (_inited) {
    applyFontSizes();
    return;
  }
  _inited = true;

  document.documentElement.style.setProperty('--tn-accent', '#EC6A37');
  document.documentElement.style.setProperty('--tn-text', '#FFFFFF');
  document.documentElement.style.setProperty('--tn-dark', '#201C17');
  darkRgb = hexToRgb('#201C17');

  buildSidebar();
  $('tn-logo-img').src = RAIS_LOGO;
  $('tn-export-btn').addEventListener('click', openTnExportModal);

  applyPreset(0);
  updateTextPos();
  updateLogoSize(13);
  updateOverlay();
  updatePhotoFilter();
  updateBars('both');

  window.addEventListener('resize', applyFontSizes);
  applyFontSizes();
}
