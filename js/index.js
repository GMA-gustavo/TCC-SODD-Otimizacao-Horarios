const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { gerarCenarioBaseline, gerarCenarioSemSalas, gerarCenarioExtremo, relatarCargas } = require('./scenarios');

const PYTHON_SCRIPT = path.join(__dirname, '..', 'otimizador', 'otimizador.py');
const MAP_HORARIOS = { M1: '07:10', M2: '08:50', M3: '10:40', T1: '13:10', T2: '14:50', T3: '16:50' };

// ── Relatório HTML (salvo em nomeArquivo dentro de js/) ───────────────────────
function gerarRelatorioHTML(resp, relatorioCargas, nomeExperimento, nomeArquivo) {
    const alocacoes  = resp.alocacoes || [];
    const salasTurma = resp.salas_turma || {};
    const periodos   = [...new Set(alocacoes.map(a => a.Periodo))].sort();

    // ── Seção de verificação de cargas T/P ────────────────────────────────────
    let linhasCargas  = '';
    let totaisCargas  = { disciplinas: 0, comPratica: 0, comSplit: 0, sessoes: 0 };
    if (relatorioCargas && relatorioCargas.porPeriodo) {
        totaisCargas = relatorioCargas.totais || totaisCargas;
        Object.keys(relatorioCargas.porPeriodo)
            .sort((a, b) => Number(a) - Number(b))
            .forEach(per => {
                relatorioCargas.porPeriodo[per].forEach(d => {
                    const splitStr   = d.pratica > 0 ? (d.split ? '✂ A+B' : '—') : '—';
                    const labStr     = d.tipo_lab && d.pratica > 0 ? d.tipo_lab : '—';
                    const numSessoes = (d.teoria  > 0 ? 1 : 0) +
                                       (d.pratica > 0 ? (d.split ? 2 : 1) : 0);
                    // "GBC014 - Programação Procedimental" → strip "GBC014 - " prefix
                    const nomeDisc   = d.nome.replace(/^[A-Z0-9]+ - /, '');
                    const bgRow      = d.split ? '#fffaed' : '#fff';
                    linhasCargas += `
                      <tr style="background:${bgRow}">
                        <td style="font-family:monospace;font-size:11px">${d.id}</td>
                        <td style="text-align:left">${nomeDisc}</td>
                        <td>${d.periodo}º</td>
                        <td style="color:${d.teoria  > 0 ? '#155724' : '#aaa'};font-weight:${d.teoria  > 0 ? '700' : '400'}">${d.teoria  || '—'}</td>
                        <td style="color:${d.pratica > 0 ? '#856404' : '#aaa'};font-weight:${d.pratica > 0 ? '700' : '400'}">${d.pratica || '—'}</td>
                        <td style="font-size:11px">${labStr}</td>
                        <td style="color:${d.split ? '#721c24' : '#aaa'};font-weight:${d.split ? '700' : '400'}">${splitStr}</td>
                        <td style="font-weight:700;color:#0056b3">${numSessoes}</td>
                      </tr>`;
                });
            });
    }
    const secaoCargas = `
    <div class="table-container">
    <h3>Verificação de Cargas T/P
        <small style="color:#888;font-weight:normal">— diagnóstico pré-otimização das componentes teórico-práticas</small>
    </h3>
    <p style="font-size:12px;color:#555">
        Cada disciplina gera entre <strong>1 e 3 sessões semanais</strong>:
        teoria (sala normal), prática (laboratório) ou prática dupla
        (<em>split A+B</em>, quando a turma ultrapassa a capacidade do laboratório).
        O solver recebe todas essas sessões e as distribui nos horários disponíveis.
    </p>
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge ok">📚 ${totaisCargas.disciplinas} disciplinas</span>
      <span class="badge warn">🔬 ${totaisCargas.comPratica} com prática</span>
      <span class="badge bad">✂ ${totaisCargas.comSplit} com split A+B</span>
      <span class="badge ok">📦 ${totaisCargas.sessoes} sessões entregues ao solver</span>
    </div>
    <details>
      <summary style="cursor:pointer;font-size:13px;color:#0056b3;padding:4px 0">▶ Ver tabela completa de cargas T/P (${totaisCargas.disciplinas} disciplinas)</summary>
      <table style="margin-top:10px;font-size:12px;min-width:700px">
        <tr>
          <th>ID</th><th>Disciplina</th><th>Per.</th>
          <th>Teoria<br>(bl/sem)</th><th>Prática<br>(bl/sem)</th>
          <th>Tipo Lab</th><th>Split?</th><th>Sessões<br>geradas</th>
        </tr>
        ${linhasCargas}
      </table>
    </details>
    </div>`;
    const dias       = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const blocos     = ['M1', 'M2', 'M3', 'T1', 'T2', 'T3'];
    const setCriticos = new Set(['M1', 'T3']);

    // ── Tabela resumo de salas base ───────────────────────────────────────────
    let linhasSalasTurma = '';
    periodos.forEach(periodo => {
        const numPeriodo    = periodo.replace('º Período', '').trim();
        const salaBase      = salasTurma[numPeriodo] || null;
        const aulasTeo      = alocacoes.filter(a => a.Periodo === periodo && a.Tipo === 'Normal');
        const aulasNaSala   = salaBase ? aulasTeo.filter(a => a.Sala === salaBase).length : 0;
        const pct           = aulasTeo.length ? Math.round(aulasNaSala / aulasTeo.length * 100) : 0;
        const bgPct  = pct >= 80 ? '#d4edda' : pct >= 50 ? '#fff3cd' : '#f8d7da';
        const corPct = pct >= 80 ? '#155724' : pct >= 50 ? '#856404' : '#721c24';
        linhasSalasTurma += `
          <tr>
            <td>${periodo}</td>
            <td>${salaBase ? `🏠 <strong>${salaBase}</strong>` : '<em style="color:#aaa">nenhuma</em>'}</td>
            <td style="background:${bgPct};color:${corPct};font-weight:700">${aulasNaSala}/${aulasTeo.length} (${pct}%)</td>
          </tr>`;
    });

    // ── Grade por período ──────────────────────────────────────────────────────
    let tabelaGrade = '';
    periodos.forEach(periodo => {
        const numPeriodo    = periodo.replace('º Período', '').trim();
        const salaBase      = salasTurma[numPeriodo] || null;
        const aulasPeriodo  = alocacoes.filter(a => a.Periodo === periodo);
        const aulasTeo      = aulasPeriodo.filter(a => a.Tipo === 'Normal');
        const aulasNaSala   = salaBase ? aulasTeo.filter(a => a.Sala === salaBase).length : 0;
        const pctSala       = aulasTeo.length ? Math.round(aulasNaSala / aulasTeo.length * 100) : 0;
        const blocosUsados  = blocos.filter(b => aulasPeriodo.some(a => a.Bloco === b));
        if (!blocosUsados.length) return;

        const badgeSalaBase = salaBase
            ? `<span style="background:#d4edda;color:#155724;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700;margin-left:10px">🏠 Sala Base: ${salaBase} (${pctSala}%)</span>`
            : `<span style="background:#f8f8f8;color:#999;padding:2px 9px;border-radius:10px;font-size:12px;margin-left:10px">sem sala base</span>`;

        tabelaGrade += `<div class="table-container"><h2>${periodo} ${badgeSalaBase}</h2><table><tr><th>Horário</th>`;
        dias.forEach(d => { tabelaGrade += `<th>${d}</th>`; });
        tabelaGrade += '</tr>';

        blocosUsados.forEach(bloco => {
            const cls = setCriticos.has(bloco) ? 'critico' : '';
            tabelaGrade += `<tr><td class="hora ${cls}"><strong>${MAP_HORARIOS[bloco]}</strong><br><small>${bloco}${setCriticos.has(bloco) ? ' ⚠' : ''}</small></td>`;
            dias.forEach(dia => {
                const aula = aulasPeriodo.find(a => a.Dia === dia && a.Bloco === bloco);
                if (aula) {
                    const ehBase   = salaBase && aula.Sala === salaBase && aula.Tipo === 'Normal';
                    const salaLabel = ehBase ? `🏠 [${aula.Sala}]` : `[${aula.Sala}]`;
                    tabelaGrade += `<td${ehBase ? ' class="home-cell"' : ''}>` +
                        `<span class="materia">${aula.Materia}</span>` +
                        `<span class="prof">${aula.Professor}</span>` +
                        `<span class="sala${ehBase ? ' sala-base' : ''}">${salaLabel}</span></td>`;
                } else {
                    tabelaGrade += '<td class="vago">—</td>';
                }
            });
            tabelaGrade += '</tr>';
        });
        tabelaGrade += '</table></div>';
    });

    // ── Totalizador geral de satisfação ───────────────────────────────────────
    const todosBlocos   = (resp.relatorio_professores || []).flatMap(p => (p.sessoes_alocadas || []).filter(s => s.status !== 'bonus'));
    const totalBlocos   = todosBlocos.length;
    const totalAtendido = todosBlocos.filter(s => s.status === 'atendido').length;
    const totalNeutro   = todosBlocos.filter(s => s.status === 'neutro').length;
    const totalCritico  = todosBlocos.filter(s => s.status === 'critico').length;
    const pctAtend      = totalBlocos ? Math.round(totalAtendido / totalBlocos * 100) : 0;

    const resumoSatisfacao = `
      <span class="badge ok">✅ Atendidos: ${totalAtendido}/${totalBlocos} (${pctAtend}%)</span>
      <span class="badge warn">➖ Neutros: ${totalNeutro}</span>
      <span class="badge bad">⚠ Críticos: ${totalCritico}</span>`;

    // ── Auditoria docente ──────────────────────────────────────────────────────
    const icone = { atendido: '✅', neutro: '➖', critico: '⚠️', bonus: '⭐' };
    const corSt = { atendido: '#155724', neutro: '#856404', critico: '#721c24', bonus: '#0c5460' };
    const bgSt  = { atendido: '#d4edda', neutro: '#fff3cd', critico: '#f8d7da', bonus: '#d1ecf1' };

    let tabelaAuditoria = `
      <table class="auditoria">
        <tr>
          <th>Professor</th>
          <th>Blocos/<br>Semana</th>
          <th>Dobras<br>de Lab</th>
          <th>Slots<br>Críticos</th>
          <th>Indispon.</th>
          <th>Pref.<br>Obtida</th>
          <th>Pref.<br>Máxima</th>
          <th>Satisfação<br>de Preferência</th>
          <th>Bônus<br>Extras</th>
          <th>Pontuação<br>Total</th>
          <th>Sessões Alocadas</th>
        </tr>`;

    (resp.relatorio_professores || [])
        .filter(p => p.blocos_total > 0)
        .sort((a, b) => a.satisfacao_pct - b.satisfacao_pct)
        .forEach(p => {
            const dobras  = (resp.carga_horaria || {})[p.nome]?.dobras ?? 0;
            const bgSat   = p.satisfacao_pct >= 80 ? '#d4edda' : p.satisfacao_pct >= 50 ? '#fff3cd' : '#f8d7da';
            const corSat  = p.satisfacao_pct >= 80 ? '#155724' : p.satisfacao_pct >= 50 ? '#856404' : '#721c24';
            const sessoes = p.sessoes_alocadas || [];
            const nAtend  = sessoes.filter(s => s.status === 'atendido').length;
            const nNeutro = sessoes.filter(s => s.status === 'neutro').length;
            const nCrit   = sessoes.filter(s => s.status === 'critico').length;
            const nBonus  = sessoes.filter(s => s.status === 'bonus').length;

            const indispBadges = (p.indisponibilidades || [])
                .map(sl => `<span style="background:#ffeaa7;color:#6d4c00;padding:1px 5px;border-radius:4px;font-size:10px;white-space:nowrap;display:inline-block;margin:1px">${sl.dia}&nbsp;${sl.bloco}</span>`)
                .join('') || '<span style="color:#bbb;font-size:11px">—</span>';

            const linhasDetalhe = sessoes.map(s =>
                `<tr style="background:${bgSt[s.status] || '#fff'}">
                   <td style="text-align:left">${icone[s.status] || ''} ${s.materia}</td>
                   <td>${s.dia}</td>
                   <td>${s.bloco}</td>
                   <td style="color:${corSt[s.status] || '#000'}">${s.peso} pts</td>
                   <td>${s.status === 'bonus' ? '—' : `máx ${s.max_bloco} pts`}</td>
                 </tr>`
            ).join('');

            tabelaAuditoria += `
              <tr>
                <td><strong>${p.nome}</strong><br>
                  <small style="color:#555">✅${nAtend} ➖${nNeutro} ⚠️${nCrit} ⭐${nBonus}</small>
                </td>
                <td>${p.blocos_total}</td>
                <td style="color:${dobras > 0 ? '#856404' : '#155724'}">${dobras}</td>
                <td style="color:${p.criticos > 0 ? '#721c24' : '#155724'};font-weight:700">${p.criticos}</td>
                <td style="font-size:11px;text-align:left">${indispBadges}</td>
                <td>${p.pontuacao_prefs}</td>
                <td>${p.max_possivel}</td>
                <td style="background:${bgSat};color:${corSat};font-weight:700">${p.satisfacao_pct}%</td>
                <td style="color:#0c5460">+${p.pontuacao_bonus}</td>
                <td style="font-weight:700">${p.pontuacao_total}</td>
                <td>
                  <details>
                    <summary style="cursor:pointer;font-size:12px;color:#0056b3">Ver ${sessoes.length} alocações</summary>
                    <table style="margin-top:6px;font-size:11px;min-width:400px">
                      <tr><th>Disciplina</th><th>Dia</th><th>Bloco</th><th>Pontos</th><th>Limite</th></tr>
                      ${linhasDetalhe}
                    </table>
                  </details>
                </td>
              </tr>`;
        });
    tabelaAuditoria += '</table>';

    // ── Carga horária ──────────────────────────────────────────────────────────
    let tabelaCarga = `
      <table class="auditoria">
        <tr><th>Professor</th><th>Blocos/Semana</th><th>Dobras de Lab</th><th>Observação</th></tr>`;
    Object.entries(resp.carga_horaria || {}).sort((a, b) => b[1].blocos - a[1].blocos).forEach(([nome, d]) => {
        const obs = d.dobras > 0
            ? `⚠️ ${d.dobras} disciplina(s) com turma A+B no laboratório`
            : '✅ Sem dobras';
        tabelaCarga += `<tr><td>${nome}</td><td>${d.blocos}</td><td style="color:${d.dobras > 0 ? '#856404' : '#155724'}">${d.dobras}</td><td>${obs}</td></tr>`;
    });
    tabelaCarga += '</table>';

    // ── Montagem do HTML final ─────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
    <meta charset="utf-8">
    <title>${nomeExperimento}</title>
    <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f9; }
    h1 { color: #0056b3; }
    h2 { color: #333; border-bottom: 2px solid #ccc; padding-bottom: 4px; }
    h3 { color: #444; margin-top: 30px; margin-bottom: 8px; }
    .table-container { overflow-x: auto; margin-bottom: 30px; background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
    table { border-collapse: collapse; width: 100%; min-width: 600px; }
    th, td { border: 1px solid #ddd; padding: 9px 10px; text-align: center; font-size: 13px; }
    th { background: #0056b3; color: #fff; }
    .materia { font-weight: 700; color: #222; display: block; }
    .prof { color: #d35400; font-size: 11px; display: block; }
    .sala { color: #27ae60; font-size: 11px; display: block; }
    .sala-base { color: #155724 !important; font-weight: 700; }
    .home-cell { background: #f0fff4; }
    .vago { color: #bbb; font-style: italic; }
    .hora { background: #f0f4ff; }
    .hora.critico { background: #fff0f0; }
    .auditoria th { background: #34495e; }
    .resumo { background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 12px; margin: 3px; }
    .ok  { background: #d4edda; color: #155724; }
    .warn { background: #fff3cd; color: #856404; }
    .bad  { background: #f8d7da; color: #721c24; }
    details > table { width: auto; }
    summary { color: #0056b3; }
    </style>
    </head>
    <body>
    <h1>${nomeExperimento}</h1>
    <div class="resumo">
    <span class="badge ${resp.status === 'OPTIMAL' ? 'ok' : resp.status === 'FEASIBLE' ? 'warn' : 'bad'}">${resp.status}</span>
    <span class="badge ok">⏱ ${(resp.tempo_execucao || 0).toFixed(3)}s</span>
    <span class="badge ok">🎯 Objetivo: ${resp.pontuacao_objetivo} pts</span>
    <span class="badge ok">📋 ${(resp.alocacoes || []).length} alocações</span>
    <span class="badge ok">🤝 Coorte: ${resp.coorte_global} pts</span>
    ${resumoSatisfacao}
    </div>

    ${secaoCargas}

    <div class="table-container">
    <h3>Salas Base por Período
        <small style="color:#888;font-weight:normal">— concentração das aulas teóricas em uma sala fixa por turma</small>
    </h3>
    <p style="font-size:12px;color:#555">
        A <strong>sala base</strong> é a sala onde o solver concentrou as aulas teóricas do período.
        Nas grades abaixo, células 🏠 em verde pertencem à sala base — fundo verde indica a sala mais consistente para os alunos daquele período.
    </p>
    <table style="max-width:520px;min-width:0">
      <tr><th>Período</th><th>Sala Base</th><th>Concentração (aulas teóricas)</th></tr>
      ${linhasSalasTurma}
    </table>
    </div>

    <h3>Grade Horária por Período
        <small style="color:#888;font-weight:normal">(vermelho = horário crítico ⚠ | verde 🏠 = sala base do período)</small>
    </h3>
    ${tabelaGrade || '<p>Nenhuma alocação gerada.</p>'}

    <div class="table-container">
    <h3>Auditoria de Satisfação Docente
        <small style="color:#888;font-weight:normal">— ordenado do menor para o maior % de satisfação</small>
    </h3>
    <p style="font-size:12px;color:#555">
        <strong>Pref. Obtida</strong> = soma dos pesos dos blocos onde o professor foi alocado &nbsp;|&nbsp;
        <strong>Pref. Máxima</strong> = pontuação se todos os blocos fossem no melhor horário possível &nbsp;|&nbsp;
        <strong>Satisfação</strong> = Obtida ÷ Máxima × 100 (máximo 100%) &nbsp;|&nbsp;
        <strong>Bônus Extras</strong> = aulas geminadas (+50 pts cada)
    </p>
    ${tabelaAuditoria}
    </div>

    <div class="table-container">
    <h3>Carga Horária Semanal e Dobras de Laboratório</h3>
    <p style="font-size:12px;color:#555">Dobra = disciplina com mais de 40 alunos, dividida em turma A e B no laboratório.</p>
    ${tabelaCarga}
    </div>

    </body>
    </html>`;

    const htmlPath = path.join(__dirname, nomeArquivo);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`  📄 HTML salvo: ${htmlPath}`);
    return htmlPath;
}

// ── Runner de experimento ─────────────────────────────────────────────────────
function rodarExperimento(nomeExp, dadosInput, nomeArquivo) {
    return new Promise(resolve => {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🚀 EXPERIMENTO: ${nomeExp}`);
        const unicos = new Set(dadosInput.demandas.map(s => s.id.split('_')[0])).size;
        console.log(`   Disciplinas únicas : ${unicos}`);
        console.log(`   Sessões totais     : ${dadosInput.demandas.length}`);
        console.log(`   Professores        : ${dadosInput.professores.length}`);
        console.log(`   Salas normais      : ${dadosInput.salas.filter(s => s.tipo === 'Normal').length}`);
        console.log('-'.repeat(70));

        // ── Diagnóstico T/P antes de chamar o solver ─────────────────────────
        const relatorioCargas = relatarCargas(dadosInput);
        console.log('-'.repeat(70));

        const proc = spawn('python', [PYTHON_SCRIPT, JSON.stringify(dadosInput)]);
        let buf = '';
        proc.stdout.on('data', d => { buf += d.toString(); });
        proc.stderr.on('data', d => process.stderr.write(`[Python]: ${d}`));

        proc.on('close', () => {
            try {
                const resp = JSON.parse(buf);
                console.log(`  STATUS     : ${resp.status}`);
                console.log(`  Wall Time  : ${(resp.tempo_execucao || 0).toFixed(4)}s`);
                console.log(`  Objetivo   : ${resp.pontuacao_objetivo} pts`);
                console.log(`  Alocações  : ${(resp.alocacoes || []).length}`);

                if (resp.status === 'OPTIMAL' || resp.status === 'FEASIBLE') {
                    gerarRelatorioHTML(resp, relatorioCargas, nomeExp, nomeArquivo);

                    // Salas base detectadas
                    const salasTurma = resp.salas_turma || {};
                    const periodos = [...new Set((resp.alocacoes || []).map(a => a.Periodo))].sort();
                    console.log('\n  ── Salas Base por Período ─────────────────────────────');
                    periodos.forEach(p => {
                        const num = p.replace('º Período', '').trim();
                        const sala = salasTurma[num];
                        const aulasTeo = (resp.alocacoes || []).filter(a => a.Periodo === p && a.Tipo === 'Normal');
                        const aulasBase = sala ? aulasTeo.filter(a => a.Sala === sala).length : 0;
                        const pct = aulasTeo.length ? Math.round(aulasBase / aulasTeo.length * 100) : 0;
                        const icone = pct >= 80 ? '🏠' : pct >= 50 ? '🟡' : '⚠';
                        console.log(`  ${icone} ${p.padEnd(14)} → ${sala ? `${sala} (${pct}%)` : 'sem sala base'}`);
                    });

                    console.log('\n  ── Carga Horária e Dobras ─────────────────────────────');
                    Object.entries(resp.carga_horaria || {})
                        .sort((a, b) => b[1].blocos - a[1].blocos)
                        .forEach(([nome, d]) => {
                            const dobra = d.dobras > 0 ? ` ⚠ ${d.dobras} dobra(s)` : '';
                            console.log(`  ${nome.padEnd(22)} ${d.blocos} blocos/sem${dobra}`);
                        });

                    console.log('\n  ── Professores com Slot Crítico ───────────────────────');
                    (resp.relatorio_professores || [])
                        .filter(p => p.criticos > 0)
                        .forEach(p => console.log(`  ⚠ ${p.nome}: ${p.criticos} crítico(s) | satisfação ${p.satisfacao_pct}% | total ${p.pontuacao_total} pts`));
                } else if (resp.status === 'INFEASIBLE') {
                    console.log('  ⛔ Inviabilidade provada — não existe grade que atenda a todas as restrições.');
                } else {
                    console.log(`  ⏱ Sem solução dentro do limite de tempo (status ${resp.status}).`);
                    console.log('     Isto NÃO é prova de inviabilidade — aumente config.tempo_solver.');
                }
                resolve(resp);
            } catch (e) {
                console.error('Falha ao decodificar resposta:', e.message);
                resolve(null);
            }
        });
    });
}

// ── Bateria de experimentos ───────────────────────────────────────────────────
async function executarBateria() {
    console.log('\n' + '='.repeat(70));
    console.log('   SODD — BATERIA DE EXPERIMENTOS | CURRÍCULO REAL UFU 2025');
    console.log('='.repeat(70));

    const r1 = await rodarExperimento(
        'EXP-1: Baseline (10 salas normais — infraestrutura real)',
        gerarCenarioBaseline(),
        'grade_exp1_baseline.html'
    );

    const r2 = await rodarExperimento(
        'EXP-2: Escassez de Salas (6 salas normais — parâmetro variado)',
        gerarCenarioSemSalas(),
        'grade_exp2_escassez.html'
    );

    const r3 = await rodarExperimento(
        'EXP-3: Cenário Extremo (3 salas normais — degradação esperada)',
        gerarCenarioExtremo(),
        'grade_exp3_extremo.html'
    );

    // ── Tabela comparativa ────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(70));
    console.log('   COMPARATIVO DOS EXPERIMENTOS');
    console.log('='.repeat(70));
    console.log('Experimento'.padEnd(42) + 'Status'.padEnd(12) + 'Pts'.padEnd(10) + 'Tempo(s)');
    console.log('-'.repeat(70));
    [[r1, 'EXP-1 Baseline (10 salas)'],
     [r2, 'EXP-2 Escassez (6 salas)'],
     [r3, 'EXP-3 Extremo  (3 salas)']].forEach(([r, n]) => {
        if (r) console.log(n.padEnd(42) + (r.status || '?').padEnd(12) + String(r.pontuacao_objetivo || 0).padEnd(10) + (r.tempo_execucao || 0).toFixed(3));
    });

    console.log('\n  ── Arquivos HTML gerados ──────────────────────────────────');
    console.log('  📄 js/grade_exp1_baseline.html');
    console.log('  📄 js/grade_exp2_escassez.html');
    console.log('  📄 js/grade_exp3_extremo.html');
    console.log('');
}

executarBateria();
