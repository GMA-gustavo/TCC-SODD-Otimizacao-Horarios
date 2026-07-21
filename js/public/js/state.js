// state.js — estado global do cenário, migração e persistência

import { GRUPOS_ORDEM } from './util.js';

// Estado em memória compartilhado por todas as páginas (modelo de curso único)
export const S = {
  disciplinas: [],
  professores: [],
  salas: [],
  grupos: [...GRUPOS_ORDEM],   // áreas temáticas (nomes)
  config: {
    alunosPorTurma: 45, capacidadeLabPadrao: 40, horariosCriticos: ['M1', 'T3'],
    tempoSolver: 120, cargaMaxProfessor: 180,
    anoLetivo: 2026, semestreLetivo: 1, dataInicioPeriodo: '', dataFimPeriodo: '',
  },
};

// ── Disciplinas / Turmas ────────────────────────────────────────────────────
// Disciplina = { id, nome, unidade, grupo, periodo, t_horas, p_horas, lab, permiteDobra, turmas: [Turma] }
// Turma      = { turma, alunos, professorId, situacao, necessidadesEspeciais, observacao }
export function migrarDisciplina(d) {
  if (!Array.isArray(d.turmas) || !d.turmas.length) {
    d.turmas = [{
      turma: 'S',
      alunos: d.alunos ?? S.config.alunosPorTurma,
      professorId: d.professorId ?? null,
      situacao: 'Ativa',
      necessidadesEspeciais: false,
      observacao: '',
    }];
  }
  // por padrão a prática pode dobrar (split A/B) ao exceder a capacidade do lab;
  // disciplinas de carga fixa devem marcar permiteDobra = false
  if (d.permiteDobra === undefined) d.permiteDobra = true;
  // áreas são etiquetas: a disciplina pode pertencer a várias (d.grupos: [nome])
  if (!Array.isArray(d.grupos)) d.grupos = d.grupo ? [d.grupo] : [];
  delete d.grupo; delete d.cursos; delete d.curso; delete d.alunos; delete d.professorId;
  return d;
}

export function turmasAtivas(d) { return (d.turmas || []).filter(t => t.situacao !== 'Inativa'); }
export function areasDaDisc(d) { return d.grupos || []; }

// ── Áreas (grupos) — nomes simples ──────────────────────────────────────────
const nomeGrupo = g => (typeof g === 'string' ? g : g.nome);   // aceita dados antigos (objeto)
export function nomesGrupos() { return S.grupos.slice(); }

// ── Persistência ────────────────────────────────────────────────────────────
export function aplicarCenario(data) {
  if (data.config)              Object.assign(S.config, data.config);
  if (data.disciplinas?.length) S.disciplinas = data.disciplinas.map(migrarDisciplina);
  if (data.professores?.length) S.professores = data.professores.map(p => ({ ...p, areasPreferidas: Array.isArray(p.areasPreferidas) ? p.areasPreferidas : [] }));
  if (data.salas?.length)       S.salas       = data.salas.map(s => ({ ...s, bloco: s.bloco || '' }));
  if (data.grupos?.length)      S.grupos      = data.grupos.map(nomeGrupo);
}

export async function carregarCenario() {
  try {
    const res  = await fetch('/api/cenario');
    const data = await res.json();
    aplicarCenario(data);
  } catch {
    const saved = localStorage.getItem('sodd_cenario');
    if (saved) try { aplicarCenario(JSON.parse(saved)); } catch {}
  }
}

export async function salvarCenario() {
  const data = { disciplinas: S.disciplinas, professores: S.professores, salas: S.salas, grupos: S.grupos, config: S.config };
  try {
    await fetch('/api/cenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch {
    localStorage.setItem('sodd_cenario', JSON.stringify(data));
  }
}

let _saveTimer = null;
export function autoSave() { clearTimeout(_saveTimer); _saveTimer = setTimeout(salvarCenario, 1200); }

// Atualiza os contadores nas abas da casca (existem em index.html)
export function updateTabBadges() {
  const set = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? '' : 'none';
  };
  set('bdg-disc', S.disciplinas.length);
  set('bdg-prof', S.professores.length);
  set('bdg-sala', S.salas.length);
}
