import { CC_KEY } from './state.js';
import { td } from './utils.js';

function loadCalls() {
  try { return JSON.parse(localStorage.getItem(CC_KEY)) || {}; } catch(e) { return {}; }
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return t.getUTCFullYear() + '-W' + Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(),0,1))) / 86400000) + 1) / 7);
}

export function bumpCall() {
  const calls = loadCalls();
  const today = td(); const week = isoWeek(new Date());
  calls[today] = (calls[today] || 0) + 1;
  calls['w:' + week] = (calls['w:' + week] || 0) + 1;
  localStorage.setItem(CC_KEY, JSON.stringify(calls));
  renderCalls();
}

export function resetCallCount() {
  if (!confirm('Anruf-Zähler zurücksetzen?')) return;
  localStorage.removeItem(CC_KEY); renderCalls();
}

export function renderCalls() {
  const calls = loadCalls();
  const today = td(); const week = isoWeek(new Date());
  const ct = document.getElementById('callToday'); if (ct) ct.textContent = calls[today] || 0;
  const cw = document.getElementById('callWeek');  if (cw) cw.textContent = calls['w:' + week] || 0;
}
