import { CONFIG } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const fbApp = initializeApp(CONFIG.firebase);
export const db = getFirestore(fbApp);

// ── coleções ───────────────────────────────────────
const C = {
  concursos:  'concursos',   // { nome, banca, cargo, dataProva, criadoEm }
  materias:   'materias',    // { concursoId, nome, cor, topicos:[{id,texto,nivel,status}] }
  historico:  'historico',   // { concursoId, nome, dados, criadoEm }
  cronograma: 'cronograma',  // { concursoId, semanas:[...], geradoEm }
  uso:        'uso',         // { mes, analises }  — controle freemium
};

// ── concursos ──────────────────────────────────────
export async function getConcursos() {
  const snap = await getDocs(query(collection(db, C.concursos), orderBy('criadoEm', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addConcurso(dados) {
  return addDoc(collection(db, C.concursos), { ...dados, criadoEm: serverTimestamp() });
}
export async function updateConcurso(id, dados) {
  return updateDoc(doc(db, C.concursos, id), dados);
}
export async function deleteConcurso(id) {
  return deleteDoc(doc(db, C.concursos, id));
}

// ── matérias ───────────────────────────────────────
export async function getMaterias(concursoId) {
  const snap = await getDocs(query(collection(db, C.materias), orderBy('nome')));
  const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return concursoId ? todas.filter(m => m.concursoId === concursoId) : todas;
}
export async function saveMaterias(materias) {
  const promises = materias.map(m => {
    if (m.id) return updateDoc(doc(db, C.materias, m.id), m);
    return addDoc(collection(db, C.materias), m);
  });
  return Promise.all(promises);
}
export async function updateMateria(id, dados) {
  return updateDoc(doc(db, C.materias, id), dados);
}
export async function addMateria(dados) {
  return addDoc(collection(db, C.materias), dados);
}
export async function deleteMateria(id) {
  return deleteDoc(doc(db, C.materias, id));
}

// ── histórico ──────────────────────────────────────
export async function getHistorico(concursoId) {
  const snap = await getDocs(query(collection(db, C.historico), orderBy('criadoEm', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(h => h.concursoId === concursoId);
}
export async function addHistorico(dados) {
  return addDoc(collection(db, C.historico), { ...dados, criadoEm: serverTimestamp() });
}
export async function deleteHistorico(id) {
  return deleteDoc(doc(db, C.historico, id));
}

// ── cronograma ─────────────────────────────────────
export async function getCronograma(concursoId) {
  const ref = doc(db, C.cronograma, concursoId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function saveCronograma(concursoId, dados) {
  return setDoc(doc(db, C.cronograma, concursoId), { ...dados, geradoEm: serverTimestamp() });
}

// ── uso / freemium ─────────────────────────────────
function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export async function getUsoMes() {
  const mes = getMesAtual();
  const ref = doc(db, C.uso, mes);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().analises : 0;
}
export async function incrementarUso() {
  const mes = getMesAtual();
  const ref = doc(db, C.uso, mes);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data().analises : 0;
  await setDoc(ref, { mes, analises: atual + 1 });
  return atual + 1;
}
