import { sbUpsert } from './supabase.js';
import { toast } from './ui.js';
import { td } from './utils.js';

const SB_TODOS = '/rest/v1/tracker_todos';

// ── Demo Termin Todo-Popup ─────────────────────────────────────────────────

export function showDemoTodoPopup(contact) {
  const pop = document.getElementById('demotodo-pop');
  if (!pop) return;

  const followup = contact.followup || '';
  const firma = contact.firma || '';

  // Pre-fill title inputs
  const t1 = document.getElementById('dt-title1');
  const t2 = document.getElementById('dt-title2');
  const d1 = document.getElementById('dt-date1');
  const d2 = document.getElementById('dt-date2');

  if (t1) t1.value = 'Sales Call – ' + firma;
  if (t2) t2.value = 'Demo vorbereiten – ' + firma;

  // date1 = followup date, date2 = day before
  if (d1) d1.value = followup;
  if (d2 && followup) {
    const prev = new Date(followup);
    prev.setDate(prev.getDate() - 1);
    d2.value = prev.toISOString().slice(0, 10);
  } else if (d2) {
    d2.value = followup;
  }

  const timeEl = document.getElementById('dt-time1');
  if (timeEl) timeEl.value = '';

  pop.classList.add('on');
}

export async function saveDemoTodos() {
  const title1 = (document.getElementById('dt-title1').value || '').trim();
  const title2 = (document.getElementById('dt-title2').value || '').trim();
  const date1  = document.getElementById('dt-date1').value || null;
  const date2  = document.getElementById('dt-date2').value || null;
  const time1  = document.getElementById('dt-time1').value || null;

  if (!title1 && !title2) { toast('Bitte mindestens einen Titel eingeben.'); return; }

  const todos = [];
  if (title1) todos.push({ title: title1, due_date: date1, due_time: time1, category: 'business', relevance: 'high', done: false });
  if (title2) todos.push({ title: title2, due_date: date2, due_time: null, category: 'business', relevance: 'high', done: false });

  try {
    await sbUpsert(SB_TODOS, todos);
    toast('&#128203; ' + todos.length + ' Todo(s) im Tracker gespeichert.');
    closeDemoTodoPop();
  } catch(e) {
    toast('Fehler beim Speichern: ' + e.message);
  }
}

export function closeDemoTodoPop() {
  const pop = document.getElementById('demotodo-pop');
  if (pop) pop.classList.remove('on');
}

// ── Schnelltodo Button (global) ────────────────────────────────────────────

export function openQuickTodo() {
  const pop = document.getElementById('quicktodo-pop');
  if (!pop) return;
  document.getElementById('qt-title').value = '';
  document.getElementById('qt-date').value  = td();
  document.getElementById('qt-time').value  = '';
  document.getElementById('qt-rel').value   = 'high';
  document.getElementById('qt-cat').value   = 'business';
  pop.classList.add('on');
  setTimeout(function() { document.getElementById('qt-title').focus(); }, 50);
}

export async function saveQuickTodo() {
  const title = (document.getElementById('qt-title').value || '').trim();
  if (!title) { toast('Titel fehlt.'); return; }
  const row = {
    title:    title,
    due_date: document.getElementById('qt-date').value || null,
    due_time: document.getElementById('qt-time').value || null,
    relevance:document.getElementById('qt-rel').value,
    category: document.getElementById('qt-cat').value,
    done:     false,
  };
  try {
    await sbUpsert(SB_TODOS, [row]);
    toast('&#128203; Todo gespeichert.');
    closeQuickTodo();
  } catch(e) {
    toast('Fehler: ' + e.message);
  }
}

export function closeQuickTodo() {
  const pop = document.getElementById('quicktodo-pop');
  if (pop) pop.classList.remove('on');
}
