import { State, uid, norm, showToast, CORES } from './app.js';
import { addMateria, updateMateria } from './firebase.js';

// ── estado ─────────────────────────────────────────
let materiaSelecionada = null; // { id, nome, cor, topicos[] }
let topicosParsed     = [];   // tópicos da colagem atual
let dragEl            = null;
let dragOverEl        = null;

// ── init ───────────────────────────────────────────
export function initAnalisar() {
  document.getElementById('btn-selecionar-mat')?.addEventListener('click', abrirSeletorMat);
  document.getElementById('btn-criar-mat-anal')?.addEventListener('click', criarMateria);
  document.getElementById('btn-processar')?.addEventListener('click', processarColagem);
  document.getElementById('btn-salvar-final')?.addEventListener('click', salvarFinal);
  document.getElementById('btn-add-topico-manual')?.addEventListener('click', adicionarManual);
  document.addEventListener('concursoChanged', () => { resetarPagina(); renderAvisoConcurso(); });
  renderAvisoConcurso();
}

function renderAvisoConcurso() {
  const aviso = document.getElementById('anal-aviso-concurso');
  const corpo = document.getElementById('anal-corpo');
  if (!aviso || !corpo) return;
  if (!State.concursoAtivo) {
    aviso.classList.remove('hidden');
    corpo.classList.add('hidden');
  } else {
    aviso.classList.add('hidden');
    corpo.classList.remove('hidden');
  }
}

function resetarPagina() {
  materiaSelecionada = null;
  topicosParsed      = [];
  document.getElementById('anal-step2').classList.add('hidden');
  document.getElementById('anal-step3').classList.add('hidden');
  document.getElementById('mat-selecionada-info').classList.add('hidden');
  document.getElementById('mat-placeholder').classList.remove('hidden');
}

// ── STEP 1: selecionar matéria ─────────────────────
function abrirSeletorMat() {
  if (!State.concursoAtivo) {
    showToast('Selecione um concurso no menu do topo antes de continuar.', 'warn');
    return;
  }

  // mostra TODAS as matérias, independente de concurso
  const mats = State.materias;
  const dd   = document.getElementById('mat-dropdown');

  if (!mats.length) {
    showToast('Nenhuma matéria cadastrada ainda. Crie uma!', 'warn');
    return;
  }

  dd.innerHTML = mats.map(m => `
    <button class="mat-dd-item" data-id="${m.id}">
      <div class="mat-dd-dot" style="background:${m.cor}"></div>
      <span>${m.nome}</span>
      <span class="mat-dd-count">${m.topicos.length} tópicos</span>
    </button>`).join('');

  dd.classList.toggle('hidden');

  dd.querySelectorAll('.mat-dd-item').forEach(btn =>
    btn.addEventListener('click', () => {
      selecionarMateria(btn.dataset.id);
      dd.classList.add('hidden');
    })
  );
}

function selecionarMateria(id) {
  const m = State.materias.find(x => x.id === id);
  if (!m) return;
  materiaSelecionada = m;

  document.getElementById('mat-placeholder').classList.add('hidden');
  const info = document.getElementById('mat-selecionada-info');
  info.classList.remove('hidden');
  document.getElementById('mat-sel-dot').style.background  = m.cor;
  document.getElementById('mat-sel-nome').textContent       = m.nome;
  document.getElementById('mat-sel-count').textContent      = `${m.topicos.length} tópicos existentes`;

  document.getElementById('anal-step2').classList.remove('hidden');
  document.getElementById('anal-step3').classList.add('hidden');
  document.getElementById('char-count').textContent = '0 caracteres';
  document.getElementById('topicos-input').value = '';
}

async function criarMateria() {
  const nome = prompt('Nome da nova matéria:');
  if (!nome?.trim()) return;
  const c   = State.concursoAtivo;
  const cor = CORES[State.materias.length % CORES.length];
  const ref = await addMateria({ concursoId: c?.id || '', nome: nome.trim(), cor, topicos: [] });
  const nova = { id: ref.id, concursoId: c?.id || '', nome: nome.trim(), cor, topicos: [] };
  State.materias.push(nova);
  selecionarMateria(nova.id);
  showToast('Matéria criada!', 'success');
}

