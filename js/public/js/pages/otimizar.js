// pages/otimizar.js — resumo do cenário, execução do solver e relatório completo

import { S, turmasAtivas, aplicarCenario, updateTabBadges, autoSave } from '../state.js';
import { hToB, escAttr, toast, lerArquivoJSON, baixarCSV, GRUPOS_ORDEM, DIAS, MAP_HORA, MAP_HORA_FIM, BLOCOS_ALL, CRITICOS } from '../util.js';

let host = null;
let ultimoResultado = null;   // último resultado do solver (para exportar a tabela)
let ultimoInput = null;
const $ = id => document.getElementById(id);

// ── Resumo do cenário (pré-otimização) ───────────────────────────────────────
function calcSessoes() {
  let total = 0, splits = 0;
  const cap = S.config.capacidadeLabPadrao;
  S.disciplinas.forEach(d => {
    turmasAtivas(d).forEach(t => {
      const al = t.alunos ?? S.config.alunosPorTurma;
      if (hToB(d.t_horas) > 0) total++;
      if (hToB(d.p_horas) > 0) {
        if (al > cap && d.permiteDobra !== false) { total += 2; splits++; } else total++;
      }
    });
  });
  return { total, splits };
}

function atuResumo() {
  $('r-disc').textContent = S.disciplinas.length;
  $('r-prof').textContent = S.professores.length;
  $('r-sala').textContent = S.salas.length;
  const { total, splits } = calcSessoes();
  $('r-sess').textContent  = total;
  $('r-split').textContent = splits;

  // Professores que receberão sessões — usa o mesmo planejamento de atribuição do solver
  const profsAtivos = new Set(planejarAtribuicao(S.disciplinas).values());
  const nAtivos = profsAtivos.size;
  const nTotal  = S.professores.length;
  const elAtivos = $('r-prof-ativos');
  if (nTotal > 0) {
    elAtivos.textContent = nAtivos === nTotal ? `${nAtivos} (todos)` : `${nAtivos} de ${nTotal}`;
    elAtivos.style.color = nAtivos < nTotal ? 'var(--c-warn-text)' : 'var(--c-ok-text)';
  } else {
    elAtivos.textContent = '—';
  }

  // Salas por tipo
  const normais = S.salas.filter(s => s.tipo === 'Normal').length;
  const labs    = S.salas.length - normais;
  $('r-sala-det').textContent = S.salas.length > 0 ? `${normais} normais / ${labs} lab${labs !== 1 ? 's' : ''}` : '—';

  // Avisos
  const avisos = [];
  if (nTotal > 0 && nAtivos < nTotal) {
    const inativos = nTotal - nAtivos;
    avisos.push(`<div class="bdg bdg-warn" style="font-size:11px;border-radius:6px;padding:5px 9px;display:block;line-height:1.4">
      ⚠ ${inativos} professor${inativos > 1 ? 'es' : ''} sem disciplina atribuída não aparecer${inativos > 1 ? 'ão' : 'á'} na grade.
      As salas também só aparecem se forem usadas — o solver usa o mínimo necessário.
    </div>`);
  }
  if (normais === 0 && S.disciplinas.some(d => hToB(d.t_horas) > 0)) {
    avisos.push(`<div class="bdg bdg-err" style="font-size:11px;border-radius:6px;padding:5px 9px;display:block;line-height:1.4">
      ✕ Nenhuma sala Normal cadastrada — aulas teóricas não terão onde ser alocadas.
    </div>`);
  }
  if (labs === 0 && S.disciplinas.some(d => hToB(d.p_horas) > 0)) {
    avisos.push(`<div class="bdg bdg-err" style="font-size:11px;border-radius:6px;padding:5px 9px;display:block;line-height:1.4">
      ✕ Nenhum laboratório cadastrado — aulas práticas não terão onde ser alocadas.
    </div>`);
  }
  // Disciplinas de carga fixa (não dobram) que excedem a capacidade do lab → conflito
  const capLab = S.config.capacidadeLabPadrao;
  const conflitos = S.disciplinas.filter(d =>
    d.permiteDobra === false && hToB(d.p_horas) > 0 &&
    turmasAtivas(d).some(t => (t.alunos ?? S.config.alunosPorTurma) > capLab));
  if (conflitos.length) {
    const itens = conflitos.map(d => {
      const maxAl = Math.max(...turmasAtivas(d).map(t => t.alunos ?? S.config.alunosPorTurma));
      return `<li>${d.id} — ${d.nome} (${maxAl} alunos &gt; ${capLab})</li>`;
    }).join('');
    avisos.push(`<div class="bdg bdg-err" style="font-size:11px;border-radius:6px;padding:6px 9px;display:block;line-height:1.5">
      ⛔ ${conflitos.length} disciplina(s) marcada(s) para <strong>não dobrar</strong> excedem a capacidade do laboratório.
      A prática não será dividida (a carga do professor é preservada), mas há conflito físico de lotação — ajuste as vagas ou o laboratório:
      <ul style="margin:4px 0 0;padding-left:18px">${itens}</ul>
    </div>`);
  }
  // Carga máxima por professor (pré-otimização, considerando o efeito das dobras)
  const limite = S.config.cargaMaxProfessor || 0;
  if (limite > 0 && S.professores.length && S.disciplinas.length) {
    const carga = cargaHorariaHoras(buildInput());
    const acima = Object.values(carga)
      .filter(c => (c.base + c.extra) > limite)
      .sort((a, b) => (b.base + b.extra) - (a.base + a.extra));
    if (acima.length) {
      const itens = acima.map(c => {
        const total = c.base + c.extra;
        const porDobra = c.extra > 0 ? ` — inclui +${c.extra}h de dobra` : '';
        return `<li>${c.nome}: <strong>${total}h</strong> (limite ${limite}h)${porDobra}</li>`;
      }).join('');
      avisos.push(`<div class="bdg bdg-err" style="font-size:11px;border-radius:6px;padding:6px 9px;display:block;line-height:1.5">
        ⚠ ${acima.length} professor${acima.length > 1 ? 'es' : ''} acima da carga máxima de ${limite}h/semestre:
        <ul style="margin:4px 0 0;padding-left:18px">${itens}</ul>
      </div>`);
    }
  }
  $('r-avisos').innerHTML = avisos.join('<div style="height:5px"></div>');
}

