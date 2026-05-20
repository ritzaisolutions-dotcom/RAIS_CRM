import { SB_URL, SB_KEY, setAuthToken } from './supabase.js';

const wall = document.getElementById('login-wall');
let _sb = null;

window.doLogin = async function() {
  if (!_sb) return;
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  const err   = document.getElementById('login-err');
  err.textContent = '';
  const { data, error } = await _sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    err.textContent = 'Falsches Passwort oder Email';
    document.getElementById('login-pw').value = '';
    document.getElementById('login-pw').focus();
    return;
  }
  setAuthToken(data.session.access_token);
  wall.style.display = 'none';
  document.body.style.overflow = '';
};

async function init() {
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
}

window._authReady = init();
