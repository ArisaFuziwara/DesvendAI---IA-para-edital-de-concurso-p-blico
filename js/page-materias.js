import { State, uid, norm, showToast, CORES, goPage } from './app.js';
import { getMaterias, addMateria, updateMateria, deleteMateria } from './firebase.js';

let filtroStatus = 'all';
let buscaStr     = '';
let sortOpt      = 'nome';
let modalCtx     = null; // { tipo:'topico'|'materia', materiaId, topicoId }

export function initMaterias() {
  document.getElementById('search-mat')?.addEventListener('input', e => {
    buscaStr = e.target.value.toLowerCase();
    renderMaterias();
  });
  document.querySelectorAll('.status-pill').forEach(p =>
    p.addEventListener('click', () => {
      document.querySelectorAll('.status-pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      filtroStatus = p.dataset.s;
      renderMaterias();
    })
  );
  document.getElementById('sort-mat')?.addEventListener('change', e => {
    sortOpt = e.target.value;
    renderMaterias();
  });
  document.getElementById('btn-nova-materia')?.addEventListener('click', () => abrirModalMateria(null));
  document.getElementById('btn-export-json')?.addEventListener('click', exportarJSON);

  setupModalTopico();
  setupModalMateria();

  document.addEventListener('concursoChanged', () => {
    // resetar filtro ao trocar concurso
    filtroStatus = 'all';
    buscaStr = '';
    document.querySelectorAll('.status-pill').forEach(x => x.classList.remove('active'));
    document.querySelector('.status-pill[data-s="all"]')?.classList.add('active');
    const searchEl = document.getElementById('search-mat');
    if (searchEl) searchEl.value = '';
    renderMaterias();
  });

  // resetar estado ao entrar na página
  filtroStatus = 'all';
  renderMaterias();
}

// ── render principal ───────────────────────────────
export function renderMaterias() {
  const lista = [...State.materias]
    .map(m => ({ ...m, topicos: filtrarTopicos(m.topicos) }))
    .filter(m => {
      if (!buscaStr) return true;
      return norm(m.nome).includes(norm(buscaStr)) ||
             m.topicos.some(t => norm(t.texto).includes(norm(buscaStr)));
    })
    .sort((a, b) => {
      if (sortOpt === 'nome')    return a.nome.localeCompare(b.nome);
      if (sortOpt === 'topicos') return b.topicos.length - a.topicos.length;
      if (sortOpt === 'dom')     return b.topicos.filter(t=>t.status==='dominado').length -
                                        a.topicos.filter(t=>t.status==='dominado').length;
      return 0;
    });

  const container = document.getElementById('materias-list');
  const emptyEl   = document.getElementById('materias-empty');

  if (lista.length === 0) {
    container.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  container.innerHTML = lista.map(m => renderMateriaCard(m)).join('');

  // eventos dos cards
  container.querySelectorAll('.mat-head').forEach(h =>
    h.addEventListener('click', () => h.closest('.mat-card').classList.toggle('open'))
  );
  container.querySelectorAll('[data-edit-mat]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); abrirModalMateria(btn.dataset.editMat); })
  );
  container.querySelectorAll('[data-del-mat]').forEach(btn =>
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.delMat;
      const mat = State.materias.find(m => m.id === id);
      if (!confirm(`Excluir "${mat?.nome}" e todos os seus tópicos?`)) return;
      await deleteMateria(id);
      State.materias = State.materias.filter(m => m.id !== id);
      renderMaterias();
      import('./page-home.js').then(m => m.renderHome());
      showToast('Matéria excluída.', 'default');
    })
  );
  container.querySelectorAll('[data-topico-id]').forEach(row =>
    row.addEventListener('click', () => {
      const mid = row.dataset.materiaId;
      const tid = row.dataset.topicoId;
      abrirModalTopico(mid, tid);
    })
  );
  container.querySelectorAll('.status-cycle-btn').forEach(btn =>
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      const tid = btn.dataset.tid;
      await ciclicStatusTopico(mid, tid);
    })
  );
  container.querySelectorAll('[data-add-topico]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      adicionarTopico(btn.dataset.addTopico);
    })
  );
}

function filtrarTopicos(topicos = []) {
  if (filtroStatus === 'all') return topicos;
  return topicos.filter(t => t.status === filtroStatus);
}

function renderBadgeConcurso(m) {
  if (!m.concursoId) return '<span class="mat-concurso-badge mat-global-badge">Global</span>';
  const c = State.concursos.find(x => x.id === m.concursoId);
  return '<span class="mat-concurso-badge">' + (c ? c.nome : '') + '</span>';
}

