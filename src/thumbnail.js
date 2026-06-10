/** Content Thumbnail Editor — lazy-init from Content sub-tab */

import { toast } from './ui.js';

const TN_STORAGE_KEY = 'rais_tn_state';
const TN_EXPORT_W = 1280;
const TN_EXPORT_H = 720;
const DEFAULT_BG = './0610.png';

const BRAND_SWATCHES = [
  { label: 'Orange', hex: '#EC6A37', target: 'accent' },
  { label: 'Sage', hex: '#789464', target: 'subline' },
  { label: 'Pistachio', hex: '#3C5A2A', target: 'subline' },
  { label: 'Charcoal', hex: '#2F2A24', target: 'headline' },
  { label: 'Stone', hex: '#7B746B', target: 'subline' },
  { label: 'Cloud', hex: '#F5F2EC', target: 'linen' },
];

const PRESETS = [
  {
    label: 'Studio',
    ep: 'VIDEO',
    hl: 'Deine Headline\nhier',
    kw: '',
    sl: 'Untertitel · Thema',
    kwpos: 'hidden',
    overlaySide: 'right',
    textAlign: 'right',
    panelMode: true,
    overlayOpacity: 75,
    overlayReach: 62,
    textX: 48,
    textY: 12,
    textW: 48,
    headlineColor: '#2F2A24',
    sublineColor: '#789464',
    accentColor: '#EC6A37',
    bars: 'none',
  },
  {
    label: 'Dunkel Akzent',
    ep: 'NEU',
    hl: 'Das musst du\nwissen',
    kw: 'jetzt',
    sl: 'Kurz erklärt · Schritt für Schritt',
    kwpos: 'after',
    overlaySide: 'right',
    textAlign: 'right',
    panelMode: false,
    overlayOpacity: 55,
    overlayReach: 55,
    textX: 50,
    textY: 14,
    textW: 46,
    headlineColor: '#2F2A24',
    sublineColor: '#3C5A2A',
    accentColor: '#EC6A37',
    bars: 'top',
  },
  {
    label: 'Sage Editorial',
    ep: 'TIP',
    hl: 'So funktioniert\ndas',
    kw: '',
    sl: 'Praxisnah · ohne Fachchinesisch',
    kwpos: 'hidden',
    overlaySide: 'right',
    textAlign: 'right',
    panelMode: true,
    overlayOpacity: 82,
    overlayReach: 58,
    textX: 46,
    textY: 10,
    textW: 50,
    headlineColor: '#2F2A24',
    sublineColor: '#7B746B',
    accentColor: '#789464',
    bars: 'none',
  },
];

const TN_DEFAULTS = {
  headline: 'Deine Headline hier',
  subline: 'Untertitel · Thema',
  ep: 'VIDEO',
  kw: '',
  kwpos: 'hidden',
  headlineColor: '#2F2A24',
  sublineColor: '#789464',
  accentColor: '#EC6A37',
  linenColor: '#FBF8F3',
  cloudColor: '#F5F2EC',
  overlaySide: 'right',
  textAlign: 'right',
  panelMode: true,
  overlayOpacity: 75,
  overlayReach: 62,
  textX: 48,
  textY: 12,
  textW: 48,
  hlSizePct: 3.2,
  slSizePct: 1.6,
  epSizePct: 1.3,
  bright: 100,
  sat: 100,
  bgPos: '50%',
  bars: 'none',
  bgImage: DEFAULT_BG,
  textPos: 'right',
};

let _inited = false;
let _persistTimer = null;
let linenRgb = { r: 251, g: 248, b: 243 };
let cloudRgb = { r: 245, g: 242, b: 236 };

function $(id) { return document.getElementById(id); }

