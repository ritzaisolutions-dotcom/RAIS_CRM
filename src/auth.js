const PW = 'RAIS-CRM';
const SK = 'rais_auth';

const wall = document.getElementById('login-wall');

if (sessionStorage.getItem(SK) === '1') {
  wall.style.display = 'none';
} else {
  document.body.style.overflow = 'hidden';
}

window.doLogin = function() {
  const val = document.getElementById('login-pw').value;
  if (val === PW) {
    sessionStorage.setItem(SK, '1');
    wall.style.display = 'none';
    document.body.style.overflow = '';
  } else {
    document.getElementById('login-err').textContent = 'Falsches Passwort';
    document.getElementById('login-pw').value = '';
    document.getElementById('login-pw').focus();
  }
};