// Ordena as disciplinas por área (para agrupar afinidades) e período
function ordenarDisciplinas(disciplinas) {
  return [...disciplinas].sort((a, b) => {
    const ga = GRUPOS_ORDEM.indexOf((a.grupos || [])[0] ?? 'zzz'), gb = GRUPOS_ORDEM.indexOf((b.grupos || [])[0] ?? 'zzz');
    return ga !== gb ? ga - gb : a.periodo - b.periodo;
  });
}

// Planeja a atribuição professor↔turma. Turmas com professor manual são respeitadas;
// as automáticas priorizam docentes que preferem alguma área da disciplina (bônus de
// preferência de área) e, entre os candidatos, o menos carregado (para distribuir).
function planejarAtribuicao(disciplinas) {
  const facom = S.professores.filter(p => p.unidade === 'FACOM');
  const famat = S.professores.filter(p => p.unidade === 'FAMAT');
  const carga = new Map();
  const load = id => carga.get(id) || 0;
  const inc  = id => carga.set(id, load(id) + 1);
  // pré-conta as atribuições manuais para equilibrar as automáticas
  disciplinas.forEach(d => turmasAtivas(d).forEach(t => {
    if (t.professorId && S.professores.find(p => p.id === t.professorId)) inc(t.professorId);
  }));
  const mapa = new Map();
  ordenarDisciplinas(disciplinas).forEach(d => {
    if (!hToB(d.t_horas) && !hToB(d.p_horas)) return;
    const pool = d.unidade === 'FACOM' ? facom : famat;
    const areasD = new Set(d.grupos || []);
    turmasAtivas(d).forEach(t => {
      let profId = (t.professorId && S.professores.find(p => p.id === t.professorId)) ? t.professorId : null;
      if (!profId) {
        if (!pool.length) return;
        const preferem = pool.filter(p => (p.areasPreferidas || []).some(a => areasD.has(a)));
        const cand = preferem.length ? preferem : pool;
        let best = cand[0];
        cand.forEach(p => { if (load(p.id) < load(best.id)) best = p; });
        profId = best.id;
      }
      inc(profId);
      mapa.set(`${d.id}~${t.turma}`, profId);
    });
  });
  return mapa;
}

