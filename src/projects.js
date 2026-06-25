import { S, PRJ_KEY_SB, TODO_KEY_SB, TODO_CATEGORIES } from './state.js';
import { sbGet, sbUpsert, sbDelete } from './supabase.js';
import { esc, toast } from './ui.js';
import { td } from './utils.js';

let _inited = false;

export function todoCategoryLabel(slug) {
  const c = TODO_CATEGORIES.find(function(x) { return x.id === slug; });
  return c ? c.label : (slug || '—');
}

function fillCategorySelect(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = TODO_CATEGORIES.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.label) + '</option>';
  }).join('');
}

window.addEventListener('rais:page-change', function(e) {
  if (e.detail.page === 'projects') initProjectsPage();
});

export async function loadProjects() {
  try {
    const [projects, todos] = await Promise.all([
      sbGet(PRJ_KEY_SB + '?select=*&order=created.asc'),
      sbGet(TODO_KEY_SB + '?select=*&order=due_date.asc.nullslast,created.asc'),
    ]);
    S.projects = projects || [];
    S.todos = todos || [];
    return S.projects;
  } catch (e) {
    toast('Projekte laden fehlgeschlagen: ' + e.message);
    S.projects = [];
    S.todos = [];
    return [];
  }
}

export function initProjectsPage() {
  if (!_inited) {
    _inited = true;
  }
  loadProjects().then(renderProjectsPage);
}

export function renderProjectsPage() {
  const root = document.getElementById('projects-root');
  if (!root) return;

  const projects = S.projects || [];
  const todos = S.todos || [];
  const openTodos = todos.filter(function(t) { return !t.done; });

  let html = '<div class="tb"><button class="btn bp" onclick="openProjectAdd()">+ Projekt</button>' +
    '<button class="btn bs" onclick="openTodoAdd()">+ To-do</button></div>';

  html += '<div class="dash-grid">';
  projects.forEach(function(p) {
    const ptodos = todos.filter(function(t) { return t.project_id === p.id; });
    const done = ptodos.filter(function(t) { return t.done; }).length;
    const pct = ptodos.length ? Math.round((done / ptodos.length) * 100) : (p.progress_pct || 0);
    html += '<section class="dash-card proj-card" data-id="' + p.id + '">' +
      '<div class="proj-card-head">' +
        '<h3 class="proj-card-title">' + esc(p.name) + '</h3>' +
        '<div class="proj-card-actions">' +
          '<button class="btn bg bsm" onclick="openProjectEdit(\'' + p.id + '\')" title="Bearbeiten">✎</button>' +
          '<button class="btn bg bsm" onclick="delProject(\'' + p.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
        '</div></div>' +
      '<p style="font-size:12px;color:var(--st);margin:6px 0">' + esc(todoCategoryLabel(p.category)) + ' · ' + esc(p.status || 'aktiv') + '</p>' +
      '<div class="dash-bar-track" style="margin:8px 0"><div class="dash-bar-fill" style="width:' + pct + '%;background:var(--sg)"></div></div>' +
      '<span style="font-size:11px;color:var(--st)">' + pct + '% · ' + done + '/' + ptodos.length + ' To-dos</span>' +
    '</section>';
  });
  html += '</div>';

  html += '<section class="dash-card" style="margin-top:16px"><h3>Offene To-dos</h3>';
  if (!openTodos.length) {
    html += '<p class="dash-empty">Keine offenen To-dos.</p>';
  } else {
    TODO_CATEGORIES.forEach(function(cat) {
      const group = openTodos.filter(function(t) { return t.category === cat.id; });
      if (!group.length) return;
      html += '<h4 class="todo-cat-head">' + esc(cat.label) + '</h4>';
      html += '<ul class="dash-todo-list">' + group.map(function(t) {
        return renderTodoRow(t, projects);
      }).join('') + '</ul>';
    });
    const known = TODO_CATEGORIES.map(function(c) { return c.id; });
    const other = openTodos.filter(function(t) { return !t.category || known.indexOf(t.category) < 0; });
    if (other.length) {
      html += '<h4 class="todo-cat-head">Sonstiges</h4>';
      html += '<ul class="dash-todo-list">' + other.map(function(t) {
        return renderTodoRow(t, projects);
      }).join('') + '</ul>';
    }
  }
  html += '</section>';

  root.innerHTML = html;
}

function renderTodoRow(t, projects) {
  const proj = projects.find(function(p) { return p.id === t.project_id; });
  const meta = (t.due_date ? esc(t.due_date) : '') + (proj ? ' · ' + esc(proj.name) : '');
  return '<li class="dash-todo-item">' +
    '<label class="dash-todo-main"><input type="checkbox" onchange="toggleTodoDone(\'' + t.id + '\', this.checked)"> ' +
    esc(t.title) + '</label>' +
    (meta ? '<span class="dash-todo-meta">' + meta + '</span>' : '<span class="dash-todo-meta"></span>') +
    '<button class="btn bg bsm dash-todo-del" onclick="delTodo(\'' + t.id + '\')" title="Löschen" style="color:var(--rd)">🗑</button>' +
  '</li>';
}

