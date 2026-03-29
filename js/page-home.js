import { State, goPage, abrirModalConcurso, diasAte, fmtData, showToast } from './app.js';

export function initHome() {
  document.getElementById('btn-novo-concurso-home')?.addEventListener('click', () => abrirModalConcurso(null));
  document.getElementById('btn-ir-analisar')?.addEventListener('click', () => goPage('analisar'));

  document.addEventListener('concursosUpdated', renderHome);
  document.addEventListener('concursoChanged', renderHome);

  renderHome();
  // atualizar countdown a cada minuto
  setInterval(renderCountdown, 60000);
}

export function renderHome() {
  renderCountdown();
  renderStatsHome();
  renderConcursosCards();
}

function renderCountdown() {
  const el = document.getElementById('countdown-block');
  if (!el) return;
  const c = State.concursoAtivo;
  if (!c || !c.dataProva) {
    el.innerHTML = `
      <div class="countdown-empty">
        <p class="countdown-empty-text">Nenhum concurso com data configurada.</p>
        <button class="btn-sm" onclick="import('./app.js').then(m=>m.abrirModalConcurso('${c?.id||''}'))">
          Configurar data
        </button>
      </div>`;
    return;
  }

  const dias = diasAte(c.dataProva);
  let urgClass = dias <= 30 ? 'urgente' : dias <= 60 ? 'atencao' : 'tranquilo';
  if (dias < 0) urgClass = 'passou';

  const label = dias < 0   ? 'A prova já aconteceu'
              : dias === 0 ? 'A prova é HOJE!'
              : `${dias} dia${dias !== 1 ? 's' : ''} para a prova`;

  const subLabel = dias >= 0
    ? `${c.nome}${c.cargo ? ' · ' + c.cargo : ''} — ${fmtData(c.dataProva)}`
    : `${c.nome} — ${fmtData(c.dataProva)}`;

  el.innerHTML = `
    <div class="countdown-inner countdown-${urgClass}">
      <div class="countdown-number">${dias < 0 ? '—' : dias}</div>
      <div class="countdown-label">${label}</div>
      <div class="countdown-sub">${subLabel}</div>
      ${dias >= 0 && dias <= 7 ? '<div class="countdown-alert">⚡ Última semana!</div>' : ''}
    </div>`;
}

function renderStatsHome() {
  const c = State.concursoAtivo;
  const mats = State.materias.filter(m => !c || m.concursoId === c?.id);

  const totalMat  = mats.length;
  const totalTop  = mats.reduce((s,m) => s + m.topicos.length, 0);
  const dominados = mats.reduce((s,m) => s + m.topicos.filter(t => t.status === 'dominado').length, 0);
  const pct = totalTop > 0 ? Math.round((dominados/totalTop)*100) : 0;

  document.getElementById('stat-materias').textContent  = totalMat;
  document.getElementById('stat-topicos').textContent   = totalTop;
  document.getElementById('stat-dominados').textContent = `${pct}%`;
  document.getElementById('stat-editais').textContent   = State.concursos.length;

  // barra de progresso global
  const barra = document.getElementById('progresso-barra');
  const pctEl = document.getElementById('progresso-pct');
  if (barra) barra.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}% do edital dominado`;
}

function renderConcursosCards() {
  const container = document.getElementById('concursos-cards');
  if (!container) return;

  if (State.concursos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p class="empty-title">Nenhum concurso ainda</p>
        <p class="empty-sub">Crie seu primeiro concurso para começar.</p>
        <button class="btn-primary" id="btn-criar-primeiro">Criar concurso</button>
      </div>`;
    document.getElementById('btn-criar-primeiro')?.addEventListener('click', () => abrirModalConcurso(null));
    return;
  }

  container.innerHTML = State.concursos.map(c => {
    const dias = diasAte(c.dataProva);
    const urgClass = dias === null ? '' : dias <= 30 ? 'card-urgente' : dias <= 60 ? 'card-atencao' : '';
    const ativo = c.id === State.concursoAtivo?.id;
    const mats  = State.materias.filter(m => m.concursoId === c.id);
    const tops  = mats.reduce((s,m) => s + m.topicos.length, 0);
    const dom   = mats.reduce((s,m) => s + m.topicos.filter(t=>t.status==='dominado').length, 0);
    const pct   = tops > 0 ? Math.round((dom/tops)*100) : 0;

    return `
      <div class="concurso-card ${ativo ? 'concurso-card-ativo' : ''} ${urgClass}"
           data-id="${c.id}">
        <div class="cc-top">
          <div class="cc-info">
            <div class="cc-nome">${c.nome}</div>
            <div class="cc-meta">${[c.banca, c.cargo].filter(Boolean).join(' · ') || 'Sem detalhes'}</div>
          </div>
          <button class="cc-edit-btn" data-edit="${c.id}">✏</button>
        </div>
        <div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
        <div class="cc-bottom">
          <span class="cc-pct">${pct}% dominado</span>
          <span class="cc-dias ${dias !== null && dias <= 30 ? 'dias-urgente' : ''}">
            ${dias === null ? 'Sem data' : dias < 0 ? 'Encerrado' : `${dias}d`}
          </span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.concurso-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) return;
      const { goPage: gp, selecionarConcurso } = window._appFns;
      import('./app.js').then(m => {
        m.selecionarConcurso(card.dataset.id);
        m.goPage('analisar');
      });
    });
  });
  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      import('./app.js').then(m => m.abrirModalConcurso(btn.dataset.edit));
    });
  });
}
