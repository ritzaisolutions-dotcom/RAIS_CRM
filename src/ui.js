import { STATUS, LEAD_ORIGIN, LEAD_TEMP } from './state.js';
import { td } from './utils.js';

export function sbadge(s) {
  const st = STATUS[s] || { cls: 'b-neu', label: s || 'Neu' };
  return '<span class="badge ' + st.cls + '">' + st.label + '</span>';
}

export function roib(n) {
  if (!n) return '<span class="roi r0">—</span>';
  const c = n >= 3 ? 'r3' : n >= 2 ? 'r2' : 'r1';
  return '<span class="roi ' + c + '">' + n + '</span>';
}

export function fdc(d) {
  if (!d) return '<span style="color:#ccc;font-family:sans-serif;font-size:12px">—</span>';
  const t = td();
  if (d < t)  return '<span class="fd fdov">&#9888; ' + d + '</span>';
  if (d === t) return '<span class="fd fdtd">&#128222; Heute</span>';
  return '<span class="fd fdup">' + d + '</span>';
}

export function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Escape für JS-String-Literale in HTML-Attributen (onclick etc.). */
export function escJs(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c');
}

export function ir(l, v) {
  return '<div class="ir"><span class="il">' + l + '</span><div class="iv">' + v + '</div></div>';
}

export function toast(m) {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('on'); }, 2600);
}

export function originBadge(origin) {
  const o = LEAD_ORIGIN[origin] || LEAD_ORIGIN.manual;
  return '<span class="badge origin-badge ' + o.cls + '">' + o.label + '</span>';
}

export function tempBadge(temp) {
  const label = LEAD_TEMP[temp] || temp || '—';
  const cls = temp === 'hot' ? 'temp-hot' : temp === 'warm' ? 'temp-warm' : 'temp-cold';
  return '<span class="badge temp-badge ' + cls + '">' + label + '</span>';
}

function socialHref(key, url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('mailto:') || u.startsWith('tel:')) return u;
  if (key === 'whatsapp') return 'https://wa.me/' + u.replace(/\D/g, '');
  return 'https://' + u.replace(/^\/\//, '');
}

const SOCIAL_META = {
  linkedin: { icon: 'in', title: 'LinkedIn' },
  instagram: { icon: 'ig', title: 'Instagram' },
  x: { icon: '𝕏', title: 'X' },
  facebook: { icon: 'fb', title: 'Facebook' },
  whatsapp: { icon: 'wa', title: 'WhatsApp' },
};

export function socialIconsHtml(socials, large) {
  socials = socials || {};
  const keys = ['linkedin', 'instagram', 'x', 'facebook', 'whatsapp'];
  const parts = keys.filter(function(k) { return socials[k]; }).map(function(k) {
    const m = SOCIAL_META[k];
    const href = socialHref(k, socials[k]);
    return '<a class="soc-icon' + (large ? ' soc-lg' : '') + '" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + m.title + '" onclick="event.stopPropagation()">' + m.icon + '</a>';
  });
  return parts.length ? '<span class="soc-row">' + parts.join('') + '</span>' : '';
}
