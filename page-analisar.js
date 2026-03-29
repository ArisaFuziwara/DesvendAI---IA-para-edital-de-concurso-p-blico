import { State, uid, norm, showToast, abrirModalConcurso, goPage } from './app.js';
import { CONFIG } from './config.js';
import { getMaterias, addMateria, updateMateria, addHistorico, incrementarUso, getUsoMes } from './firebase.js';
import { CORES } from './app.js';

let analiseAtual = null;

const LOADING_MSGS = [
  'Lendo o edital...', 'Identificando matérias...', 'Mapeando a hierarquia...',
  'Classificando tópicos...', 'Quase lá...',
];

export function initAnalisar() {
  const input   = document.getElementById('topicos-input');
  const btnAnal = document.getElementById('btn-analisar');
  const btnCop  = document.getElementById('btn-copiar-resumo');
  const btnSal  = document.getElementById('btn-salvar-hist');

  input?.addEventListener('input', () => {
    document.getElementById('char-count').textContent = `${input.value.length} caracteres`;
  });

  btnAnal?.addEventListener('click', analisar);
  btnCop?.addEventListener('click',  copiarResumo);
  btnSal?.addEventListener('click',  salvarHistorico);

  document.addEventListener('concursoChanged', () => {
    document.getElementById('results-block')?.classList.add('hidden');
    analiseAtual = null;
  });
}