function renderMateriaCard(m) {
  const total = m.topicos.length;
  const dom   = m.topicos.filter(t => t.status === 'dominado').length;
  const est   = m.topicos.filter(t => t.status === 'estudando').length;
  const nao   = m.topicos.filter(t => !t.status || t.status === 'nao_estudado').length;
  const pct   = total > 0 ? Math.round((dom/total)*100) : 0;

  // agrupar por nível para exibição hierárquica
  const topicosHtml = renderTopicosFlat(m.topicos, m.id);

  return `
    <div class="mat-card" id="mcard-${m.id}">
      <div class="mat-head">
        <div class="mat-head-left">
          <div class="mat-dot" style="background:${m.cor || '#888'}"></div>
          <div class="mat-info">
            <span class="mat-nome">${m.nome}</span>
            ${renderBadgeConcurso(m)}
            <div class="mat-pills">
              ${dom  ? `<span class="spill dominado">${dom} dominado${dom!==1?'s':''}</span>` : ''}
              ${est  ? `<span class="spill estudando">${est} estudando</span>` : ''}
              ${nao  ? `<span class="spill nao-estudado">${nao} não estudado${nao!==1?'s':''}</span>` : ''}
              ${!total ? '<span class="spill">Sem tópicos</span>' : ''}
            </div>
          </div>
        </div>
        <div class="mat-head-right">
          <div class="mat-progress-wrap">
            <div class="mat-progress-bar"><div class="mat-progress-fill" style="width:${pct}%"></div></div>
            <span class="mat-pct">${pct}%</span>
          </div>
          <button class="mat-edit-btn mat-lapis" data-edit-mat="${m.id}" title="Editar nome">✏</button>
          <button class="mat-edit-btn mat-lixeira" data-del-mat="${m.id}" title="Excluir matéria">🗑</button>
          <span class="mat-chevron">▾</span>
        </div>
      </div>
      <div class="mat-body">
        ${topicosHtml}
        <div class="mat-body-footer">
          <button class="btn-sm" data-add-topico="${m.id}">+ Adicionar tópico</button>
        </div>
      </div>
    </div>`;
}

function renderTopicosFlat(topicos, materiaId) {
  if (!topicos.length) return '<div class="topico-vazio">Nenhum tópico</div>';

  // Agrupar em hierarquia por nivel + parentId
  const byId = {};
  topicos.forEach(t => byId[t.id] = { ...t, _filhos: [] });
  const raizes = [];
  topicos.forEach(t => {
    if (t.parentId && byId[t.parentId]) byId[t.parentId]._filhos.push(byId[t.id]);
    else raizes.push(byId[t.id]);
  });

  function renderNo(t, depth = 0) {
    const nivel = t.nivel || 1;
    const indent = (nivel - 1) * 20 + 16;
    const statusIcon = { dominado: '✓', estudando: '◐', nao_estudado: '○' }[t.status] || '○';
    const statusClass = t.status || 'nao_estudado';
    const nivelClass = nivel === 1 ? 'topico-n1' : nivel === 2 ? 'topico-n2' : 'topico-n3';

    return `
      <div class="topico-row status-${statusClass} ${nivelClass}"
           data-topico-id="${t.id}" data-materia-id="${materiaId}"
           style="padding-left:${indent}px">
        <button class="status-cycle-btn status-icon-${statusClass}"
                data-mid="${materiaId}" data-tid="${t.id}"
                title="Clique para mudar status">${statusIcon}</button>
        <span class="topico-texto">${t.texto}</span>
        <span class="topico-edit-hint">editar ›</span>
      </div>
      ${t._filhos.length ? t._filhos.map(f => renderNo(f, depth+1)).join('') : ''}`;
  }

  return raizes.map(t => renderNo(t)).join('');
}

// ── ciclico de status (clique rápido) ─────────────
const STATUS_CYCLE = ['nao_estudado', 'estudando', 'dominado'];
async function ciclicStatusTopico(materiaId, topicoId) {
  const mat = State.materias.find(m => m.id === materiaId);
  if (!mat) return;
  const top = mat.topicos.find(t => t.id === topicoId);
  if (!top) return;
  const idx = STATUS_CYCLE.indexOf(top.status || 'nao_estudado');
  top.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await updateMateria(materiaId, { topicos: mat.topicos });
  renderMaterias();
  import('./page-home.js').then(m => m.renderHome());
}

// ── modal de tópico ────────────────────────────────
function setupModalTopico() {
  document.getElementById('mt-close')?.addEventListener('click', () =>
    document.getElementById('modal-topico').classList.add('hidden'));
  document.getElementById('mt-save')?.addEventListener('click', salvarTopico);
  document.getElementById('mt-del')?.addEventListener('click', deletarTopicoModal);

  document.querySelectorAll('.status-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    })
  );
}

function abrirModalTopico(materiaId, topicoId) {
  const mat = State.materias.find(m => m.id === materiaId);
  if (!mat) return;
  const top = mat.topicos.find(t => t.id === topicoId);
  if (!top) return;

  modalCtx = { tipo: 'topico', materiaId, topicoId };

  document.getElementById('mt-texto').value = top.texto;
  document.getElementById('mt-nivel').value = top.nivel || 1;

  // select de matéria
  const sel = document.getElementById('mt-materia');
  sel.innerHTML = State.materias
    .map(m => `<option value="${m.id}" ${m.id === materiaId ? 'selected' : ''}>${m.nome}</option>`)
    .join('');

  // status
  document.querySelectorAll('.status-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.st === (top.status || 'nao_estudado'))
  );

  document.getElementById('modal-topico').classList.remove('hidden');
}

