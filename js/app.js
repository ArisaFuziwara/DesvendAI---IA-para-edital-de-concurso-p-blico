import { getConcursos, getUsoMes } from './firebase.js';
import { initHome } from './page-home.js';
import { initAnalisar } from './page-analisar.js';
import { initMaterias } from './page-materias.js';
import { initCronograma } from './page-cronograma.js';
import { CONFIG } from './config.js';

// ── estado global ──────────────────────────────────
export const State = {
  concursos:      [],
  concursoAtivo:  null,   // objeto completo
  materias:       [],
  usoMes:         0,
};

// ── cores das matérias ─────────────────────────────
export const CORES = [
  '#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1',
  '#84CC16','#F43F5E',
];

// ── utilitários globais ────────────────────────────
export function uid() {
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}
export function norm(s = '') {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
export function showToast(msg, tipo = 'default') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show toast-${tipo}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}
export function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}
export function diasAte(iso) {
  if (!iso) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prova = new Date(iso + 'T00:00:00');
  return Math.ceil((prova - hoje) / 86400000);
}

// ── navegação ──────────────────────────────────────
const PAGES = ['home','analisar','materias','cronograma','historico'];

export function goPage(page) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`)?.classList.toggle('active', p === page);
    document.querySelector(`[data-page="${p}"]`)?.classList.toggle('active', p === page);
  });
  // atualizar título do seletor de concurso no header
  renderConcursoSelector();
}

// ── seletor de concurso no header ──────────────────
export function renderConcursoSelector() {
  const sel = document.getElementById('concurso-selector');
  if (!sel) return;
  const c = State.concursoAtivo;
  const nome = document.getElementById('concurso-nome-header');
  if (nome) nome.textContent = c ? c.nome : 'Selecionar concurso';
}

export async function selecionarConcurso(id) {
  State.concursoAtivo = State.concursos.find(c => c.id === id) || null;
  localStorage.setItem('concursoAtivoId', id);
  renderConcursoSelector();
  // notificar páginas
  document.dispatchEvent(new CustomEvent('concursoChanged', { detail: id }));
}

// ── dropdown de concursos ──────────────────────────
function setupConcursoDropdown() {
  const btn = document.getElementById('concurso-header-btn');
  const dd  = document.getElementById('concurso-dropdown');
  if (!btn || !dd) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dd.classList.toggle('open');
    renderDropdownList();
  });
  document.addEventListener('click', () => dd.classList.remove('open'));
}

function renderDropdownList() {
  const list = document.getElementById('concurso-dropdown-list');
  if (!list) return;
  const btnNovo = `<button class="dd-item dd-item-new" id="dd-novo-concurso">+ Novo concurso</button>`;
  const items = State.concursos.map(c => `
    <button class="dd-item ${c.id === State.concursoAtivo?.id ? 'dd-item-active' : ''}"
      data-id="${c.id}">
      <span class="dd-item-nome">${c.nome}</span>
      <span class="dd-item-sub">${c.cargo || ''}</span>
    </button>`).join('');
  list.innerHTML = items + btnNovo;

  list.querySelectorAll('[data-id]').forEach(btn =>
    btn.addEventListener('click', () => {
      selecionarConcurso(btn.dataset.id);
      document.getElementById('concurso-dropdown').classList.remove('open');
    })
  );
  document.getElementById('dd-novo-concurso')?.addEventListener('click', () => {
    document.getElementById('concurso-dropdown').classList.remove('open');
    abrirModalConcurso(null);
  });
}

// ── modal concurso ─────────────────────────────────
let _modalConcursoId = null;

export function abrirModalConcurso(id) {
  _modalConcursoId = id;
  const m = id ? State.concursos.find(c => c.id === id) : null;
  document.getElementById('mc-title').textContent  = m ? 'Editar concurso' : 'Novo concurso';
  document.getElementById('mc-nome').value         = m?.nome      || '';
  document.getElementById('mc-banca').value        = m?.banca     || '';
  document.getElementById('mc-cargo').value        = m?.cargo     || '';
  document.getElementById('mc-data').value         = m?.dataProva || '';
  document.getElementById('mc-del').style.display  = m ? 'inline-flex' : 'none';
  document.getElementById('modal-concurso').classList.remove('hidden');
}

function setupModalConcurso() {
  const { addConcurso, updateConcurso, deleteConcurso } = window._fb;

  document.getElementById('mc-close').addEventListener('click', () =>
    document.getElementById('modal-concurso').classList.add('hidden'));

  document.getElementById('mc-save').addEventListener('click', async () => {
    const nome  = document.getElementById('mc-nome').value.trim();
    const banca = document.getElementById('mc-banca').value.trim();
    const cargo = document.getElementById('mc-cargo').value.trim();
    const dataProva = document.getElementById('mc-data').value;
    if (!nome) { showToast('Informe o nome do concurso.','warn'); return; }

    if (_modalConcursoId) {
      await updateConcurso(_modalConcursoId, { nome, banca, cargo, dataProva });
      const idx = State.concursos.findIndex(c => c.id === _modalConcursoId);
      if (idx >= 0) State.concursos[idx] = { ...State.concursos[idx], nome, banca, cargo, dataProva };
      if (State.concursoAtivo?.id === _modalConcursoId)
        State.concursoAtivo = State.concursos[idx];
    } else {
      const ref = await addConcurso({ nome, banca, cargo, dataProva });
      const novo = { id: ref.id, nome, banca, cargo, dataProva };
      State.concursos.unshift(novo);
      selecionarConcurso(ref.id);
    }
    document.getElementById('modal-concurso').classList.add('hidden');
    renderConcursoSelector();
    document.dispatchEvent(new CustomEvent('concursosUpdated'));
    showToast('Concurso salvo!','success');
  });

  document.getElementById('mc-del').addEventListener('click', async () => {
    if (!confirm('Excluir este concurso e todos os dados vinculados?')) return;
    await deleteConcurso(_modalConcursoId);
    State.concursos = State.concursos.filter(c => c.id !== _modalConcursoId);
    if (State.concursoAtivo?.id === _modalConcursoId) {
      State.concursoAtivo = State.concursos[0] || null;
      localStorage.setItem('concursoAtivoId', State.concursoAtivo?.id || '');
    }
    document.getElementById('modal-concurso').classList.add('hidden');
    renderConcursoSelector();
    document.dispatchEvent(new CustomEvent('concursosUpdated'));
    showToast('Concurso excluído.','default');
  });
}

// ── freemium badge ─────────────────────────────────
export function atualizarBadgeUso() {
  const el = document.getElementById('uso-badge');
  if (!el) return;
  const restam = CONFIG.limiteAnalisesMes - State.usoMes;
  el.textContent = `${restam} análise${restam !== 1 ? 's' : ''} restante${restam !== 1 ? 's' : ''}`;
  el.className = `uso-badge ${restam <= 1 ? 'uso-critico' : ''}`;
}

// ── bootstrap ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // expor firebase globalmente para módulos que precisam
  const fb = await import('./firebase.js');
  window._fb = fb;

  // carregar dados iniciais
  [State.concursos, State.usoMes] = await Promise.all([
    getConcursos(),
    getUsoMes(),
  ]);

  // restaurar concurso ativo
  const savedId = localStorage.getItem('concursoAtivoId');
  State.concursoAtivo = State.concursos.find(c => c.id === savedId) || State.concursos[0] || null;

  // nav
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => goPage(btn.dataset.page))
  );

  setupConcursoDropdown();
  setupModalConcurso();
  renderConcursoSelector();
  atualizarBadgeUso();

  // inicializar páginas
  initHome();
  initAnalisar();
  initMaterias();
  initCronograma();

  goPage('home');
});
