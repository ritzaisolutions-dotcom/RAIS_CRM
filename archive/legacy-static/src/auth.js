import { SB_URL, SB_KEY, setAuthToken, setSupabaseClient, isAuthenticated } from './supabase.js';
import { S } from './state.js';
import { clearLocalCrmData } from './sync.js';
import { teardownRealtime } from './realtime.js';

const HISTORY_KEY = 'rais_salesrep_history';
const SESSION_KEY = 'rais_active_session';

const wall  = document.getElementById('login-wall');
const errEl = document.getElementById('login-err');
let _sb = null;

export function hasActiveSession() { return isAuthenticated(); }

window.doLogin = async function() {
  if (!_sb) { errEl.textContent = 'Verbindung lädt noch — kurz warten und erneut versuchen.'; return; }
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  errEl.textContent = '';
  const { data, error } = await _sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    errEl.textContent = error.message;
    document.getElementById('login-pw').value = '';
    document.getElementById('login-pw').focus();
    return;
  }
  setAuthToken(data.session.access_token);
  wall.style.display = 'none';
  document.body.style.overflow = '';
  if (window.loadCrmData) window.loadCrmData();
  if (window.syncCloud) window.syncCloud(true);
  if (window.initRealtimeAuth) window.initRealtimeAuth();
};

window.doLogout = async function() {
  teardownRealtime();
  if (_sb) await _sb.auth.signOut();
  setAuthToken(SB_KEY);
  clearLocalCrmData();
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(SESSION_KEY);
  S.contacts = [];
  wall.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('login-pw').value = '';
  if (window.render) window.render();
};

async function init() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    _sb = createClient(SB_URL, SB_KEY);
    setSupabaseClient(_sb);
    const { data: { session } } = await _sb.auth.getSession();
    if (session?.access_token) {
      setAuthToken(session.access_token);
      wall.style.display = 'none';
    } else {
      clearLocalCrmData();
      document.body.style.overflow = 'hidden';
    }
    _sb.auth.onAuthStateChange(function(event, session) {
      if (session?.access_token) {
        setAuthToken(session.access_token);
      } else if (event === 'SIGNED_OUT' || !session) {
        setAuthToken(SB_KEY);
        clearLocalCrmData();
        localStorage.removeItem(HISTORY_KEY);
        localStorage.removeItem(SESSION_KEY);
        S.contacts = [];
        wall.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.render) window.render();
      }
    });
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler: ' + e.message;
    document.body.style.overflow = 'hidden';
  }
}

window._authReady = init();