function hexToRgb(hex) {
  const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return { r: 251, g: 248, b: 243 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgba(hexOrRgb, alpha) {
  const c = typeof hexOrRgb === 'string' ? hexToRgb(hexOrRgb) : hexOrRgb;
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

function getState() {
  const s = {};
  Object.keys(TN_DEFAULTS).forEach(function(k) { s[k] = TN_DEFAULTS[k]; });
  try {
    const raw = localStorage.getItem(TN_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.keys(saved).forEach(function(k) {
        if (k.indexOf('logo') === 0) return;
        if (Object.prototype.hasOwnProperty.call(TN_DEFAULTS, k)) s[k] = saved[k];
      });
    }
  } catch (e) { /* ignore */ }
  if (!s.bgImage) s.bgImage = DEFAULT_BG;
  return s;
}

let tnState = getState();

function schedulePersist() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(function() {
    try { localStorage.setItem(TN_STORAGE_KEY, JSON.stringify(tnState)); } catch (e) { /* ignore */ }
  }, 300);
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
  if (hl) hl.style.fontSize = (w * tnState.hlSizePct / 100) + 'px';
  if (sl) sl.style.fontSize = (w * tnState.slSizePct / 100) + 'px';
  if (ep) ep.style.fontSize = (w * tnState.epSizePct / 100) + 'px';
}

function applyTextLayout() {
  const el = $('tn-text');
  const preview = $('tn-preview');
  if (!el || !preview) return;

  el.style.left = tnState.textX + '%';
  el.style.bottom = tnState.textY + '%';
  el.style.width = tnState.textW + '%';

  el.classList.remove('tn-text--left', 'tn-text--right', 'tn-text--center', 'tn-text--panel');
  el.classList.add('tn-text--' + tnState.textAlign);
  if (tnState.panelMode) el.classList.add('tn-text--panel');

  const overlay = $('tn-overlay');
  if (overlay) {
    overlay.classList.remove('tn-overlay--left', 'tn-overlay--right');
    overlay.classList.add('tn-overlay--' + tnState.overlaySide);
  }

  const rule = $('tn-rule');
  if (rule) {
    rule.style.display = tnState.textAlign === 'center' ? 'none' : 'block';
    if (tnState.textAlign === 'right') {
      rule.style.marginLeft = 'auto';
      rule.style.marginRight = '0';
    } else if (tnState.textAlign === 'left') {
      rule.style.marginLeft = '0';
      rule.style.marginRight = 'auto';
    }
  }
}

function syncControlsFromState() {
  const map = {
    'inp-ep': 'ep',
    'inp-hl': 'headline',
    'inp-kw': 'kw',
    'inp-sl': 'subline',
    'inp-kwpos': 'kwpos',
    'inp-textpos': 'textPos',
    'inp-panel': 'panelMode',
    'inp-bars': 'bars',
    'inp-bgpos': 'bgPos',
  };
  Object.keys(map).forEach(function(id) {
    const el = $(id);
    if (!el) return;
    const key = map[id];
    if (el.type === 'checkbox') el.checked = !!tnState[key];
    else el.value = tnState[key];
  });

  const ranges = {
    'rng-hlsize': 'hlSizePct', 'rng-slsize': 'slSizePct', 'rng-epsize': 'epSizePct',
    'rng-textx': 'textX', 'rng-texty': 'textY', 'rng-textw': 'textW',
    'rng-bright': 'bright', 'rng-sat': 'sat',
    'rng-overlay': 'overlayOpacity', 'rng-ovreach': 'overlayReach',
  };
  Object.keys(ranges).forEach(function(id) {
    const el = $(id);
    if (el) el.value = tnState[ranges[id]];
  });

  const colors = { accent: 'accentColor', headline: 'headlineColor', subline: 'sublineColor', linen: 'linenColor' };
  Object.keys(colors).forEach(function(name) {
    const picker = $('color-' + name);
    const hex = $('hex-' + name);
    const val = tnState[colors[name]];
    if (picker) picker.value = val;
    if (hex) hex.value = val;
  });

  updateRangeLabels();
}

function updateRangeLabels() {
  const labels = {
    'val-hlsize': tnState.hlSizePct + '%',
    'val-slsize': tnState.slSizePct + '%',
    'val-epsize': tnState.epSizePct + '%',
    'val-textx': tnState.textX + '%',
    'val-texty': tnState.textY + '%',
    'val-textw': tnState.textW + '%',
    'val-bright': tnState.bright + '%',
    'val-sat': tnState.sat + '%',
    'val-overlay': tnState.overlayOpacity + '%',
    'val-ovreach': tnState.overlayReach + '%',
  };
  Object.keys(labels).forEach(function(id) {
    const el = $(id);
    if (el) el.textContent = labels[id];
  });
}

function applyBrandCssVars() {
  document.documentElement.style.setProperty('--tn-accent', tnState.accentColor);
  document.documentElement.style.setProperty('--tn-headline', tnState.headlineColor);
  document.documentElement.style.setProperty('--tn-subline', tnState.sublineColor);
  document.documentElement.style.setProperty('--tn-linen', tnState.linenColor);
  document.documentElement.style.setProperty('--tn-cloud', tnState.cloudColor);
  linenRgb = hexToRgb(tnState.linenColor);
  cloudRgb = hexToRgb(tnState.cloudColor);
}

function updateColor(varName, hex, hexInputId) {
  const map = { accent: 'accentColor', headline: 'headlineColor', subline: 'sublineColor', linen: 'linenColor' };
  if (map[varName]) tnState[map[varName]] = hex;
  if (varName === 'linen') {
    tnState.linenColor = hex;
    linenRgb = hexToRgb(hex);
  }
  document.documentElement.style.setProperty('--tn-' + varName, hex);
  if (hexInputId && $(hexInputId)) $(hexInputId).value = hex;
  applyBrandCssVars();
  updateOverlay();
  schedulePersist();
}

function updateColorFromHex(varName, val) {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) updateColor(varName, val, 'hex-' + varName);
}

function applySwatch(target, hex) {
  updateColor(target, hex, 'hex-' + target);
  const picker = $('color-' + target);
  if (picker) picker.value = hex;
}

function updateBars(v) {
  tnState.bars = v;
  $('tn-bar-top').style.display = (v === 'both' || v === 'top') ? 'block' : 'none';
  $('tn-bar-bottom').style.display = (v === 'both' || v === 'bottom') ? 'block' : 'none';
  schedulePersist();
}

function updatePhotoFilter() {
  $('tn-bg').style.filter = 'brightness(' + (tnState.bright / 100) + ') saturate(' + (tnState.sat / 100) + ')';
}

function updateOverlay() {
  const op = tnState.overlayOpacity / 100;
  const reach = tnState.overlayReach;
  const reach2 = Math.min(reach + 28, 100);
  const mid = rgba(linenRgb, op * 0.65);
  const full = rgba(cloudRgb, op * 0.92);
  const overlay = $('tn-overlay');
  if (!overlay) return;

  if (tnState.overlaySide === 'right') {
    overlay.style.background =
      'linear-gradient(90deg, transparent 0%, transparent ' + (reach - 18) + '%, ' +
      mid + ' ' + reach + '%, ' + full + ' ' + reach2 + '%, ' + full + ' 100%)';
  } else {
    overlay.style.background =
      'linear-gradient(270deg, transparent 0%, transparent ' + (reach - 18) + '%, ' +
      mid + ' ' + reach + '%, ' + full + ' ' + reach2 + '%, ' + full + ' 100%)';
  }
}

function applyTextPosPreset(pos) {
  tnState.textPos = pos;
  if (pos === 'right') {
    tnState.overlaySide = 'right';
    tnState.textAlign = 'right';
    tnState.textX = 48;
    tnState.textW = 48;
  } else if (pos === 'left') {
    tnState.overlaySide = 'left';
    tnState.textAlign = 'left';
    tnState.textX = 3.5;
    tnState.textW = 54;
  } else {
    tnState.overlaySide = 'right';
    tnState.textAlign = 'center';
    tnState.textX = 26;
    tnState.textW = 48;
  }
  syncControlsFromState();
  applyTextLayout();
  updateOverlay();
  schedulePersist();
}

function updateEp(v) {
  tnState.ep = v;
  $('tn-ep').textContent = v;
  schedulePersist();
}

function updateHeadline() {
  tnState.headline = $('inp-hl').value;
  tnState.kw = $('inp-kw').value;
  tnState.kwpos = $('inp-kwpos').value;
  renderHeadline(tnState.headline, tnState.kw, tnState.kwpos);
  applyFontSizes();
  schedulePersist();
}

function updateSubline(v) {
  tnState.subline = v;
  $('tn-subline').textContent = v;
  schedulePersist();
}

function applyPreset(n) {
  const p = PRESETS[n];
  if (!p) return;
  Object.keys(p).forEach(function(k) {
    if (k !== 'label') tnState[k] = p[k];
  });
  tnState.textPos = p.textAlign === 'left' ? 'left' : (p.textAlign === 'center' ? 'center' : 'right');
  $('tn-preset-label').textContent = p.label + ' aktiv';
  applyBrandCssVars();
  syncControlsFromState();
  updateEp(tnState.ep);
  updateSubline(tnState.subline);
  updateHeadline();
  applyTextLayout();
  updateOverlay();
  updatePhotoFilter();
  updateBars(tnState.bars);
  schedulePersist();
}

function loadBg(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  tnState.bgImage = url;
  $('tn-bg').src = url;
  schedulePersist();
}

function applyBgImage() {
  const bg = $('tn-bg');
  if (!bg) return;
  if (tnState.bgImage) bg.src = tnState.bgImage;
  bg.style.objectPosition = 'center ' + tnState.bgPos;
}

export function openTnExportModal() {
  $('tnExportModal').classList.add('on');
}

export function closeTnExportModal() {
  $('tnExportModal').classList.remove('on');
}

function loadImageForExport(src) {
  return new Promise(function(resolve, reject) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Bild konnte nicht geladen werden')); };
    img.src = src;
  });
}