// ── STEP 2: colar e processar ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topicos-input')?.addEventListener('input', e => {
    document.getElementById('char-count').textContent = `${e.target.value.length} caracteres`;
  });
});

function processarColagem() {
  const texto = document.getElementById('topicos-input').value.trim();
  if (!texto) { showToast('Cole os tópicos primeiro.', 'warn'); return; }
  if (!materiaSelecionada)  { showToast('Selecione uma matéria primeiro.', 'warn'); return; }

  topicosParsed = parsearTopicos(texto);
  if (!topicosParsed.length) { showToast('Nenhum tópico encontrado.', 'warn'); return; }

  renderStep3();
  document.getElementById('anal-step3').classList.remove('hidden');
  document.getElementById('anal-step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── parser ─────────────────────────────────────────
function parsearTopicos(texto) {
  // Se tudo veio numa linha só (sem quebras), quebra automaticamente
  // antes de cada padrão numérico: "3.1 Texto" → quebra antes do "3.1"
  let textoProcessado = texto;
  const temQuebrasDeLinha = (texto.match(/\n/g) || []).length > 2;

  if (!temQuebrasDeLinha) {
    // quebra antes de números do tipo: 1. / 1.1 / 1.1.1 / 2. etc
    textoProcessado = texto
      .replace(/\s+(\d+\.\d+\.\d+)\s+/g, '\n$1 ')
      .replace(/\s+(\d+\.\d+)\s+/g,      '\n$1 ')
      .replace(/\s+(\d+\.)\s+/g,         '\n$1 ');
  }

  const linhas = textoProcessado.split('\n').map(l => l.trim()).filter(Boolean);
  const tops   = linhas
    .map(l => ({ id: uid(), texto: limparTexto(l), nivel: detectarNivel(l), status: 'nao_estudado' }))
    .filter(t => t.texto);

  // se ainda tudo nivel 1, tenta inferir por recuo
  if (tops.every(t => t.nivel === 1)) {
    textoProcessado.split('\n').filter(l => l.trim()).forEach((l, i) => {
      const esp = l.match(/^(\s+)/)?.[1]?.length || 0;
      if (tops[i]) tops[i].nivel = esp >= 6 ? 3 : esp >= 2 ? 2 : 1;
    });
  }
  return tops;
}

function detectarNivel(l) {
  if (/^\s*\d+\.\d+\.\d+/.test(l)) return 3;
  if (/^\s*\d+\.\d+/.test(l))      return 2;
  if (/^\s*\d+\./.test(l))         return 1;
  if (/^\s+[a-z]\)/.test(l))       return 3;
  if (/^[a-z]\)/.test(l))          return 2;
  return 1;
}

function limparTexto(l) {
  return l.replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/^[a-zA-Z]\)\s*/, '').replace(/^[-–—•]\s*/, '').trim();
}

// ── STEP 3: editor drag-and-drop ───────────────────
function renderStep3() {
  const existentes = materiaSelecionada.topicos;

  // seção de existentes (se tiver)
  const existentesHtml = existentes.length ? `
    <div class="edit-existentes">
      <div class="edit-sec-label">Já salvos nesta matéria <span class="edit-sec-count">${existentes.length}</span></div>
      <div class="existentes-list">
        ${existentes.map(t => `
          <div class="exist-row nivel-${t.nivel}" style="padding-left:${(t.nivel-1)*20+12}px">
            <span class="nivel-tag n${t.nivel}">T${t.nivel}</span>
            <span>${t.texto}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  document.getElementById('existentes-block').innerHTML = existentesHtml;

  // lista editável de novos
  renderListaEditavel();
}

function renderListaEditavel() {
  const container = document.getElementById('topicos-editaveis');
  container.innerHTML = '';
  topicosParsed.forEach(t => container.appendChild(criarTopicoEl(t)));
  setupDragDrop(container);
  document.getElementById('parse-count').textContent =
    `${topicosParsed.length} tópico${topicosParsed.length !== 1 ? 's' : ''} novos`;
}

