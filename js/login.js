import { CONFIG } from './config.js';

const STORAGE_KEY = 'es_logado';

export function isLogado() {
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}

export function logout() {
  sessionStorage.removeItem(STORAGE_KEY);
  mostrarLogin();
}

export function setupLogin() {
  if (isLogado()) {
    mostrarApp();
    return false; // não precisa fazer login
  }
  mostrarLogin();
  return true; // precisa fazer login
}

function mostrarLogin() {
  document.getElementById('tela-login').classList.remove('hidden');
  document.getElementById('app-wrapper').classList.add('hidden');
}

function mostrarApp() {
  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('app-wrapper').classList.remove('hidden');
}

// setup dos eventos da tela de login
document.addEventListener('DOMContentLoaded', () => {
  // mostrar login ou app dependendo do estado
  if (isLogado()) mostrarApp();
  else mostrarLogin();

  const form     = document.getElementById('login-form');
  const userEl   = document.getElementById('login-user');
  const senhaEl  = document.getElementById('login-senha');
  const erroEl   = document.getElementById('login-erro');
  const olhoBtn  = document.getElementById('login-olho');

  olhoBtn?.addEventListener('click', () => {
    const tipo = senhaEl.type === 'password' ? 'text' : 'password';
    senhaEl.type = tipo;
    olhoBtn.textContent = tipo === 'password' ? '👁' : '🙈';
  });

  form?.addEventListener('submit', e => {
    e.preventDefault();
    const user  = userEl.value.trim();
    const senha = senhaEl.value;

    if (user === CONFIG.loginUser && senha === CONFIG.loginSenha) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      erroEl.classList.add('hidden');
      mostrarApp();
      // disparar evento pra app.js inicializar
      document.dispatchEvent(new CustomEvent('loginOk'));
    } else {
      erroEl.textContent = 'Usuário ou senha incorretos.';
      erroEl.classList.remove('hidden');
      senhaEl.value = '';
      senhaEl.focus();
    }
  });
});