// ── Montagem do input do solver ───────────────────────────────────────────────
function buildInput(disciplinas = S.disciplinas, salas = S.salas) {
  const cap       = S.config.capacidadeLabPadrao;
  const alunosDef = S.config.alunosPorTurma;
  const atrib     = planejarAtribuicao(disciplinas);
  const demandas = [];
  ordenarDisciplinas(disciplinas).forEach(d => {
    const tB = hToB(d.t_horas), pB = hToB(d.p_horas);
    if (!tB && !pB) return;
    turmasAtivas(d).forEach(t => {
      const tag = `${d.id}~${t.turma}`;
      const prof = S.professores.find(p => p.id === atrib.get(tag));
      if (!prof) return;
      const al  = t.alunos ?? alunosDef;
      const rot = `${d.id}/${t.turma} - ${d.nome}`;
      if (tB) demandas.push({ id: `${tag}_TEORIA`, prof: prof.id, disc: `${rot} (Teoria)`, periodo: d.periodo, tipo_sala: 'Normal', blocos_necessarios: tB });
      if (pB) {
        // só divide em A/B se a disciplina permite dobra (carga fixa não dobra)
        if (al > cap && d.permiteDobra !== false) {
          ['A', 'B'].forEach(sub => demandas.push({ id: `${tag}_PRATICA_${sub}`, prof: prof.id, disc: `${rot} (Lab ${sub})`, periodo: d.periodo, tipo_sala: d.lab || 'Lab', blocos_necessarios: pB }));
        } else {
          demandas.push({ id: `${tag}_PRATICA`, prof: prof.id, disc: `${rot} (Lab)`, periodo: d.periodo, tipo_sala: d.lab || 'Lab', blocos_necessarios: pB });
        }
      }
    });
  });
  return {
    salas,
    professores: S.professores.map(p => ({ id: p.id, nome: p.nome, preferencias: p.preferencias || {}, indisponibilidades: p.indisponibilidades || [] })),
    demandas,
    config: { horarios_criticos: S.config.horariosCriticos, tempo_solver: S.config.tempoSolver || 120 },
  };
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportarJSON() {
  const blob = new Blob([JSON.stringify(buildInput(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'cenario_sodd.json'; a.click();
  toast('JSON exportado', 'ok');
}

// yyyy-mm-dd → dd/mm/yyyy (formato da oferta da UFU); vazio → ''
function formatarData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

// Exporta a grade gerada como tabela (CSV/Excel) no formato da Oferta de Disciplinas
function exportarTabela() {
  const r = ultimoResultado;
  const alocs = r && r.alocacoes ? r.alocacoes : [];
  if (!alocs.length) { toast('Rode a otimização antes de exportar a tabela', 'err'); return; }
  const cfg = S.config;
  const periodoLabel = `${cfg.anoLetivo}/${cfg.semestreLetivo}`;
  const dataIni = formatarData(cfg.dataInicioPeriodo);
  const dataFim = formatarData(cfg.dataFimPeriodo);
  const blocoDaSala = id => S.salas.find(s => s.id === id)?.bloco || '';   // bloco é informativo da sala

  const cab = ['Código', 'Turma', 'Disciplina', 'Unidade', 'Período Ideal', 'Vagas Ofertadas',
    'Dia', 'Hora Início', 'Hora Fim', 'Tipo de Aula', 'Sala', 'Bloco', 'Professor',
    'Data Início', 'Data Fim', 'Ano/Período', 'Situação'];
  const linhas = [cab];

  const ordemDia   = { Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5 };
  const ordemBloco = { M1: 1, M2: 2, M3: 3, T1: 4, T2: 5, T3: 6 };
  [...alocs].sort((a, b) =>
    (a.Periodo || '').localeCompare(b.Periodo || '', 'pt', { numeric: true }) ||
    (ordemDia[a.Dia] || 9) - (ordemDia[b.Dia] || 9) ||
    (ordemBloco[a.Bloco] || 9) - (ordemBloco[b.Bloco] || 9)
  ).forEach(a => {
    const m = (a.Materia || '').match(/^(.+?)\/(.+?) - (.+) \(([^)]+)\)\s*$/);
    const cod   = m ? m[1] : '';
    const turma = m ? m[2] : '';
    const nome  = m ? m[3] : (a.Materia || '');
    const tipoLabel = m ? m[4] : '';
    const tipoAula = (a.Tipo === 'Normal' || /Teoria/i.test(tipoLabel)) ? 'Teórica' : 'Prática';
    const disc = S.disciplinas.find(d => d.id === cod);
    const turmaObj = disc?.turmas?.find(t => t.turma === turma);
    linhas.push([
      cod, turma, nome,
      disc?.unidade || '',
      disc?.periodo ?? '',
      turmaObj?.alunos ?? '',
      a.Dia || '',
      MAP_HORA[a.Bloco] || '',
      MAP_HORA_FIM[a.Bloco] || '',
      tipoAula,
      a.Sala || '',
      blocoDaSala(a.Sala),
      a.Professor || '',
      dataIni, dataFim, periodoLabel, 'MATRÍCULA',
    ]);
  });

  const slug = ($('nome-exp')?.value || 'grade').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30) || 'grade';
  baixarCSV(`oferta_${slug}_${cfg.anoLetivo}-${cfg.semestreLetivo}.csv`, linhas);
  toast('Tabela exportada (CSV/Excel)', 'ok');
}

function exportarRelatorio() {
  const conteudo = $('resultado')?.innerHTML || '';
  if (!conteudo.trim()) { toast('Nenhum resultado para exportar — rode a otimização primeiro', 'err'); return; }
  const nomeExp = $('nome-exp')?.value || 'Resultado';
  const estilos = [...document.styleSheets].map(ss => {
    try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; }
  }).join('\n');
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${nomeExp} — SODD</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; }
body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; margin: 32px; background: oklch(97% 0.007 258); color: oklch(33% 0.013 258); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
${estilos}
/* overrides para modo standalone */
.rep-section { margin-bottom: 28px; }
details[open] summary { margin-bottom: 8px; }
</style>
</head>
<body>
${conteudo}
</body>
</html>`;
  const slug = nomeExp.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 40) || 'resultado';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `sodd_${slug}.html`; a.click();
  toast('Relatório exportado', 'ok');
}

// ── Execução (uma rodada por bloco) ───────────────────────────────────────────
async function otimizar() {
  if (!S.disciplinas.length || !S.professores.length || !S.salas.length) {
    toast('Configure disciplinas, professores e salas antes de otimizar', 'err'); return;
  }
  const btn    = $('btn-otm');
  const status = $('otm-status');
  btn.disabled = true; btn.textContent = 'Otimizando…';
  status.style.display = 'block';
  status.innerHTML = 'Solver CP-SAT em execução — aguarde…';
  $('resultado-wrap').style.display = 'none';
  const input = buildInput();
  try {
    const res = await fetch('/api/otimizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const r = await res.json();
    renderResultado(r, input);
    const cls = r.status === 'OPTIMAL' ? 'st-ok' : r.status === 'FEASIBLE' ? 'st-warn' : 'st-err';
    status.innerHTML = `<span class="${cls}">${r.status}</span> — ${(r.tempo_execucao || 0).toFixed(2)}s · ${r.pontuacao_objetivo || 0} pts · ${(r.alocacoes || []).length} alocações`;
  } catch (e) {
    status.innerHTML = `<span class="st-err">Erro:</span> ${e.message} — verifique se o servidor está rodando`;
  } finally {
    btn.disabled = false; btn.textContent = 'Iniciar Otimização';
  }
}

// ── Diagnóstico T/P ────────────────────────────────────────────────────────────
function relatarCargasHTML(input) {
  const discMap = {};
  (input.demandas || []).forEach(s => {
    let baseId, tipo;
    if      (s.id.endsWith('_TEORIA'))    { baseId = s.id.replace(/_TEORIA$/, '');    tipo = 'teoria'; }
    else if (s.id.endsWith('_PRATICA_A')) { baseId = s.id.replace(/_PRATICA_A$/, ''); tipo = 'pratica_a'; }
    else if (s.id.endsWith('_PRATICA_B')) { baseId = s.id.replace(/_PRATICA_B$/, ''); tipo = 'pratica_b'; }
    else if (s.id.endsWith('_PRATICA'))   { baseId = s.id.replace(/_PRATICA$/, '');   tipo = 'pratica'; }
    else                                  { baseId = s.id;                             tipo = 'teoria'; }
    const [discId, turma] = baseId.split('~');

    if (!discMap[baseId]) discMap[baseId] = { discId, turma: turma || '', periodo: s.periodo, teoriaB: 0, praticaB: 0, split: false, lab: s.tipo_sala, numSessoes: 0 };
    const e = discMap[baseId];
    if      (tipo === 'teoria')   { e.teoriaB = s.blocos_necessarios; e.numSessoes++; }
    else if (tipo === 'pratica')  { e.praticaB = s.blocos_necessarios; e.lab = s.tipo_sala; e.numSessoes++; }
    else if (tipo === 'pratica_a'){ e.praticaB = s.blocos_necessarios; e.lab = s.tipo_sala; if (!e.split) { e.split = true; e.numSessoes += 2; } }
    // pratica_b: já contabilizado em pratica_a
  });

  const totalDiscs = Object.keys(discMap).length;
  const comPratica = Object.values(discMap).filter(d => d.praticaB > 0).length;
  const comSplit   = Object.values(discMap).filter(d => d.split).length;
  const totalSess  = (input.demandas || []).length;

  let linhas = '';
  Object.values(discMap)
    .sort((a, b) => a.periodo - b.periodo || a.discId.localeCompare(b.discId) || a.turma.localeCompare(b.turma))
    .forEach(d => {
      const disc     = S.disciplinas.find(x => x.id === d.discId);
      const nomeDsc  = disc?.nome || d.discId;
      const turmaObj = disc?.turmas?.find(t => t.turma === d.turma);
      const splitStr = d.praticaB > 0 ? (d.split ? '✂ A+B' : '—') : '—';
      const labStr   = d.praticaB > 0 && d.lab && d.lab !== 'Normal' ? d.lab : '—';
      const necEsp   = turmaObj?.necessidadesEspeciais
        ? '<span class="badge b-yellow">♿ Sim</span>' : '<span style="color:var(--c-faint)">—</span>';
      const obs      = turmaObj?.observacao
        ? escAttr(turmaObj.observacao) : '<span style="color:var(--c-faint)">—</span>';
      linhas += `<tr${d.split ? ' style="background:var(--c-warn-bg)"' : ''}>
        <td style="font-family:monospace;font-size:11px">${d.discId}</td>
        <td style="text-align:center"><span class="badge b-blue">${d.turma || '—'}</span></td>
        <td style="text-align:left">${nomeDsc}</td>
        <td style="text-align:center">${d.periodo}º</td>
        <td style="text-align:center;color:${d.teoriaB  > 0 ? 'var(--c-ok-text)'   : 'var(--c-faint)'};font-weight:${d.teoriaB  > 0 ? '600' : '400'}">${d.teoriaB  || '—'}</td>
        <td style="text-align:center;color:${d.praticaB > 0 ? 'var(--c-warn-text)' : 'var(--c-faint)'};font-weight:${d.praticaB > 0 ? '600' : '400'}">${d.praticaB || '—'}</td>
        <td style="font-size:11px;color:var(--c-muted)">${labStr}</td>
        <td style="text-align:center;color:${d.split ? 'var(--c-danger-text)' : 'var(--c-faint)'};font-weight:${d.split ? '700' : '400'}">${splitStr}</td>
        <td style="text-align:center;font-weight:700;color:var(--c-accent-text)">${d.numSessoes}</td>
        <td style="text-align:center">${necEsp}</td>
        <td style="font-size:11px;color:var(--c-muted);max-width:200px">${obs}</td>
      </tr>`;
    });

  return `<div class="rep-section">
    <h3 class="rep-h3">Verificação de Cargas T/P
      <small style="color:var(--c-muted);font-weight:400;margin-left:6px">diagnóstico pré-otimização das componentes teórico-práticas</small>
    </h3>
    <div class="bdg-row">
      <span class="bdg bdg-ok">📚 ${totalDiscs} turma(s)</span>
      <span class="bdg bdg-warn">🔬 ${comPratica} com prática</span>
      <span class="bdg bdg-err">✂ ${comSplit} com split A+B</span>
      <span class="bdg bdg-ok">📦 ${totalSess} sessões ao solver</span>
    </div>
    <details style="margin-top:4px">
      <summary style="cursor:pointer;font-size:12px;color:var(--c-accent);padding:4px 0">▶ Ver tabela completa (${totalDiscs} turma(s))</summary>
      <div style="overflow-x:auto;margin-top:10px">
        <table class="rep-tbl" style="font-size:12px">
          <thead><tr>
            <th>Código</th><th>Turma</th><th>Disciplina</th><th>Per.</th>
            <th>Teoria<br><small style="font-weight:400">(bl/sem)</small></th>
            <th>Prática<br><small style="font-weight:400">(bl/sem)</small></th>
            <th>Lab</th><th>Split?</th><th>Sessões</th><th>Nec.<br>esp.</th><th>Observação</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </details>
  </div>`;
}

// ── Carga horária por professor (em horas semestrais) ────────────────────────
// Base  = carga prevista da disciplina (T + P, prática contada uma vez).
// Extra = horas de prática adicionais geradas por dobras de turma (a cópia B do lab).
// Total = base + extra. Usa as horas reais da matriz (S.disciplinas), não os blocos.
function cargaHorariaHoras(input) {
  const nomePorId = {};
  (input.professores || []).forEach(p => { nomePorId[p.id] = p.nome; });
  const map = {};
  const get = id => (map[id] || (map[id] = { nome: nomePorId[id] || id, base: 0, extra: 0, dobras: 0 }));
  (input.demandas || []).forEach(s => {
    let tipo, base;
    if      (s.id.endsWith('_TEORIA'))    { tipo = 'teoria';    base = s.id.replace(/_TEORIA$/, ''); }
    else if (s.id.endsWith('_PRATICA_A')) { tipo = 'pratica_a'; base = s.id.replace(/_PRATICA_A$/, ''); }
    else if (s.id.endsWith('_PRATICA_B')) { tipo = 'pratica_b'; base = s.id.replace(/_PRATICA_B$/, ''); }
    else if (s.id.endsWith('_PRATICA'))   { tipo = 'pratica';   base = s.id.replace(/_PRATICA$/, ''); }
    else return;
    const discId = base.split('~')[0];
    const disc = S.disciplinas.find(d => d.id === discId);
    if (!disc) return;
    const e = get(s.prof);
    if      (tipo === 'teoria')                          e.base  += disc.t_horas || 0;
    else if (tipo === 'pratica' || tipo === 'pratica_a') e.base  += disc.p_horas || 0;
    else if (tipo === 'pratica_b')                     { e.extra += disc.p_horas || 0; e.dobras += 1; }
  });
  return map;
}

// Grades (timetables) por período para um conjunto de alocações
function gradesPorPeriodo(alocacoes, salasTurma) {
  const periodos = [...new Set(alocacoes.map(a => a.Periodo))].sort();
  let out = '';
  periodos.forEach(per => {
    const numP     = per.replace('º Período', '').trim();
    const salaBase = salasTurma[numP] || null;
    const aulas    = alocacoes.filter(a => a.Periodo === per);
    const usados   = BLOCOS_ALL.filter(b => aulas.some(a => a.Bloco === b));
    if (!usados.length) return;
    const teo    = aulas.filter(a => a.Tipo === 'Normal');
    const naBase = salaBase ? teo.filter(a => a.Sala === salaBase).length : 0;
    const pctS   = teo.length ? Math.round(naBase / teo.length * 100) : 0;
    const badgeSala = salaBase ? `<span class="bdg bdg-ok" style="font-size:11px;margin-left:8px">🏠 ${salaBase} (${pctS}%)</span>` : '';
    let rows = '';
    usados.forEach(b => {
      const crit = CRITICOS.has(b);
      rows += `<tr><td class="hora${crit ? ' crit' : ''}">${MAP_HORA[b]}<br><small>${b}${crit ? ' ⚠' : ''}</small></td>`;
      DIAS.forEach(d => {
        const a = aulas.find(x => x.Dia === d && x.Bloco === b);
        if (a) {
          const home = salaBase && a.Sala === salaBase && a.Tipo === 'Normal';
          rows += `<td${home ? ' class="cell-home"' : ''}>
            <strong style="font-size:11px;display:block;color:var(--c-text)">${a.Materia.replace(/ \(.*\)$/, '').substring(0, 28)}</strong>
            <span style="color:#b45309;font-size:10px">${a.Professor}</span><br>
            <span style="font-size:10px;color:var(--c-ok-text)">${home ? '🏠 ' : ''}${a.Sala}</span>
          </td>`;
        } else { rows += `<td class="vago">—</td>`; }
      });
      rows += '</tr>';
    });
    out += `<div class="rep-section" style="margin-bottom:20px">
      <h4 style="font-size:13px;font-weight:700;color:var(--c-text);margin:0 0 8px">${per} ${badgeSala}</h4>
      <div style="overflow-x:auto">
        <table class="grade-tbl">
          <thead><tr><th>Horário</th>${DIAS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  });
  return out;
}