function criarTopicoEl(t) {
  const div = document.createElement('div');
  div.className = `topico-edit-row nivel-${t.nivel}`;
  div.dataset.id = t.id;
  div.draggable  = true;
  div.style.paddingLeft = `${(t.nivel - 1) * 20 + 12}px`;
  div.innerHTML = `
    <div class="drag-handle" title="Arrastar">⠿</div>
    <span class="nivel-tag n${t.nivel}" title="Clique para mudar nível" data-action="nivel">T${t.nivel}</span>
    <span class="topico-edit-texto" contenteditable="true" data-action="texto">${t.texto}</span>
    <button class="topico-del-btn" data-action="del" title="Excluir">✕</button>`;

  // editar texto
  div.querySelector('[data-action="texto"]').addEventListener('blur', e => {
    t.texto = e.target.textContent.trim() || t.texto;
  });

  // ciclar nível ao clicar no badge
  div.querySelector('[data-action="nivel"]').addEventListener('click', () => {
    t.nivel = t.nivel >= 3 ? 1 : t.nivel + 1;
    div.className = `topico-edit-row nivel-${t.nivel}`;
    div.style.paddingLeft = `${(t.nivel - 1) * 20 + 12}px`;
    div.querySelector('[data-action="nivel"]').className = `nivel-tag n${t.nivel}`;
    div.querySelector('[data-action="nivel"]').textContent = `T${t.nivel}`;
  });

  // excluir
  div.querySelector('[data-action="del"]').addEventListener('click', () => {
    topicosParsed = topicosParsed.filter(x => x.id !== t.id);
    div.remove();
    document.getElementById('parse-count').textContent =
      `${topicosParsed.length} tópico${topicosParsed.length !== 1 ? 's' : ''} novos`;
  });

  return div;
}

// ── drag & drop reordenar ──────────────────────────
function setupDragDrop(container) {
  container.addEventListener('dragstart', e => {
    dragEl = e.target.closest('.topico-edit-row');
    if (dragEl) { dragEl.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
  });

  container.addEventListener('dragend', () => {
    dragEl?.classList.remove('dragging');
    dragOverEl?.classList.remove('drag-over');
    dragEl = dragOverEl = null;
    // sincronizar ordem com topicosParsed
    const ids = [...container.querySelectorAll('.topico-edit-row')].map(el => el.dataset.id);
    topicosParsed.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    const over = e.target.closest('.topico-edit-row');
    if (!over || over === dragEl) return;
    dragOverEl?.classList.remove('drag-over');
    dragOverEl = over;
    over.classList.add('drag-over');

    const rect = over.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    if (e.clientY < mid) container.insertBefore(dragEl, over);
    else container.insertBefore(dragEl, over.nextSibling);
  });

  container.addEventListener('dragleave', e => {
    if (!container.contains(e.relatedTarget)) {
      dragOverEl?.classList.remove('drag-over');
      dragOverEl = null;
    }
  });
}

// ── adicionar tópico manual ────────────────────────
function adicionarManual() {
  const novo = { id: uid(), texto: 'Novo tópico', nivel: 1, status: 'nao_estudado' };
  topicosParsed.push(novo);
  const container = document.getElementById('topicos-editaveis');
  container.appendChild(criarTopicoEl(novo));
  setupDragDrop(container);
  document.getElementById('parse-count').textContent =
    `${topicosParsed.length} tópico${topicosParsed.length !== 1 ? 's' : ''} novos`;
}

// ── salvar ─────────────────────────────────────────
async function salvarFinal() {
  if (!materiaSelecionada || !topicosParsed.length) {
    showToast('Nada pra salvar.', 'warn'); return;
  }

  const existSet = new Set(materiaSelecionada.topicos.map(t => norm(t.texto)));
  const novos    = topicosParsed.filter(t => !existSet.has(norm(t.texto)));

  materiaSelecionada.topicos.push(...novos);
  await updateMateria(materiaSelecionada.id, { topicos: materiaSelecionada.topicos });

  showToast(`${novos.length} tópicos salvos na matéria "${materiaSelecionada.nome}"!`, 'success');

  // reset
  topicosParsed = [];
  document.getElementById('anal-step3').classList.add('hidden');
  document.getElementById('anal-step2').classList.add('hidden');
  document.getElementById('mat-selecionada-info').classList.add('hidden');
  document.getElementById('mat-placeholder').classList.remove('hidden');
  materiaSelecionada = null;
}