function drawCoverImage(ctx, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let sw, sh, sx, sy;
  if (ir > cr) {
    sh = img.height;
    sw = sh * cr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / cr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  const bgPos = String(tnState.bgPos);
  if (bgPos === 'top' || bgPos === '20%') sy = 0;
  else if (bgPos === 'bottom') sy = img.height - sh;
  else if (bgPos === '50%') sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function wrapCanvasLines(ctx, text, maxWidth) {
  const lines = [];
  text.split('\n').forEach(function(paragraph) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = words[i];
      } else line = test;
    }
    lines.push(line);
  });
  return lines;
}

async function ensureSyneLoaded() {
  if (!document.fonts || !document.fonts.load) return;
  await Promise.all([
    document.fonts.load('800 64px Syne'),
    document.fonts.load('600 32px Syne'),
    document.fonts.load('700 24px Syne'),
  ]).catch(function() { /* fallback */ });
  await document.fonts.ready;
}

export async function exportTnPng() {
  const src = $('tn-bg') && $('tn-bg').src;
  if (!src) {
    toast('Bitte zuerst ein Hintergrundfoto laden.');
    return;
  }
  try {
    await ensureSyneLoaded();
    const img = await loadImageForExport(src);
    const canvas = document.createElement('canvas');
    canvas.width = TN_EXPORT_W;
    canvas.height = TN_EXPORT_H;
    const ctx = canvas.getContext('2d');
    const w = TN_EXPORT_W;
    const h = TN_EXPORT_H;

    ctx.filter = 'brightness(' + (tnState.bright / 100) + ') saturate(' + (tnState.sat / 100) + ')';
    drawCoverImage(ctx, img, w, h);
    ctx.filter = 'none';

    const op = tnState.overlayOpacity / 100;
    const reach = tnState.overlayReach / 100;
    const reach2 = Math.min(reach + 0.28, 1);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (tnState.overlaySide === 'right') {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(Math.max(0, reach - 0.18), 'rgba(0,0,0,0)');
      grad.addColorStop(reach, rgba(linenRgb, op * 0.65));
      grad.addColorStop(reach2, rgba(cloudRgb, op * 0.92));
      grad.addColorStop(1, rgba(cloudRgb, op * 0.92));
    } else {
      grad.addColorStop(0, rgba(cloudRgb, op * 0.92));
      grad.addColorStop(1 - reach2, rgba(cloudRgb, op * 0.92));
      grad.addColorStop(1 - reach, rgba(linenRgb, op * 0.65));
      grad.addColorStop(1 - Math.max(0, reach - 0.18), 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const textX = tnState.textX / 100 * w;
    const textY = h - (tnState.textY / 100 * h);
    const textW = tnState.textW / 100 * w;
    const pad = Math.round(w * 0.04);
    let boxX = textX;
    let boxW = textW;

    const hlSize = Math.round(w * tnState.hlSizePct / 100);
    const slSize = Math.round(w * tnState.slSizePct / 100);
    const epSize = Math.round(w * tnState.epSizePct / 100);

    ctx.font = '800 ' + hlSize + 'px Syne, system-ui, sans-serif';
    const hlLines = wrapCanvasLines(ctx, tnState.headline, textW - pad * 2);
    const slLines = tnState.subline ? [tnState.subline] : [];
    const lineH = hlSize * 1.15;
    const slLineH = slSize * 1.4;
    const ruleH = Math.max(4, Math.round(w * 0.005));
    const contentH = ruleH + 8 + hlLines.length * lineH + (slLines.length ? 12 + slLines.length * slLineH : 0);

    if (tnState.panelMode) {
      const panelPad = pad;
      let panelX = boxX;
      if (tnState.textAlign === 'right') panelX = textX + textW - (textW - panelPad);
      else if (tnState.textAlign === 'center') panelX = textX + (textW - textW) / 2;
      const panelW = textW;
      const panelH = contentH + panelPad * 2;
      const panelY = textY - panelH;
      ctx.fillStyle = rgba(linenRgb, 0.88);
      ctx.strokeStyle = 'rgba(217,209,199,0.9)';
      ctx.lineWidth = 2;
      roundRect(ctx, panelX, panelY, panelW, panelH, 12);
      ctx.fill();
      ctx.stroke();
    }

    if (tnState.bars === 'both' || tnState.bars === 'top') {
      ctx.fillStyle = tnState.accentColor;
      ctx.fillRect(0, 0, w, 4);
    }
    if (tnState.bars === 'both' || tnState.bars === 'bottom') {
      ctx.fillStyle = tnState.accentColor;
      ctx.fillRect(0, h - 4, w, 4);
    }

    if (tnState.ep) {
      ctx.font = '800 ' + epSize + 'px Syne, system-ui, sans-serif';
      const epPadX = Math.round(epSize * 0.5);
      const epPadY = Math.round(epSize * 0.25);
      const epW = ctx.measureText(tnState.ep).width + epPadX * 2;
      const epH = epSize + epPadY * 2;
      const epX = Math.round(w * 0.035);
      const epY = Math.round(h * 0.06);
      ctx.fillStyle = tnState.accentColor;
      ctx.fillRect(epX, epY, epW, epH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(tnState.ep, epX + epPadX, epY + epH - epPadY - 2);
    }

    let y = textY - (slLines.length ? slLines.length * slLineH + 12 : 0) - hlLines.length * lineH - ruleH - 8;
    const align = tnState.textAlign;

    ctx.fillStyle = tnState.accentColor;
    const ruleW = Math.round(w * 0.06);
    let ruleX = textX;
    if (align === 'right') ruleX = textX + textW - ruleW - pad;
    else if (align === 'center') ruleX = textX + (textW - ruleW) / 2;
    else ruleX = textX + pad;
    if (align !== 'center') ctx.fillRect(ruleX, y, ruleW, ruleH);
    y += ruleH + 8;

    ctx.font = '800 ' + hlSize + 'px Syne, system-ui, sans-serif';
    ctx.fillStyle = tnState.headlineColor;
    ctx.textBaseline = 'top';
    hlLines.forEach(function(line, i) {
      let x = textX + pad;
      const tw = ctx.measureText(line).width;
      if (align === 'right') x = textX + textW - tw - pad;
      else if (align === 'center') x = textX + (textW - tw) / 2;
      ctx.fillText(line, x, y + i * lineH);
    });

    if (tnState.kw && tnState.kwpos !== 'hidden') {
      const kwY = y + hlLines.length * lineH;
      ctx.fillStyle = tnState.accentColor;
      let kx = textX + pad;
      const ktw = ctx.measureText(tnState.kw).width;
      if (align === 'right') kx = textX + textW - ktw - pad;
      else if (align === 'center') kx = textX + (textW - ktw) / 2;
      ctx.fillText(tnState.kw, kx, kwY);
    }

    if (slLines.length) {
      ctx.font = '600 ' + slSize + 'px Syne, system-ui, sans-serif';
      ctx.fillStyle = tnState.sublineColor;
      const sy = y + hlLines.length * lineH + (tnState.kw && tnState.kwpos === 'after' ? lineH : 0) + 12;
      slLines.forEach(function(line, i) {
        let x = textX + pad;
        const tw = ctx.measureText(line).width;
        if (align === 'right') x = textX + textW - tw - pad;
        else if (align === 'center') x = textX + (textW - tw) / 2;
        ctx.fillText(line, x, sy + i * slLineH);
      });
    }

    canvas.toBlob(function(blob) {
      if (!blob) {
        toast('PNG-Export fehlgeschlagen.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'thumbnail-1280x720.png';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Thumbnail als PNG gespeichert.');
      closeTnExportModal();
    }, 'image/png');
  } catch (e) {
    toast('Export fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'));
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function buildSidebar() {
  const sidebar = $('tn-sidebar');
  if (!sidebar || sidebar.dataset.built) return;
  sidebar.dataset.built = '1';

  const swatchHtml = BRAND_SWATCHES.map(function(s) {
    return '<button type="button" class="tn-swatch" data-target="' + s.target + '" data-hex="' + s.hex + '" ' +
      'title="' + s.label + '" style="background:' + s.hex + '"></button>';
  }).join('');

  sidebar.innerHTML =
    '<div class="tn-section" id="sec-presets">' +
      '<div class="tn-section-head" data-sec="sec-presets"><span class="tn-section-title">Schnell-Presets</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body"><div class="tn-preset-grid">' +
        PRESETS.map(function(p, i) {
          return '<button type="button" class="tn-preset-btn" data-preset="' + i + '"><strong>' + p.label + '</strong>' + p.sl + '</button>';
        }).join('') +
      '</div></div></div>' +
    '<div class="tn-section" id="sec-export">' +
      '<div class="tn-section-head" data-sec="sec-export"><span class="tn-section-title">Export</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<button type="button" class="btn bp" id="tn-png-btn" style="width:100%">PNG exportieren (1280×720)</button>' +
        '<p class="tn-ctrl-hint">Direkter Download im Zielformat für YouTube.</p>' +
      '</div></div>' +
    '<div class="tn-section" id="sec-text">' +
      '<div class="tn-section-head" data-sec="sec-text"><span class="tn-section-title">Text</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Badge</label><input class="tn-ctrl-input" id="inp-ep"></div>' +
        '<div><label class="tn-ctrl-label">Headline (Zeilenumbruch mit Enter)</label><textarea class="tn-ctrl-textarea" id="inp-hl" rows="2"></textarea></div>' +
        '<div><label class="tn-ctrl-label">Keyword (Akzentfarbe)</label><input class="tn-ctrl-input" id="inp-kw"></div>' +
        '<div><label class="tn-ctrl-label">Subline</label><input class="tn-ctrl-input" id="inp-sl"></div>' +
        '<div><label class="tn-ctrl-label">Keyword Position</label><select class="tn-ctrl-select" id="inp-kwpos">' +
          '<option value="after">Nach Headline (neue Zeile)</option><option value="inline">In Headline integriert</option><option value="hidden">Kein Keyword</option>' +
        '</select></div>' +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-typo">' +
      '<div class="tn-section-head" data-sec="sec-typo"><span class="tn-section-title">Typografie</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        rangeRow('Headline Größe', 'rng-hlsize', 'val-hlsize', 2, 6, 0.1, tnState.hlSizePct) +
        rangeRow('Subline Größe', 'rng-slsize', 'val-slsize', 0.8, 2.5, 0.1, tnState.slSizePct) +
        rangeRow('Badge Größe', 'rng-epsize', 'val-epsize', 0.8, 2, 0.1, tnState.epSizePct) +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-pos">' +
      '<div class="tn-section-head" data-sec="sec-pos"><span class="tn-section-title">Position & Layout</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Textposition</label><select class="tn-ctrl-select" id="inp-textpos">' +
          '<option value="right">Rechts (Presenter links)</option><option value="left">Links</option><option value="center">Mitte</option>' +
        '</select></div>' +
        '<label class="tn-check-label"><input type="checkbox" id="inp-panel" checked> Text-Panel (Linen-Hintergrund)</label>' +
        rangeRow('Text Abstand horizontal', 'rng-textx', 'val-textx', 2, 60, 0.5, tnState.textX) +
        rangeRow('Text Abstand unten', 'rng-texty', 'val-texty', 2, 50, 0.5, tnState.textY) +
        rangeRow('Text Block Breite', 'rng-textw', 'val-textw', 30, 90, 1, tnState.textW) +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-colors">' +
      '<div class="tn-section-head" data-sec="sec-colors"><span class="tn-section-title">Farben (Brand)</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Brand-Palette</label><div class="tn-swatch-row">' + swatchHtml + '</div></div>' +
        colorRow('Akzent', 'accent', tnState.accentColor) +
        colorRow('Headline', 'headline', tnState.headlineColor) +
        colorRow('Subline', 'subline', tnState.sublineColor) +
        colorRow('Panel / Overlay', 'linen', tnState.linenColor) +
        '<div><label class="tn-ctrl-label">Akzent-Bars (oben/unten)</label><select class="tn-ctrl-select" id="inp-bars">' +
          '<option value="none">Keine</option><option value="both">Beide sichtbar</option><option value="top">Nur oben</option><option value="bottom">Nur unten</option>' +
        '</select></div>' +
      '</div></div>' +
    '<div class="tn-section collapsed" id="sec-photo">' +
      '<div class="tn-section-head" data-sec="sec-photo"><span class="tn-section-title">Foto & Overlay</span><span class="tn-section-arrow">▼</span></div>' +
      '<div class="tn-section-body">' +
        '<div><label class="tn-ctrl-label">Hintergrundfoto</label><div class="tn-upload-zone" id="tn-bg-zone">Klicken zum Hochladen · JPG / PNG</div><input type="file" id="file-bg" accept="image/*" hidden></div>' +
        rangeRow('Foto Helligkeit', 'rng-bright', 'val-bright', 50, 150, 1, tnState.bright) +
        rangeRow('Foto Sättigung', 'rng-sat', 'val-sat', 0, 150, 1, tnState.sat) +
        '<div><label class="tn-ctrl-label">Foto Position Y</label><select class="tn-ctrl-select" id="inp-bgpos">' +
          '<option value="20%">Oben (20%)</option><option value="50%">Mitte (50%)</option><option value="top">Ganz oben</option><option value="bottom">Ganz unten</option>' +
        '</select></div>' +
        rangeRow('Overlay Deckkraft', 'rng-overlay', 'val-overlay', 0, 100, 1, tnState.overlayOpacity) +
        rangeRow('Overlay Reichweite', 'rng-ovreach', 'val-ovreach', 20, 100, 1, tnState.overlayReach) +
      '</div></div>';

  sidebar.querySelectorAll('.tn-section-head').forEach(function(head) {
    head.addEventListener('click', function() { toggleTnSection(head.dataset.sec); });
  });
  sidebar.querySelectorAll('[data-preset]').forEach(function(btn) {
    btn.addEventListener('click', function() { applyPreset(parseInt(btn.dataset.preset, 10)); });
  });
  sidebar.querySelectorAll('.tn-swatch').forEach(function(btn) {
    btn.addEventListener('click', function() { applySwatch(btn.dataset.target, btn.dataset.hex); });
  });

  $('tn-png-btn').addEventListener('click', exportTnPng);
  $('inp-ep').addEventListener('input', function() { updateEp(this.value); });
  $('inp-hl').addEventListener('input', updateHeadline);
  $('inp-kw').addEventListener('input', updateHeadline);
  $('inp-kwpos').addEventListener('change', updateHeadline);
  $('inp-sl').addEventListener('input', function() { updateSubline(this.value); });
  $('inp-textpos').addEventListener('change', function() { applyTextPosPreset(this.value); });
  $('inp-panel').addEventListener('change', function() {
    tnState.panelMode = this.checked;
    applyTextLayout();
    schedulePersist();
  });
  $('rng-hlsize').addEventListener('input', function() {
    tnState.hlSizePct = parseFloat(this.value);
    $('val-hlsize').textContent = this.value + '%';
    applyFontSizes();
    schedulePersist();
  });
  $('rng-slsize').addEventListener('input', function() {
    tnState.slSizePct = parseFloat(this.value);
    $('val-slsize').textContent = this.value + '%';
    applyFontSizes();
    schedulePersist();
  });
  $('rng-epsize').addEventListener('input', function() {
    tnState.epSizePct = parseFloat(this.value);
    $('val-epsize').textContent = this.value + '%';
    applyFontSizes();
    schedulePersist();
  });
  $('rng-textx').addEventListener('input', function() {
    tnState.textX = parseFloat(this.value);
    $('val-textx').textContent = this.value + '%';
    applyTextLayout();
    schedulePersist();
  });
  $('rng-texty').addEventListener('input', function() {
    tnState.textY = parseFloat(this.value);
    $('val-texty').textContent = this.value + '%';
    applyTextLayout();
    schedulePersist();
  });
  $('rng-textw').addEventListener('input', function() {
    tnState.textW = parseFloat(this.value);
    $('val-textw').textContent = this.value + '%';
    applyTextLayout();
    schedulePersist();
  });
  $('inp-bars').addEventListener('change', function() { updateBars(this.value); });
  $('rng-bright').addEventListener('input', function() {
    tnState.bright = parseFloat(this.value);
    $('val-bright').textContent = this.value + '%';
    updatePhotoFilter();
    schedulePersist();
  });
  $('rng-sat').addEventListener('input', function() {
    tnState.sat = parseFloat(this.value);
    $('val-sat').textContent = this.value + '%';
    updatePhotoFilter();
    schedulePersist();
  });
  $('inp-bgpos').addEventListener('change', function() {
    tnState.bgPos = this.value;
    $('tn-bg').style.objectPosition = 'center ' + this.value;
    schedulePersist();
  });
  $('rng-overlay').addEventListener('input', function() {
    tnState.overlayOpacity = parseFloat(this.value);
    $('val-overlay').textContent = this.value + '%';
    updateOverlay();
    schedulePersist();
  });
  $('rng-ovreach').addEventListener('input', function() {
    tnState.overlayReach = parseFloat(this.value);
    $('val-ovreach').textContent = this.value + '%';
    updateOverlay();
    schedulePersist();
  });
  $('tn-bg-zone').addEventListener('click', function() { $('file-bg').click(); });
  $('file-bg').addEventListener('change', function() { loadBg(this); });

  ['accent', 'headline', 'subline', 'linen'].forEach(function(name) {
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

  applyBrandCssVars();
  buildSidebar();
  applyBgImage();

  $('tn-export-btn').addEventListener('click', exportTnPng);
  const modalPng = $('tn-modal-png-btn');
  if (modalPng) modalPng.addEventListener('click', exportTnPng);

  if (!localStorage.getItem(TN_STORAGE_KEY)) {
    applyPreset(0);
  } else {
    syncControlsFromState();
    updateEp(tnState.ep);
    updateSubline(tnState.subline);
    renderHeadline(tnState.headline, tnState.kw, tnState.kwpos);
    applyTextLayout();
    updateOverlay();
    updatePhotoFilter();
    updateBars(tnState.bars);
    const presetLabel = $('tn-preset-label');
    if (presetLabel) presetLabel.textContent = 'Eigene Einstellungen';
  }

  window.addEventListener('resize', applyFontSizes);
  applyFontSizes();
}