// ── Relatório completo pós-solver ─────────────────────────────────────────────
function renderResultado(r, input) {
  ultimoResultado = r; ultimoInput = input;
  const wrap = $('resultado-wrap');
  const div  = $('resultado');
  wrap.style.display = 'block';

  if (r.status !== 'OPTIMAL' && r.status !== 'FEASIBLE') {
    // INFEASIBLE é prova de que não existe grade possível; os demais status
    // (UNKNOWN) apenas indicam que o tempo acabou antes de o solver concluir.
    div.innerHTML = r.status === 'INFEASIBLE'
      ? `<p style="color:var(--c-danger);font-size:14px;padding:8px 0">
          ⛔ <strong>Sem solução viável.</strong> Não existe grade que atenda a todas as restrições deste cenário.
          Tente aumentar o número de salas, reduzir a carga horária ou liberar indisponibilidades.
        </p>`
      : `<p style="color:var(--c-warn-text);font-size:14px;padding:8px 0">
          ⏱ <strong>Tempo esgotado (${r.status}).</strong> O solver não encontrou solução dentro do limite de
          ${S.config.tempoSolver || 120}s. <strong>Isso não significa que o cenário seja inviável</strong> —
          aumente o limite de tempo na aba Config e tente novamente.
        </p>`;
    return;
  }

  const alocacoes  = r.alocacoes   || [];
  const salasTurma = r.salas_turma || {};
  const periodos   = [...new Set(alocacoes.map(a => a.Periodo))].sort();
  const nomeExp = $('nome-exp')?.value || 'Experimento';

  // 1. Resumo
  const todosB  = (r.relatorio_professores || []).flatMap(p => (p.sessoes_alocadas || []).filter(s => s.status !== 'bonus'));
  const nAtend  = todosB.filter(s => s.status === 'atendido').length;
  const nNeutro = todosB.filter(s => s.status === 'neutro').length;
  const nCrit   = todosB.filter(s => s.status === 'critico').length;
  const pctAt   = todosB.length ? Math.round(nAtend / todosB.length * 100) : 0;
  const clsSt   = r.status === 'OPTIMAL' ? 'bdg-ok' : 'bdg-warn';
  const salasUsadas = new Set(alocacoes.map(a => a.Sala)).size;
  const totalSalas  = (input?.salas || []).length;
  const totalProfs  = (input?.professores || []).length;

  const secResumo = `<div class="rep-section">
    <h3 class="rep-h3" style="font-size:15px;margin-bottom:12px">${nomeExp}</h3>
    <div class="bdg-row">
      <span class="bdg ${clsSt}">${r.status}</span>
      <span class="bdg bdg-neu">⏱ ${(r.tempo_execucao || 0).toFixed(2)}s</span>
      <span class="bdg bdg-ok">🎯 ${r.pontuacao_objetivo || 0} pts</span>
      <span class="bdg bdg-ok">📋 ${alocacoes.length} alocações</span>
    </div>
    <div class="bdg-row" style="margin-top:6px">
      <span class="bdg bdg-ok">✅ Atendidos: ${nAtend}/${todosB.length} (${pctAt}%)</span>
      <span class="bdg bdg-warn">➖ Neutros: ${nNeutro}</span>
      <span class="bdg bdg-err">⚠ Críticos: ${nCrit}</span>
    </div>
    <div class="bdg-row" style="margin-top:6px">
      <span class="bdg bdg-neu" title="O solver usa o mínimo de salas necessário">🏛 Salas usadas: ${salasUsadas}${totalSalas ? ` de ${totalSalas} disponíveis` : ''}</span>
      <span class="bdg bdg-neu" title="Apenas professores com disciplinas atribuídas aparecem">👤 Professores na grade: ${(r.relatorio_professores || []).filter(p => p.blocos_total > 0).length}${totalProfs ? ` de ${totalProfs} cadastrados` : ''}</span>
    </div>
  </div>`;

  // 2. T/P
  const secTP = input ? relatarCargasHTML(input) : '';

  // 3. Salas base
  let linhasSala = '';
  periodos.forEach(per => {
    const numP     = per.replace('º Período', '').trim();
    const salaBase = salasTurma[numP] || null;
    const teo      = alocacoes.filter(a => a.Periodo === per && a.Tipo === 'Normal');
    const naBase   = salaBase ? teo.filter(a => a.Sala === salaBase).length : 0;
    const pct      = teo.length ? Math.round(naBase / teo.length * 100) : 0;
    const cls      = pct >= 80 ? 'bdg-ok' : pct >= 50 ? 'bdg-warn' : 'bdg-err';
    linhasSala += `<tr>
      <td>${per}</td>
      <td>${salaBase ? `🏠 <strong>${salaBase}</strong>` : '<em style="color:var(--c-faint)">nenhuma</em>'}</td>
      <td><span class="bdg ${cls}" style="font-size:11px">${naBase}/${teo.length} (${pct}%)</span></td>
    </tr>`;
  });
  const secSalas = `<div class="rep-section">
    <h3 class="rep-h3">Salas Base por Período</h3>
    <p style="font-size:12px;color:var(--c-muted);margin:0 0 10px">Concentração das aulas teóricas em sala fixa por turma. 🏠 = sala mais frequente do período.</p>
    <div style="overflow-x:auto">
      <table class="rep-tbl" style="max-width:460px">
        <thead><tr><th>Período</th><th>Sala Base</th><th>Concentração (aulas teóricas)</th></tr></thead>
        <tbody>${linhasSala}</tbody>
      </table>
    </div>
  </div>`;

  // 4. Grade por período
  const secGrade = `<div class="rep-section">
    <h3 class="rep-h3">Grade Horária por Período</h3>
    ${gradesPorPeriodo(alocacoes, salasTurma)}
  </div>`;

  // ── 5. Auditoria docente ───────────────────────────────────────────────────
  const icone = { atendido: '✅', neutro: '➖', critico: '⚠️', bonus: '⭐' };
  const bgSt  = { atendido: 'var(--c-ok-bg)', neutro: 'var(--c-warn-bg)', critico: 'var(--c-danger-bg)', bonus: 'oklch(95% 0.02 200)' };
  const corSt = { atendido: 'var(--c-ok-text)', neutro: 'var(--c-warn-text)', critico: 'var(--c-danger-text)', bonus: 'oklch(35% 0.1 200)' };

  let rowsAudit = '';
  (r.relatorio_professores || [])
    .filter(p => p.blocos_total > 0)
    .sort((a, b) => a.satisfacao_pct - b.satisfacao_pct)
    .forEach(p => {
      const dobras  = (r.carga_horaria || {})[p.nome]?.dobras ?? 0;
      const cls     = p.satisfacao_pct >= 80 ? 'bdg-ok' : p.satisfacao_pct >= 50 ? 'bdg-warn' : 'bdg-err';
      const sessoes = p.sessoes_alocadas || [];
      const nA = sessoes.filter(s => s.status === 'atendido').length;
      const nN = sessoes.filter(s => s.status === 'neutro').length;
      const nC = sessoes.filter(s => s.status === 'critico').length;
      const nB = sessoes.filter(s => s.status === 'bonus').length;

      const indispBadges = (p.indisponibilidades || [])
        .map(sl => `<span class="bdg" style="background:var(--c-warn-bg);color:var(--c-warn-text);font-size:11px;padding:2px 6px;margin:1px">${sl.dia}&nbsp;${sl.bloco}</span>`)
        .join('') || '<span style="color:var(--c-faint);font-size:12px">—</span>';

      const detalhes = sessoes.map(s => `
        <tr style="background:${bgSt[s.status] || 'transparent'}">
          <td style="text-align:left">${icone[s.status] || ''} ${s.materia}</td>
          <td style="text-align:center">${s.dia}</td>
          <td style="text-align:center">${s.bloco}</td>
          <td style="text-align:center;color:${corSt[s.status] || 'inherit'}">${s.peso} pts</td>
          <td style="text-align:center">${s.status === 'bonus' ? '—' : `máx ${s.max_bloco} pts`}</td>
        </tr>`).join('');

      rowsAudit += `<tr>
        <td>
          <strong style="font-size:14px">${p.nome}</strong><br>
          <small style="color:var(--c-muted);font-size:12px">✅${nA} ➖${nN} ⚠️${nC} ⭐${nB}</small>
        </td>
        <td style="text-align:center">${p.blocos_total}</td>
        <td style="text-align:center;color:${dobras > 0 ? 'var(--c-warn-text)' : 'var(--c-ok-text)'}">${dobras}</td>
        <td style="text-align:center;color:${p.criticos > 0 ? 'var(--c-danger-text)' : 'var(--c-ok-text)'};font-weight:700">${p.criticos}</td>
        <td style="font-size:12px">${indispBadges}</td>
        <td style="text-align:center">${p.pontuacao_prefs}</td>
        <td style="text-align:center">${p.max_possivel}</td>
        <td style="text-align:center"><span class="bdg ${cls}">${p.satisfacao_pct}%</span></td>
        <td style="text-align:center;color:oklch(35% 0.1 200)">+${p.pontuacao_bonus}</td>
        <td style="text-align:center;font-weight:700">${p.pontuacao_total}</td>
        <td>
          <details>
            <summary style="cursor:pointer;font-size:12px;color:var(--c-accent)">Ver ${sessoes.length} alocações</summary>
            <div style="overflow-x:auto;margin-top:6px">
              <table class="rep-tbl" style="font-size:12px;min-width:360px">
                <thead><tr><th>Disciplina</th><th>Dia</th><th>Bloco</th><th>Pontos</th><th>Limite</th></tr></thead>
                <tbody>${detalhes}</tbody>
              </table>
            </div>
          </details>
        </td>
      </tr>`;
    });

  const secAudit = `<div class="rep-section">
    <h3 class="rep-h3">Auditoria de Satisfação Docente
      <small style="color:var(--c-muted);font-weight:400;margin-left:6px">ordenado do menor para o maior % de satisfação</small>
    </h3>
    <p style="font-size:13px;color:var(--c-muted);margin:0 0 12px">
      <strong>Pref. Obtida</strong> = soma dos pesos dos blocos alocados &nbsp;|&nbsp;
      <strong>Pref. Máxima</strong> = pontuação se todos os blocos fossem no melhor horário possível &nbsp;|&nbsp;
      <strong>Bônus</strong> = aulas geminadas (+50 pts cada)
    </p>
    <div style="overflow-x:auto">
      <table class="rep-tbl audit-tbl">
        <thead><tr>
          <th>Professor</th><th>Bl/<br>sem</th><th>Dobras<br>Lab</th><th>Slots<br>Críticos</th>
          <th>Indispon.</th><th>Pref.<br>Obtida</th><th>Pref.<br>Máxima</th>
          <th>Satisfação</th><th>Bônus</th><th>Total</th><th>Sessões alocadas</th>
        </tr></thead>
        <tbody>${rowsAudit}</tbody>
      </table>
    </div>
  </div>`;

  // ── 6. Carga horária (horas semestrais) ────────────────────────────────────
  const limiteCarga = S.config.cargaMaxProfessor || 0;
  const cargaMap = cargaHorariaHoras(input);
  const cargaArr = Object.values(cargaMap).sort((a, b) => (b.base + b.extra) - (a.base + a.extra));
  let totBase = 0, totExtra = 0, nAcima = 0;
  let rowsCarga = '';
  cargaArr.forEach(c => {
    const total = c.base + c.extra;
    totBase += c.base; totExtra += c.extra;
    const over = limiteCarga > 0 && total > limiteCarga;
    if (over) nAcima++;
    const bg = over ? 'var(--c-danger-bg)' : (c.extra > 0 ? 'var(--c-warn-bg)' : '');
    const situacao = over
      ? `<span style="color:var(--c-danger-text);font-weight:700">⛔ ${total}h &gt; ${limiteCarga}h</span>`
      : c.dobras > 0 ? `<span style="color:var(--c-warn-text)">⚠ ${c.dobras} dobra(s)</span>`
      : '<span style="color:var(--c-ok-text)">✅ ok</span>';
    rowsCarga += `<tr${bg ? ` style="background:${bg}"` : ''}>
      <td>${c.nome}</td>
      <td style="text-align:center">${c.base} h</td>
      <td style="text-align:center;color:${c.extra > 0 ? 'var(--c-warn-text)' : 'var(--c-faint)'};font-weight:${c.extra > 0 ? '700' : '400'}">${c.extra > 0 ? `+${c.extra} h` : '—'}</td>
      <td style="text-align:center;font-weight:700;color:${over ? 'var(--c-danger-text)' : 'var(--c-accent-text)'}">${total} h</td>
      <td style="text-align:center;color:${c.dobras > 0 ? 'var(--c-warn-text)' : 'var(--c-ok-text)'}">${c.dobras || '—'}</td>
      <td style="font-size:12px">${situacao}</td>
    </tr>`;
  });
  const totGeral = totBase + totExtra;
  const secCarga = `<div class="rep-section">
    <h3 class="rep-h3">Carga Horária por Professor
      <small style="color:var(--c-muted);font-weight:400;margin-left:6px">em horas semestrais</small>
    </h3>
    <p style="font-size:12px;color:var(--c-muted);margin:0 0 10px">
      <strong>Base</strong> = carga prevista da disciplina (T + P, prática contada uma vez) &nbsp;|&nbsp;
      <strong>Extra (dobras)</strong> = horas de prática adicionais quando a turma é dividida em A+B no laboratório
      (acima de ${S.config.capacidadeLabPadrao} alunos) &nbsp;|&nbsp;
      <strong>Total</strong> = base + extra.
    </p>
    <div class="bdg-row">
      <span class="bdg bdg-neu">Σ base: ${totBase} h</span>
      <span class="bdg bdg-warn">Σ extra (dobras): +${totExtra} h</span>
      <span class="bdg bdg-ok">Σ total: ${totGeral} h</span>
      ${limiteCarga > 0 ? `<span class="bdg ${nAcima > 0 ? 'bdg-err' : 'bdg-ok'}">Limite ${limiteCarga}h · ${nAcima > 0 ? `${nAcima} acima` : 'todos dentro'}</span>` : ''}
    </div>
    <div style="overflow-x:auto">
      <table class="rep-tbl" style="max-width:760px">
        <thead><tr>
          <th>Professor</th><th>Carga base</th><th>Extra (dobras)</th><th>Carga total</th><th>Dobras</th><th>Situação</th>
        </tr></thead>
        <tbody>${rowsCarga}</tbody>
      </table>
    </div>
  </div>`;

  div.innerHTML = secResumo + secTP + secSalas + secGrade + secAudit + secCarga;
}