async function salvarTopico() {
  const { materiaId, topicoId } = modalCtx;
  const texto      = document.getElementById('mt-texto').value.trim();
  const nivel      = parseInt(document.getElementById('mt-nivel').value) || 1;
  const novaMateriaId = document.getElementById('mt-materia').value;
  const status     = document.querySelector('.status-btn.active')?.dataset.st || 'nao_estudado';

  if (!texto) { showToast('Texto não pode ser vazio.','warn'); return; }

  const velha = State.materias.find(m => m.id === materiaId);
  const nova  = State.materias.find(m => m.id === novaMateriaId);
  const idxTop = velha.topicos.findIndex(t => t.id === topicoId);

  const topicoAtualizado = { ...velha.topicos[idxTop], texto, nivel, status };

  if (materiaId === novaMateriaId) {
    velha.topicos[idxTop] = topicoAtualizado;
    await updateMateria(materiaId, { topicos: velha.topicos });
  } else {
    velha.topicos.splice(idxTop, 1);
    await updateMateria(materiaId, { topicos: velha.topicos });
    nova.topicos.push(topicoAtualizado);
    await updateMateria(novaMateriaId, { topicos: nova.topicos });
  }

  renderMaterias();
  import('./page-home.js').then(m => m.renderHome());
  showToast('Salvo!', 'success');
}

async function deletarTopicoModal() {
  if (!confirm('Excluir este tópico?')) return;
  const { materiaId, topicoId } = modalCtx;
  const mat = State.materias.find(m => m.id === materiaId);
  mat.topicos = mat.topicos.filter(t => t.id !== topicoId);
  await updateMateria(materiaId, { topicos: mat.topicos });
  document.getElementById('modal-topico').classList.add('hidden');
  renderMaterias();
  showToast('Tópico excluído.', 'default');
}

async function adicionarTopico(materiaId) {
  const texto = prompt('Texto do novo tópico:');
  if (!texto?.trim()) return;
  const nivel = parseInt(prompt('Nível (1 = título, 2 = subtítulo, 3 = sub-subtítulo):', '2')) || 2;
  const mat = State.materias.find(m => m.id === materiaId);
  if (!mat) return;
  mat.topicos.push({ id: uid(), texto: texto.trim(), nivel, status: 'nao_estudado', parentId: null });
  await updateMateria(materiaId, { topicos: mat.topicos });
  renderMaterias();
  showToast('Tópico adicionado!', 'success');
}

// ── modal de matéria ───────────────────────────────
let _editMateriaId = null;

function setupModalMateria() {
  document.getElementById('mm-close')?.addEventListener('click', () =>
    document.getElementById('modal-materia').classList.add('hidden'));
  document.getElementById('mm-save')?.addEventListener('click', salvarMateria);
  document.getElementById('mm-del')?.addEventListener('click', deletarMateriaModal);
}

function abrirModalMateria(id) {
  _editMateriaId = id;
  const m = id ? State.materias.find(x => x.id === id) : null;
  document.getElementById('mm-title').textContent = m ? 'Editar matéria' : 'Nova matéria';
  document.getElementById('mm-nome').value = m?.nome || '';
  document.getElementById('mm-del').style.display = m ? 'inline-flex' : 'none';

  // popular select de concursos
  const sel = document.getElementById('mm-concurso');
  if (sel) {
    sel.innerHTML = `<option value="">🌐 Global (todos os concursos)</option>` +
      State.concursos.map(c =>
        `<option value="${c.id}" ${m?.concursoId === c.id ? 'selected' : ''}>${c.nome}</option>`
      ).join('');
    if (!m?.concursoId) sel.value = '';
  }

  document.getElementById('modal-materia').classList.remove('hidden');
}

async function salvarMateria() {
  const nome = document.getElementById('mm-nome').value.trim();
  if (!nome) { showToast('Informe o nome.','warn'); return; }
  const c = State.concursoAtivo;

  if (_editMateriaId) {
    const mat = State.materias.find(m => m.id === _editMateriaId);
    mat.nome = nome;
    await updateMateria(_editMateriaId, { nome });
  } else {
    const cor = CORES[State.materias.length % CORES.length];
    const ref = await addMateria({ concursoId: c?.id || '', nome, cor, topicos: [] });
    State.materias.push({ id: ref.id, concursoId: c?.id || '', nome, cor, topicos: [] });
  }

  document.getElementById('modal-materia').classList.add('hidden');
  renderMaterias();
  import('./page-home.js').then(m => m.renderHome());
  showToast('Matéria salva!', 'success');
}

async function deletarMateriaModal() {
  if (!confirm('Excluir esta matéria e todos os seus tópicos?')) return;
  await deleteMateria(_editMateriaId);
  State.materias = State.materias.filter(m => m.id !== _editMateriaId);
  document.getElementById('modal-materia').classList.add('hidden');
  renderMaterias();
  import('./page-home.js').then(m => m.renderHome());
  showToast('Matéria excluída.', 'default');
}

function exportarJSON() {
  const data = JSON.stringify(State.materias, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'materias.json' }).click();
  URL.revokeObjectURL(url);
  showToast('JSON exportado!', 'success');
}