export function openProjectAdd() {
  S.prjEid = null;
  document.getElementById('prjModalTitle').textContent = 'Projekt hinzufügen';
  document.getElementById('prjName').value = '';
  fillCategorySelect('prjCategory', 'rais_sales');
  document.getElementById('prjProgress').value = '0';
  document.getElementById('prjNotiz').value = '';
  document.getElementById('projectModal').classList.add('on');
}

export function openProjectEdit(id) {
  const p = (S.projects || []).find(function(x) { return x.id === id; });
  if (!p) return;
  S.prjEid = id;
  document.getElementById('prjModalTitle').textContent = 'Projekt bearbeiten';
  document.getElementById('prjName').value = p.name || '';
  fillCategorySelect('prjCategory', p.category || 'rais_sales');
  document.getElementById('prjProgress').value = String(p.progress_pct || 0);
  document.getElementById('prjNotiz').value = p.notiz || '';
  document.getElementById('projectModal').classList.add('on');
}

export function closeProjectModal() {
  document.getElementById('projectModal').classList.remove('on');
}

export async function saveProject() {
  const name = document.getElementById('prjName').value.trim();
  if (!name) { toast('Name fehlt.'); return; }
  const row = {
    name: name,
    category: document.getElementById('prjCategory').value,
    status: 'aktiv',
    progress_pct: parseInt(document.getElementById('prjProgress').value, 10) || 0,
    notiz: document.getElementById('prjNotiz').value.trim() || null,
  };
  if (S.prjEid) row.id = S.prjEid;
  try {
    await sbUpsert(PRJ_KEY_SB, [row]);
    await loadProjects();
    closeProjectModal();
    renderProjectsPage();
    toast(S.prjEid ? 'Projekt gespeichert.' : 'Projekt angelegt.');
  } catch (e) {
    toast('Fehler: ' + e.message);
  }
}

export async function delProject(id) {
  if (!confirm('Projekt wirklich löschen?')) return;
  try {
    await sbDelete(PRJ_KEY_SB + '?id=eq.' + id);
    await loadProjects();
    renderProjectsPage();
    toast('Projekt gelöscht.');
  } catch (e) { toast('Fehler: ' + e.message); }
}

export function openTodoAdd() {
  S.todoEid = null;
  document.getElementById('todoModalTitle').textContent = 'To-do hinzufügen';
  document.getElementById('todoTitle').value = '';
  document.getElementById('todoDue').value = td();
  fillCategorySelect('todoCategory', 'rais_sales');
  document.getElementById('todoProject').innerHTML = projectOptions('');
  document.getElementById('todoModal').classList.add('on');
}

function projectOptions(selectedId) {
  return '<option value="">— kein Projekt —</option>' +
    (S.projects || []).map(function(p) {
      return '<option value="' + p.id + '"' + (p.id === selectedId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
}

export function closeTodoModal() {
  document.getElementById('todoModal').classList.remove('on');
}

export async function saveTodo() {
  const title = document.getElementById('todoTitle').value.trim();
  if (!title) { toast('Titel fehlt.'); return; }
  const category = document.getElementById('todoCategory').value;
  if (!category) { toast('Kategorie fehlt.'); return; }
  const row = {
    title: title,
    category: category,
    due_date: document.getElementById('todoDue').value || null,
    project_id: document.getElementById('todoProject').value || null,
    source: 'crm',
  };
  if (S.todoEid) {
    row.id = S.todoEid;
    const existing = (S.todos || []).find(function(t) { return t.id === S.todoEid; });
    if (existing) row.done = existing.done;
  }
  try {
    await sbUpsert(TODO_KEY_SB, [row]);
    await loadProjects();
    closeTodoModal();
    renderProjectsPage();
    toast('To-do gespeichert.');
  } catch (e) { toast('Fehler: ' + e.message); }
}

export async function toggleTodoDone(id, done) {
  const t = (S.todos || []).find(function(x) { return x.id === id; });
  if (!t) return;
  try {
    await sbUpsert(TODO_KEY_SB, [{ id: id, done: !!done }]);
    t.done = !!done;
    renderProjectsPage();
  } catch (e) { toast('Fehler: ' + e.message); }
}

export async function delTodo(id) {
  if (!confirm('To-do löschen?')) return;
  try {
    await sbDelete(TODO_KEY_SB + '?id=eq.' + id);
    await loadProjects();
    renderProjectsPage();
  } catch (e) { toast('Fehler: ' + e.message); }
}

/** Snapshot für Dashboard */
export function getProjectsSnapshot() {
  return {
    projects: S.projects || [],
    openTodos: (S.todos || []).filter(function(t) { return !t.done; }),
  };
}
