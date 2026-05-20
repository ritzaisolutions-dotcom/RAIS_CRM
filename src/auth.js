import { SB_URL, SB_KEY, setAuthToken } from './supabase.js';

const wall  = document.getElementById('login-wall');
const errEl = document.getElementById('login-err');
let _sb = null;

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
  if (window.syncCloud) window.syncCloud(true);
};

async function init() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    _sb = createClient(SB_URL, SB_KEY);
    const { data: { session } } = await _sb.auth.getSession();
    if (session?.access_token) {
      setAuthToken(session.access_token);
      wall.style.display = 'none';
    } else {
      document.body.style.overflow = 'hidden';
    }
    _sb.auth.onAuthStateChange(function(_event, session) {
      if (session?.access_token) setAuthToken(session.access_token);
    });
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler: ' + e.message;
    document.body.style.overflow = 'hidden';
  }
}

window._authReady = init();
