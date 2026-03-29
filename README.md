# Edital Scout v3

> Cole o edital. A gente desvenda.

---

## O que tem nessa versão

- **Análise com hierarquia T1/T2/T3** — a IA respeita a numeração do edital e infere onde não tiver
- **Múltiplos concursos** — gerencie vários editais separados
- **Countdown** — contagem regressiva com urgência visual na home
- **Banco de matérias** — edite tópicos, mude de matéria, ajuste o nível T1/T2/T3
- **Termômetro de progresso** — marque cada tópico como Não estudado / Estudando / Dominado (clique no ícone circular)
- **Cronograma por IA** — informe horas/dia, dias da semana e matérias que já domina; a IA distribui tudo por semanas
- **Freemium** — limite de análises configurável em `config.js`
- **PWA** — instala no celular como app (sem App Store)

---

## Setup (5 minutos)

### 1. Chave Anthropic
→ [console.anthropic.com](https://console.anthropic.com) · API Keys · Create Key
→ Defina spending limit em *Plans & Billing*

### 2. Firebase
1. [console.firebase.google.com](https://console.firebase.google.com) → Novo projeto
2. Adicione Web App → copie `firebaseConfig`
3. **Firestore:** Build → Firestore → Criar → modo produção
4. **Regras:** cole o conteúdo de `firestore.rules` → Publicar
5. **Domínio autorizado:** Project Settings → Authorized domains → `SEU_USER.github.io`

### 3. Preencha `js/config.js`
```js
export const CONFIG = {
  anthropicKey: 'sk-ant-...',
  limiteAnalisesMes: 3,
  firebase: {
    apiKey: '...',
    authDomain: '...',
    projectId: '...',
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
  },
};
```

### 4. GitHub Pages
```bash
git init && git add . && git commit -m "🚀 Edital Scout v3"
git remote add origin https://github.com/SEU_USER/edital-scout.git
git push -u origin main
```
Settings → Pages → Branch main / root → Save.

---

## Estrutura
```
edital-scout/
├── index.html
├── manifest.json        ← PWA
├── sw.js                ← Service Worker
├── css/style.css
├── js/
│   ├── config.js        ← ⚠️ suas chaves
│   ├── firebase.js      ← CRUD Firestore
│   ├── app.js           ← navegação + estado
│   ├── page-home.js     ← countdown + stats
│   ├── page-analisar.js ← análise hierárquica
│   ├── page-materias.js ← banco + progresso
│   └── page-cronograma.js ← cronograma por IA
└── firestore.rules
```

## Coleções Firebase
| Coleção | O que guarda |
|---|---|
| `concursos` | Nome, banca, cargo, data da prova |
| `materias` | Tópicos hierárquicos com status de estudo |
| `historico` | Análises salvas por concurso |
| `cronograma` | Cronograma gerado pela IA |
| `uso` | Contagem de análises para o freemium |