async function analisar() {
  const c = State.concursoAtivo;
  if (!c) {
    showToast('Selecione ou crie um concurso primeiro.', 'warn');
    return;
  }

  const texto = document.getElementById('topicos-input').value.trim();
  if (!texto) { showToast('Cole os tópicos antes de analisar.', 'warn'); return; }

  // freemium
  const uso = await getUsoMes();
  if (uso >= CONFIG.limiteAnalisesMes) {
    showToast(`Limite de ${CONFIG.limiteAnalisesMes} análises/mês atingido.`, 'warn');
    return;
  }

  const btnAnal = document.getElementById('btn-analisar');
  btnAnal.disabled = true;
  document.getElementById('results-block').classList.add('hidden');
  document.getElementById('loading-block').classList.remove('hidden');

  let i = 0;
  const iv = setInterval(() => {
    document.getElementById('loading-msg').textContent = LOADING_MSGS[i++ % LOADING_MSGS.length];
  }, 1600);

  try {
    const prompt = `Você é especialista em concursos públicos brasileiros.
Analise os tópicos do edital abaixo e retorne uma estrutura hierárquica com matérias e subtópicos.

REGRAS DE HIERARQUIA:
- Nível 1 (T1): A matéria em si (ex: "Direito Constitucional")
- Nível 2 (T2): Subtópico / capítulo dentro da matéria (ex: "Direitos Fundamentais")  
- Nível 3 (T3): Sub-subtópico / item específico (ex: "Direito à vida e à liberdade")
- Se o edital já tiver numeração (1. → 1.1 → 1.1.1), respeite essa hierarquia
- Onde não houver numeração, infira pelo contexto e granularidade do assunto
- Use nomes padronizados para matérias: "Direito Constitucional", "Direito Administrativo", "Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Informática", "Legislação Específica", "Atualidades", etc.

STATUS inicial de todos os tópicos: "nao_estudado"

Responda APENAS JSON válido, sem markdown:
{
  "materias": [
    {
      "nome": "Nome da Matéria",
      "topicos": [
        {
          "id": "t001",
          "texto": "texto do tópico",
          "nivel": 1,
          "filhos": [
            {
              "id": "t002",
              "texto": "subtópico",
              "nivel": 2,
              "filhos": [
                { "id": "t003", "texto": "sub-subtópico", "nivel": 3, "filhos": [] }
              ]
            }
          ]
        }
      ]
    }
  ],
  "total_topicos": 42
}

Tópicos do edital:
${texto}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const raw  = data.content.map(b => b.text || '').join('');
    analiseAtual = JSON.parse(raw.replace(/```json|```/g,'').trim());

    // atribuir IDs únicos se a IA não gerou bem
    normalizarIds(analiseAtual.materias);

    await incrementarUso();
    State.usoMes++;

    const addAosBanco = document.getElementById('check-add-banco')?.checked;
    if (addAosBanco) await mergeNoBanco(analiseAtual.materias, c.id);

    renderAnalise(analiseAtual);
    document.getElementById('results-block').classList.remove('hidden');
    atualizarBadgeFreemium();

  } catch (err) {
    console.error(err);
    showToast('Erro ao analisar. Verifique sua chave da API.', 'warn');
  } finally {
    clearInterval(iv);
    document.getElementById('loading-block').classList.add('hidden');
    btnAnal.disabled = false;
  }
}

function normalizarIds(materias) {
  let n = 0;
  function fix(topicos) {
    topicos.forEach(t => {
      t.id = t.id || uid();
      t.status = t.status || 'nao_estudado';
      n++;
      if (t.filhos?.length) fix(t.filhos);
    });
  }
  materias.forEach(m => fix(m.topicos || []));
}

async function mergeNoBanco(materias, concursoId) {
  const existentes = await getMaterias(concursoId);

  for (const m of materias) {
    let mat = existentes.find(x => norm(x.nome) === norm(m.nome));
    if (!mat) {
      const cor = CORES[existentes.length % CORES.length];
      const flat = flattenTopicos(m.topicos);
      const ref  = await addMateria({ concursoId, nome: m.nome, cor, topicos: flat });
      mat = { id: ref.id, concursoId, nome: m.nome, cor, topicos: flat };
      existentes.push(mat);
    } else {
      const novoFlat = flattenTopicos(m.topicos);
      const existSet = new Set(mat.topicos.map(t => norm(t.texto)));
      const novos    = novoFlat.filter(t => !existSet.has(norm(t.texto)));
      if (novos.length > 0) {
        mat.topicos.push(...novos);
        await updateMateria(mat.id, { topicos: mat.topicos });
      }
    }
  }

  // Recarregar matérias no state
  State.materias = await getMaterias(concursoId);
}

// Flatten hierarquia em array flat, preservando nivel e parentId
function flattenTopicos(topicos, parentId = null) {
  const result = [];
  function walk(arr, pid) {
    arr.forEach(t => {
      result.push({ id: t.id || uid(), texto: t.texto, nivel: t.nivel, status: t.status || 'nao_estudado', parentId: pid });
      if (t.filhos?.length) walk(t.filhos, t.id);
    });
  }
  walk(topicos, parentId);
  return result;
}

function renderAnalise(data) {
  const { materias, total_topicos } = data;

  document.getElementById('results-meta').innerHTML =
    `<strong>${materias.length}</strong> matérias &nbsp;·&nbsp; <strong>${total_topicos}</strong> tópicos identificados`;

  const container = document.getElementById('results-cards');
  container.innerHTML = materias.map((m, i) => {
    const cor = CORES[i % CORES.length];
    return `
      <div class="result-card" id="rc-${i}">
        <div class="result-card-head" onclick="this.closest('.result-card').classList.toggle('open')">
          <div class="result-card-left">
            <div class="materia-dot" style="background:${cor}"></div>
            <span class="result-materia-nome">${m.nome}</span>
          </div>
          <div class="result-card-right">
            <span class="result-badge">${contarTodos(m.topicos)} tópicos</span>
            <span class="chevron">▾</span>
          </div>
        </div>
        <div class="result-body">
          ${renderTopicosHierarquicos(m.topicos)}
        </div>
      </div>`;
  }).join('');
}

function contarTodos(topicos) {
  let n = 0;
  function walk(arr) { arr.forEach(t => { n++; if(t.filhos?.length) walk(t.filhos); }); }
  walk(topicos);
  return n;
}

function renderTopicosHierarquicos(topicos, nivel = 1) {
  return topicos.map(t => `
    <div class="topico-hier nivel-${t.nivel || nivel}" style="padding-left:${(t.nivel-1)*20 + 18}px">
      <span class="nivel-badge n${t.nivel}">T${t.nivel}</span>
      <span class="topico-hier-texto">${t.texto}</span>
    </div>
    ${t.filhos?.length ? renderTopicosHierarquicos(t.filhos, nivel+1) : ''}
  `).join('');
}

function copiarResumo() {
  if (!analiseAtual) return;
  let txt = 'EDITAL ANALISADO\n' + '─'.repeat(30) + '\n\n';
  analiseAtual.materias.forEach(m => {
    txt += `${m.nome.toUpperCase()}\n`;
    function walk(arr, pad = '  ') {
      arr.forEach(t => {
        txt += `${pad}${'T'.repeat(t.nivel || 1)} ${t.texto}\n`;
        if (t.filhos?.length) walk(t.filhos, pad + '  ');
      });
    }
    walk(m.topicos);
    txt += '\n';
  });
  navigator.clipboard.writeText(txt).then(() => showToast('Copiado!', 'success'));
}

async function salvarHistorico() {
  if (!analiseAtual || !State.concursoAtivo) return;
  const nome = prompt('Nome para esta análise:', '');
  if (!nome) return;
  await addHistorico({ concursoId: State.concursoAtivo.id, nome, dados: analiseAtual });
  showToast('Salvo no histórico!', 'success');
}

function atualizarBadgeFreemium() {
  const { atualizarBadgeUso } = window._appFns || {};
  import('./app.js').then(m => m.atualizarBadgeUso());
}
