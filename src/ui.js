import { STATUS } from './state.js';
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
