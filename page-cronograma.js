import { State, showToast, diasAte } from './app.js';
import { CONFIG } from './config.js';
import { getCronograma, saveCronograma, getMaterias } from './firebase.js';

let cronogramaAtual = null;

export function initCronograma() {
  document.getElementById('btn-gerar-cronograma')?.addEventListener('click', gerarCronograma);
  document.getElementById('btn-reimprimir')?.addEventListener('click', () => window.print());
  document.addEventListener('concursoChanged', carregarCronograma);
}

async function carregarCronograma() {
  const c = State.concursoAtivo;
  if (!c) return;
  const cron = await getCronograma(c.id);
  if (cron) {
    cronogramaAtual = cron;
    renderCronograma(cron);
  } else {
    document.getElementById('cron-resultado').classList.add('hidden');
    document.getElementById('cron-form').classList.remove('hidden');
  }
}

async function gerarCronograma() {
  const c = State.concursoAtivo;
  if (!c) { showToast('Selecione um concurso primeiro.', 'warn'); return; }

  const horasDia   = parseInt(document.getElementById('cron-horas').value) || 2;
  const diasSemana = [...document.querySelectorAll('.dia-check:checked')].map(d => d.value);
  const dominaMats = [...document.querySelectorAll('.domina-check:checked')].map(d => d.value);
  const dataProva  = c.dataProva;

  if (!diasSemana.length) { showToast('Selecione pelo menos um dia de estudo.', 'warn'); return; }
  if (!dataProva)         { showToast('Configure a data da prova no concurso.', 'warn'); return; }

  const dias = diasAte(dataProva);
  if (dias <= 0)          { showToast('A data da prova já passou.', 'warn'); return; }

  const mats = State.materias.filter(m => m.concursoId === c.id);
  if (!mats.length)       { showToast('Nenhuma matéria cadastrada para este concurso.', 'warn'); return; }

  const btn = document.getElementById('btn-gerar-cronograma');
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  document.getElementById('cron-loading').classList.remove('hidden');

  try {
    const matsInfo = mats.map(m => ({
      nome: m.nome,
      topicos: m.topicos.length,
      jaEstudei: dominaMats.includes(m.id),
    }));

    const prompt = `Você é um especialista em preparação para concursos públicos brasileiros.
Crie um cronograma de estudos detalhado e realista.

DADOS DO CONCURSO:
- Nome: ${c.nome}
- Cargo: ${c.cargo || 'não informado'}
- Banca: ${c.banca || 'não informada'}
- Data da prova: ${dataProva} (em ${dias} dias)

DISPONIBILIDADE:
- Horas de estudo por dia: ${horasDia}h
- Dias da semana que estuda: ${diasSemana.join(', ')}

MATÉRIAS:
${matsInfo.map(m => `- ${m.nome}: ${m.topicos} tópicos${m.jaEstudei ? ' (JÁ TENHO BASE — dar menos tempo)' : ''}`).join('\n')}

INSTRUÇÕES:
1. Distribua o tempo proporcionalmente ao número de tópicos
2. Matérias com "JÁ TENHO BASE" devem ter 40% menos tempo que o proporcional
3. Reserve a última semana para revisão geral
4. Agrupe o cronograma por semanas, não por dias individuais (mais prático)
5. Cada semana: quais matérias estudar e quantas horas dedicar a cada uma
6. Inclua dicas específicas para a banca se souber (CESPE = questões certas/erradas, FCC = gramática pesada, etc.)

Responda APENAS JSON válido, sem markdown:
{
  "resumo": {
    "totalSemanas": 8,
    "horasSemanais": 14,
    "totalHoras": 112,
    "dicaBanca": "Dica específica sobre a banca ou estilo de prova"
  },
  "semanas": [
    {
      "numero": 1,
      "tema": "Tema ou foco da semana",
      "dataInicio": "YYYY-MM-DD",
      "materias": [
        { "nome": "Direito Constitucional", "horas": 6, "topicos": "Princípios fundamentais, Direitos e garantias" }
      ],
      "meta": "O que o aluno deve conseguir fazer ao final da semana",
      "revisao": false
    }
  ]
}`;

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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const raw  = data.content.map(b => b.text || '').join('');
    cronogramaAtual = JSON.parse(raw.replace(/```json|```/g,'').trim());

    await saveCronograma(c.id, cronogramaAtual);
    renderCronograma(cronogramaAtual);
    document.getElementById('cron-form').classList.add('hidden');
    document.getElementById('cron-resultado').classList.remove('hidden');
    showToast('Cronograma gerado!', 'success');

  } catch (err) {
    console.error(err);
    showToast('Erro ao gerar cronograma.', 'warn');
  } finally {
    document.getElementById('cron-loading').classList.add('hidden');
    btn.disabled = false;
    btn.textContent = 'Gerar cronograma';
  }
}

function renderCronograma(cron) {
  const { resumo, semanas } = cron;

  document.getElementById('cron-total-semanas').textContent = resumo.totalSemanas;
  document.getElementById('cron-horas-semana').textContent  = resumo.horasSemanais + 'h';
  document.getElementById('cron-total-horas').textContent   = resumo.totalHoras + 'h';
  document.getElementById('cron-dica-banca').textContent    = resumo.dicaBanca || '—';

  const grid = document.getElementById('cron-semanas-grid');
  grid.innerHTML = semanas.map(s => `
    <div class="semana-card ${s.revisao ? 'semana-revisao' : ''}">
      <div class="semana-header">
        <div class="semana-num">Semana ${s.numero}</div>
        <div class="semana-tema">${s.tema}</div>
        ${s.revisao ? '<span class="semana-badge-rev">Revisão</span>' : ''}
      </div>
      <div class="semana-materias">
        ${s.materias.map(m => `
          <div class="semana-mat-row">
            <div class="semana-mat-info">
              <span class="semana-mat-nome">${m.nome}</span>
              <span class="semana-mat-top">${m.topicos}</span>
            </div>
            <span class="semana-mat-horas">${m.horas}h</span>
          </div>`).join('')}
      </div>
      <div class="semana-meta">🎯 ${s.meta}</div>
    </div>`).join('');

  document.getElementById('cron-resultado').classList.remove('hidden');
}

// Popular checkboxes de matérias no form
export function popularMateriasDomina() {
  const c = State.concursoAtivo;
  if (!c) return;
  const mats = State.materias.filter(m => m.concursoId === c.id);
  const container = document.getElementById('domina-list');
  if (!container) return;
  container.innerHTML = mats.length
    ? mats.map(m => `
        <label class="check-row">
          <input type="checkbox" class="domina-check" value="${m.id}" />
          <span>${m.nome}</span>
        </label>`).join('')
    : '<p style="font-size:13px;color:var(--text3)">Nenhuma matéria cadastrada ainda.</p>';
}