// ── Import de cenário completo ────────────────────────────────────────────────
function onImportCenario(ev) {
  lerArquivoJSON(ev, data => {
    aplicarCenario(data);
    atuResumo();
    updateTabBadges();
    toast('Cenário importado com sucesso', 'ok');
    autoSave();
  });
}

// ── Markup + wiring ─────────────────────────────────────────────────────────
function markup() {
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:900px;margin:0 auto">

    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:var(--c-text);letter-spacing:-.01em">Resumo do Cenário</h3>
      <div style="font-size:13px;color:var(--c-body)">
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle)">
          <span>Disciplinas</span><strong id="r-disc">0</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle)">
          <span>Professores registrados</span><strong id="r-prof">0</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle);color:var(--c-muted)">
          <span style="padding-left:10px">↳ receberão sessões</span><strong id="r-prof-ativos" style="color:var(--c-body)">—</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle)">
          <span>Salas cadastradas</span><strong id="r-sala">0</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle);color:var(--c-muted)">
          <span style="padding-left:10px">↳ Normais / Labs</span><strong id="r-sala-det" style="color:var(--c-body)">—</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--c-border-subtle)">
          <span>Sessões ao solver</span><strong id="r-sess">—</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0">
          <span>Com split A+B</span><strong id="r-split">—</strong>
        </div>
        <div id="r-avisos" style="margin-top:10px"></div>
      </div>
      <div style="height:1px;background:var(--c-border-subtle);margin:14px 0"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" data-action="exportar-json">Exportar JSON</button>
        <button class="btn btn-secondary btn-sm" data-action="import-cenario">Importar cenário</button>
        <input type="file" id="file-import" accept=".json" style="display:none">
      </div>
    </div>

    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:var(--c-text);letter-spacing:-.01em">Executar Otimização</h3>
      <p style="font-size:13px;color:var(--c-muted);margin:0 0 14px;line-height:1.5">
        Envia o cenário ao solver CP-SAT e exibe a grade resultante.
      </p>
      <div class="fg">
        <label for="nome-exp">Nome do experimento</label>
        <input id="nome-exp" value="Cenário personalizado">
      </div>
      <button class="btn btn-ok" id="btn-otm" style="width:100%;padding:11px;justify-content:center" data-action="iniciar-otm">Iniciar Otimização</button>
      <div id="otm-status" style="margin-top:10px;display:none"></div>
    </div>

  </div>

  <div id="resultado-wrap" style="max-width:1240px;margin:16px auto 0;display:none">
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <span style="font-size:13px;font-weight:700;color:var(--c-text);letter-spacing:-.01em">Resultado da Otimização</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-action="exportar-tabela" title="Baixa a grade como tabela (CSV) no formato da Oferta de Disciplinas, abre no Excel">
            ⬇ Exportar tabela (Excel)
          </button>
          <button class="btn btn-secondary btn-sm" data-action="exportar-relatorio" title="Baixa o relatório completo como arquivo HTML">
            ⬇ Exportar relatório HTML
          </button>
        </div>
      </div>
      <div id="resultado"></div>
    </div>
  </div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'exportar-json':      exportarJSON(); break;
    case 'import-cenario':     $('file-import').click(); break;
    case 'iniciar-otm':        otimizar(); break;
    case 'exportar-relatorio': exportarRelatorio(); break;
    case 'exportar-tabela':    exportarTabela(); break;
  }
}

function onChange(e) {
  if (e.target.id === 'file-import') onImportCenario(e);
}

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  atuResumo();
}
