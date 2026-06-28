const SIDEBAR_KEY = 'rais_sidebar_collapsed';

const PAGES = [
  { id: 'dashboard',   icon: '📊', label: 'Dashboard'   },
  { id: 'network',     icon: '🤝', label: 'Netzwerk'    },
  { id: 'prospecting', icon: '📋', label: 'Prospects'   },
  { id: 'clients',     icon: '👥', label: 'Clients'     },
  { id: 'sessions',    icon: '🏁', label: 'Sessions'    },
];

let _currentPage = 'prospecting';

export function navigateTo(pageId) {
  document.querySelectorAll('.rais-page').forEach(function(el) {
    el.classList.remove('active');
  });
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.rais-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Sync mobile bottom nav active state
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.querySelectorAll('.mn-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.page === pageId);
    });
  }

  _currentPage = pageId;
  location.hash = pageId;

  window.dispatchEvent(new CustomEvent('rais:page-change', { detail: { page: pageId } }));
}

export function getCurrentPage() {
  return _currentPage;
}

export function toggleCollapse() {
  const sidebar = document.getElementById('rais-sidebar');
  const content = document.getElementById('rais-content');
  const collapsed = sidebar.classList.toggle('collapsed');
  if (content) content.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '');
}

export function initSidebar() {
  const sidebar = document.getElementById('rais-sidebar');
  const content = document.getElementById('rais-content');

  let html = '<div id="sidebar-toggle">&#9776;</div>';
  PAGES.forEach(function(p) {
    html += '<div class="rais-nav-item" data-page="' + p.id + '">' +
      '<span class="rais-nav-icon">' + p.icon + '</span>' +
      '<span class="rais-nav-label">' + p.label + '</span>' +
      '</div>';
  });
  sidebar.innerHTML = html;

  document.getElementById('sidebar-toggle').addEventListener('click', toggleCollapse);
  document.querySelectorAll('.rais-nav-item').forEach(function(el) {
    el.addEventListener('click', function() { navigateTo(el.dataset.page); });
  });

  // Wire mobile bottom nav tabs
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.querySelectorAll('.mn-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { navigateTo(btn.dataset.page); });
    });
  }

  const wasCollapsed = localStorage.getItem(SIDEBAR_KEY);
  const isMobile = window.innerWidth <= 768;
  if (wasCollapsed || isMobile) {
    sidebar.classList.add('collapsed');
    if (content) content.classList.add('sidebar-collapsed');
  }

  const h = location.hash.replace('#', '');
  const valid = PAGES.find(function(p) { return p.id === h; });
  navigateTo(valid ? h : 'dashboard');
}
