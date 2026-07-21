// print.js — monta uma versão imprimível do cenário atual (disciplinas, professores,
// salas e configuração) e abre o diálogo de impressão do navegador.

import { S, turmasAtivas } from './state.js';
import { hToB, escAttr, BLOCOS, MAP_HORA } from './util.js';

const e = escAttr;

function tabelaDisciplinas() {
  const linhas = S.disciplinas.slice()
    .sort((a, b) => (a.periodo || 0) - (b.periodo || 0) || String(a.id).localeCompare(String(b.id)))
    .flatMap(d => turmasAtivas(d).map(t => {
      const prof = S.professores.find(p => p.id === t.professorId);
      const tB = hToB(d.t_horas), pB = hToB(d.p_horas);
      const carga = `${tB || 0}T${pB ? ` + ${pB}P` : ''}`;
      const areas = (d.grupos || []).join(', ');
      return `<tr>
        <td class="mono">${e(d.id)}</td>
        <td>${e(d.nome)}</td>
        <td class="ctr">${e(t.turma)}</td>
        <td class="ctr">${e(d.unidade || '')}</td>
        <td class="ctr">${d.periodo ? d.periodo + 'º' : '—'}</td>
        <td class="ctr">${carga}</td>
        <td class="ctr">${pB ? e(d.lab || 'Lab') : '—'}</td>
        <td>${prof ? e(prof.nome) : '<i>—</i>'}</td>
        <td>${e(areas)}</td>
      </tr>`;
    })).join('');
  return `<table>
    <thead><tr>
      <th>Código</th><th>Disciplina</th><th>Turma</th><th>Unid.</th><th>Per.</th>
      <th>Carga</th><th>Lab</th><th>Professor</th><th>Áreas</th>
    </tr></thead>
    <tbody>${linhas || '<tr><td colspan="9"><i>Nenhuma disciplina cadastrada.</i></td></tr>'}</tbody>
  </table>`;
}

function tabelaProfessores() {
  const linhas = S.professores.slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
    .map(p => {
      const pr = p.preferencias || {};
      const prefs = BLOCOS.map(b => `${b}:${pr[b] ?? '—'}`).join('  ');
      const ind = (p.indisponibilidades || []).map(s => `${s.dia} ${s.bloco}`).join(', ') || '—';
      const areas = (p.areasPreferidas || []).join(', ') || '—';
      return `<tr>
        <td class="mono">${e(p.id)}</td>
        <td>${e(p.nome)}</td>
        <td class="ctr">${e(p.unidade || '')}</td>
        <td class="mono small">${e(prefs)}</td>
        <td class="small">${e(ind)}</td>
        <td class="small">${e(areas)}</td>
      </tr>`;
    }).join('');
  return `<table>
    <thead><tr>
      <th>SIAPE</th><th>Nome</th><th>Unid.</th><th>Preferências (peso por bloco)</th>
      <th>Indisponibilidades</th><th>Áreas preferidas</th>
    </tr></thead>
    <tbody>${linhas || '<tr><td colspan="6"><i>Nenhum professor cadastrado.</i></td></tr>'}</tbody>
  </table>`;
}

function tabelaSalas() {
  const linhas = S.salas.slice()
    .sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)) || String(a.id).localeCompare(String(b.id)))
    .map(s => `<tr>
      <td>${e(s.id)}</td>
      <td class="ctr">${e(s.tipo)}</td>
      <td class="ctr">${s.capacidade ?? '—'}</td>
      <td class="ctr">${e(s.bloco || '—')}</td>
    </tr>`).join('');
  return `<table class="narrow">
    <thead><tr><th>Sala</th><th>Tipo</th><th>Capacidade</th><th>Bloco</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="4"><i>Nenhuma sala cadastrada.</i></td></tr>'}</tbody>
  </table>`;
}

function blocoConfig() {
  const c = S.config || {};
  const crit = (c.horariosCriticos || []).join(', ') || '—';
  const legenda = BLOCOS.map(b => `${b} = ${MAP_HORA[b]}`).join('  ·  ');
  return `<table class="narrow">
    <tbody>
      <tr><th>Período letivo</th><td>${c.anoLetivo || '—'}/${c.semestreLetivo || '—'}</td></tr>
      <tr><th>Alunos por turma</th><td>${c.alunosPorTurma ?? '—'}</td></tr>
      <tr><th>Capacidade padrão do laboratório</th><td>${c.capacidadeLabPadrao ?? '—'}</td></tr>
      <tr><th>Horários críticos</th><td>${e(crit)}</td></tr>
      <tr><th>Carga máxima por professor (h/sem.)</th><td>${c.cargaMaxProfessor ?? '—'}</td></tr>
      <tr><th>Limite de tempo do solver (s)</th><td>${c.tempoSolver ?? '—'}</td></tr>
    </tbody>
  </table>
  <p class="legenda">${e(legenda)}</p>`;
}

const ESTILO = `
  * { box-sizing: border-box; }
  body { font: 12px/1.4 -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 20px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccc; }
  .sub { color: #666; font-size: 11px; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  table.narrow { width: auto; min-width: 340px; }
  th, td { border: 1px solid #ddd; padding: 3px 6px; text-align: left; vertical-align: top; }
  thead th { background: #f2f2f2; font-weight: 600; }
  tbody th { background: #f7f7f7; font-weight: 600; white-space: nowrap; }
  td.ctr, th.ctr { text-align: center; }
  .mono { font-family: ui-monospace, Consolas, monospace; }
  .small { font-size: 10px; }
  .legenda { color: #666; font-size: 10px; margin: 4px 0 0; }
  .resumo { color: #444; font-size: 11px; margin: 2px 0 0; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
`;

export function imprimirCenario() {
  const c = S.config || {};
  const nTurmas = S.disciplinas.reduce((n, d) => n + turmasAtivas(d).length, 0);
  const titulo = `Cenário SODD — ${c.anoLetivo || ''}/${c.semestreLetivo || ''}`.trim();
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>${e(titulo)}</title><style>${ESTILO}</style></head><body>
    <h1>SODD — Cenário de Distribuição de Disciplinas</h1>
    <p class="sub">Período letivo ${c.anoLetivo || '—'}/${c.semestreLetivo || '—'} · gerado em ${new Date().toLocaleString('pt-BR')}</p>
    <p class="resumo">${S.disciplinas.length} disciplina(s) · ${nTurmas} turma(s) · ${S.professores.length} professor(es) · ${S.salas.length} sala(s)</p>

    <h2>Disciplinas e turmas</h2>
    ${tabelaDisciplinas()}

    <h2>Professores</h2>
    ${tabelaProfessores()}

    <h2>Salas</h2>
    ${tabelaSalas()}

    <h2>Configuração</h2>
    ${blocoConfig()}
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) return false;   // popup bloqueado
  win.document.open();
  win.document.write(html);
  win.document.close();
  // espera o layout antes de abrir o diálogo de impressão
  win.addEventListener('load', () => { win.focus(); win.print(); });
  return true;
}
