const fs = require('fs');
const path = require('path');
const { createSala, createProfessor, processarDisciplina } = require('./models');

// 30 horas/semestre ≈ 1 bloco/semana (2h/sem × 15 semanas)
function hToB(h) { return Math.max(0, Math.round(h / 30)); }

// Lê o quadro docente de um JSON e o separa em pools por unidade.
// Arquivo padrão: professores_exemplo.json (na raiz do projeto).
//
// Não há fallback: se o arquivo faltar ou vier malformado, a execução aborta com
// mensagem explícita. Um fallback silencioso produziria uma grade válida porém
// montada sobre um quadro docente diferente do relatado na monografia — ou seja,
// números que não reproduzem, sem nenhum sinal de que algo deu errado.
const ARQUIVO_PROFESSORES = path.join(__dirname, '..', 'professores_exemplo.json');

function lerProfessores(caminho = ARQUIVO_PROFESSORES) {
    let dados;
    try {
        dados = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
    } catch (e) {
        throw new Error(
            `Não foi possível ler o quadro docente em "${caminho}".\n` +
            `  Motivo: ${e.message}\n` +
            `  Os experimentos exigem esse arquivo. Veja o formato esperado no README ` +
            `(seção "Formato do arquivo de professores").`
        );
    }

    const lista = Array.isArray(dados) ? dados : (dados.professores || []);
    const poolFACOM = lista.filter(p => p.unidade === 'FACOM');
    const poolFAMAT = lista.filter(p => p.unidade === 'FAMAT');

    if (!poolFACOM.length || !poolFAMAT.length) {
        throw new Error(
            `Quadro docente inválido em "${caminho}": ` +
            `${poolFACOM.length} professor(es) da FACOM e ${poolFAMAT.length} da FAMAT. ` +
            `São necessários professores de ambas as unidades.`
        );
    }
    return { poolFACOM, poolFAMAT };
}

// Matriz curricular real da UFU — Disciplinas Obrigatórias
// t/p = blocos por semana (convertido de horas); lab = tipo de sala para prática
// grupo = área temática usada para agrupar disciplinas correlatas no mesmo professor
const MATRIZ_OBRIGATORIA = [
    // --- 1º Período (ímpar → manhã) ---
    { id: 'GBC011', nome: 'Empreendedorismo em Informática',             unidade: 'FACOM', grupo: 'fundamentos',  periodo: 1, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC012', nome: 'Cálculo Diferencial e Integral 1',            unidade: 'FACOM', grupo: 'calculo',      periodo: 1, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC013', nome: 'Geometria Analítica e Álgebra Linear',        unidade: 'FACOM', grupo: 'matematica',   periodo: 1, t: hToB(90), p: 0,        lab: 'Lab' },
    { id: 'GBC014', nome: 'Programação Procedimental',                   unidade: 'FACOM', grupo: 'programacao',  periodo: 1, t: hToB(60), p: hToB(30), lab: 'Lab' },
    { id: 'GBC015', nome: 'Introdução à Ciência da Computação',          unidade: 'FACOM', grupo: 'fundamentos',  periodo: 1, t: hToB(30), p: 0,        lab: 'Lab' },
    { id: 'GBC016', nome: 'Lógica para Computação',                      unidade: 'FACOM', grupo: 'matematica',   periodo: 1, t: hToB(60), p: 0,        lab: 'Lab' },

    // --- 2º Período (par → tarde) ---
    { id: 'GBC021', nome: 'Profissão em Computação e Informática',       unidade: 'FACOM', grupo: 'fundamentos',  periodo: 2, t: hToB(30), p: 0,        lab: 'Lab' },
    { id: 'GBC022', nome: 'Cálculo Diferencial e Integral 2',            unidade: 'FACOM', grupo: 'calculo',      periodo: 2, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC023', nome: 'Matemática para a Ciência da Computação',     unidade: 'FACOM', grupo: 'matematica',   periodo: 2, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC024', nome: 'Algoritmos e Estruturas de Dados 1',          unidade: 'FACOM', grupo: 'algoritmos',   periodo: 2, t: hToB(60), p: hToB(30), lab: 'Lab' },
    { id: 'GBC025', nome: 'Programação Lógica',                          unidade: 'FACOM', grupo: 'programacao',  periodo: 2, t: hToB(60), p: hToB(30), lab: 'Lab' },
    { id: 'GBC026', nome: 'Sistemas Digitais',                           unidade: 'FACOM', grupo: 'hardware',     periodo: 2, t: hToB(60), p: hToB(30), lab: 'Lab_Sistemas_Digitais' },

    // --- 3º Período (ímpar → manhã) ---
    { id: 'GBC032', nome: 'Cálculo Diferencial e Integral 3',            unidade: 'FACOM', grupo: 'calculo',      periodo: 3, t: hToB(90), p: 0,        lab: 'Lab' },
    { id: 'GBC033', nome: 'Programação Funcional',                       unidade: 'FACOM', grupo: 'programacao',  periodo: 3, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC034', nome: 'Algoritmos e Estruturas de Dados 2',          unidade: 'FACOM', grupo: 'algoritmos',   periodo: 3, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC035', nome: 'Programação Orientada a Objetos 1',           unidade: 'FACOM', grupo: 'programacao',  periodo: 3, t: hToB(30), p: hToB(30), lab: 'Lab' },
    { id: 'GBC036', nome: 'Arquitetura e Org. de Computadores 1',        unidade: 'FACOM', grupo: 'hardware',     periodo: 3, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC041', nome: 'Estatística',                                 unidade: 'FACOM', grupo: 'estatistica',  periodo: 3, t: hToB(60), p: 0,        lab: 'Lab' },

    // --- 4º Período (par → tarde) ---
    { id: 'GBC042', nome: 'Teoria dos Grafos',                           unidade: 'FACOM', grupo: 'matematica',   periodo: 4, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC043', nome: 'Sistemas de Banco de Dados',                  unidade: 'FACOM', grupo: 'bd',           periodo: 4, t: hToB(60), p: hToB(30), lab: 'Lab' },
    { id: 'GBC044', nome: 'Linguagens Formais e Autômatos',              unidade: 'FACOM', grupo: 'teoria',       periodo: 4, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC045', nome: 'Sistemas Operacionais',                       unidade: 'FACOM', grupo: 'sistemas',     periodo: 4, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC046', nome: 'Arquitetura e Org. de Computadores 2',        unidade: 'FACOM', grupo: 'hardware',     periodo: 4, t: hToB(30), p: hToB(30), lab: 'Lab_Sistemas_Digitais' },
    { id: 'FAMAT31041', nome: 'Estatística Computacional',               unidade: 'FAMAT', grupo: 'estatistica',  periodo: 4, t: hToB(60), p: 0,        lab: 'Lab' },

    // --- 5º Período (ímpar → manhã) ---
    { id: 'GBC051', nome: 'Computação Científica e Otimização',          unidade: 'FACOM', grupo: 'algoritmos',   periodo: 5, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC052', nome: 'Análise de Algoritmos',                       unidade: 'FACOM', grupo: 'algoritmos',   periodo: 5, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC053', nome: 'Gerenciamento de Bancos de Dados',            unidade: 'FACOM', grupo: 'bd',           periodo: 5, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC054', nome: 'Modelagem de Software',                       unidade: 'FACOM', grupo: 'engenharia',   periodo: 5, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC055', nome: 'Programação Orientada a Objetos 2',           unidade: 'FACOM', grupo: 'programacao',  periodo: 5, t: hToB(30), p: hToB(30), lab: 'Lab' },
    { id: 'GBC056', nome: 'Arquitetura de Redes de Computadores',        unidade: 'FACOM', grupo: 'redes',        periodo: 5, t: hToB(60), p: 0,        lab: 'Lab' },

    // --- 6º Período (par → tarde) ---
    { id: 'GBC061', nome: 'Gestão Empresarial',                          unidade: 'FACOM', grupo: 'fundamentos',  periodo: 6, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC062', nome: 'Teoria da Computação',                        unidade: 'FACOM', grupo: 'teoria',       periodo: 6, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC063', nome: 'Inteligência Artificial',                     unidade: 'FACOM', grupo: 'ia',           periodo: 6, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC064', nome: 'Engenharia de Software',                      unidade: 'FACOM', grupo: 'engenharia',   periodo: 6, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC065', nome: 'Modelagem e Simulação',                       unidade: 'FACOM', grupo: 'sistemas',     periodo: 6, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC066', nome: 'Arquitetura de Redes TCP/IP',                 unidade: 'FACOM', grupo: 'redes',        periodo: 6, t: hToB(30), p: 0,        lab: 'Lab' },

    // --- 7º Período (ímpar → manhã) ---
    { id: 'GBC071', nome: 'Construção de Compiladores',                  unidade: 'FACOM', grupo: 'teoria',       periodo: 7, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC072', nome: 'Projeto de Graduação 1',                      unidade: 'FACOM', grupo: 'tcc',          periodo: 7, t: hToB(30), p: hToB(45), lab: 'Lab' },
    { id: 'GBC073', nome: 'Inteligência Computacional',                  unidade: 'FACOM', grupo: 'ia',           periodo: 7, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC074', nome: 'Sistemas Distribuídos',                       unidade: 'FACOM', grupo: 'sistemas',     periodo: 7, t: hToB(60), p: 0,        lab: 'Lab' },

    // --- 8º Período (par → tarde) ---
    { id: 'GBC081', nome: 'Direito e Legislação',                        unidade: 'FACOM', grupo: 'fundamentos',  periodo: 8, t: hToB(45), p: 0,        lab: 'Lab' },
    { id: 'GBC082', nome: 'Projeto de Graduação 2',                      unidade: 'FACOM', grupo: 'tcc',          periodo: 8, t: hToB(30), p: hToB(60), lab: 'Lab' },
    { id: 'GBC083', nome: 'Segurança da Informação',                     unidade: 'FACOM', grupo: 'sistemas',     periodo: 8, t: hToB(60), p: 0,        lab: 'Lab' },
    { id: 'GBC084', nome: 'Programação para Internet',                   unidade: 'FACOM', grupo: 'programacao',  periodo: 8, t: hToB(30), p: hToB(30), lab: 'Lab' },
    // GBC095 Estágio Supervisionado (T:0 P:210) omitido — agendamento especial
];

function montarCenario(matriz, profsFACOM, profsFAMAT, numSalasNormais = 10, alunosPorTurma = 45) {
    const salas = [];
    for (let i = 1; i <= numSalasNormais; i++)
        salas.push(createSala(`Sala_${String(i).padStart(2, '0')}`, 'Normal', 60));
    for (let i = 1; i <= 3; i++)
        salas.push(createSala(`Lab_Comp_${i}`, 'Lab', 40));
    salas.push(createSala('Lab_Sist_Digitais', 'Lab_Sistemas_Digitais', 40));

    // Preferências e indisponibilidades vêm do próprio arquivo de professores —
    // ele é a única fonte de verdade do quadro docente. Os valores de reserva
    // abaixo só se aplicam a entradas incompletas.
    //   Preferências: críticos (M1, T3) = 2 pts; pico = 10 pts; demais = 6 pts.
    //   Indisponibilidades: [{ dia: 'Seg'…'Sex', bloco: 'M1'…'T3' }] — o solver
    //   força a 0 as variáveis correspondentes (restrição rígida 3.4).
    const PREF_PADRAO_FACOM = { M1: 2, M2: 10, M3: 6, T1: 6,  T2: 10, T3: 2 };
    const PREF_PADRAO_FAMAT = { M1: 2, M2: 8,  M3: 6, T1: 10, T2: 8,  T3: 2 };

    const listaProfessores = [
        ...profsFACOM.map(p => createProfessor(
            p.id, p.nome,
            p.preferencias || PREF_PADRAO_FACOM,
            p.indisponibilidades || []
        )),
        ...profsFAMAT.map(p => createProfessor(
            p.id, p.nome,
            p.preferencias || PREF_PADRAO_FAMAT,
            p.indisponibilidades || []
        )),
    ];

    // ── Agrupamento temático: disciplinas correlatas → mesmo professor ───────
    // Ordena a matriz por grupo antes do round-robin. Com 14 professores FACOM
    // e ~43 disciplinas, o pool percorre blocos temáticos completos:
    //   profs 0-3 → algoritmos (4 disc.) + programacao (6 disc., overlap)
    //   profs 4-5 → bd (2 disc.)
    //   profs 6-8 → calculo (3 disc.)
    //   ...
    // Resultado: cada professor tende a ter 2-3 disciplinas da mesma área,
    // ao invés da mistura aleatória do round-robin por período.
    const ORDEM_GRUPOS = [
        'algoritmos', 'bd', 'calculo', 'engenharia', 'estatistica',
        'fundamentos', 'hardware', 'ia', 'matematica', 'programacao',
        'redes', 'sistemas', 'tcc', 'teoria'
    ];
    const matrizOrdenada = [...matriz].sort((a, b) => {
        const ga = ORDEM_GRUPOS.indexOf(a.grupo ?? 'zzz');
        const gb = ORDEM_GRUPOS.indexOf(b.grupo ?? 'zzz');
        return ga !== gb ? ga - gb : a.periodo - b.periodo;
    });

    let pFC = 0, pFM = 0;
    let sessoes = [];

    matrizOrdenada.forEach(mat => {
        if (mat.t === 0 && mat.p === 0) return;
        const pool = mat.unidade === 'FACOM' ? profsFACOM : profsFAMAT;
        const ptr  = mat.unidade === 'FACOM' ? pFC++ : pFM++;
        const prof = pool[ptr % pool.length];

        const disc = {
            id: mat.id, nome: mat.nome,
            professorId: prof.id,
            alunosMatriculados: alunosPorTurma,
            periodo: mat.periodo,
            componentes: []
        };
        // GBC072/GBC082 são TCC/Proj — turma pequena para não dobrar
        if (['GBC072', 'GBC082'].includes(mat.id)) disc.alunosMatriculados = 30;

        if (mat.t > 0) disc.componentes.push({ tipo: 'Teoria',  blocos: mat.t, tipo_sala: 'Normal' });
        if (mat.p > 0) disc.componentes.push({ tipo: 'Pratica', blocos: mat.p, tipo_sala: mat.lab });

        sessoes = sessoes.concat(processarDisciplina(disc));
    });

    return {
        salas,
        professores: listaProfessores,
        demandas: sessoes,
        // 300 s: acima dos ~163 s que o EXP-1 exige para provar otimalidade.
        // O padrão da interface é 120 s; a bateria usa folga para permitir o
        // status OPTIMAL nos cenários em que ele é alcançável.
        config: { horarios_criticos: ['M1', 'T3'], tempo_solver: 300 }
    };
}

// ── Cenário 1: Dados reais completos (baseline) ──────────────────────────────
function gerarCenarioBaseline() {
    const { poolFACOM, poolFAMAT } = lerProfessores();
    return montarCenario(
        MATRIZ_OBRIGATORIA,
        poolFACOM.slice(0, 14),
        poolFAMAT.slice(0, 5)
    );
}

// ── Cenário 2: Escassez de salas normais (stress de espaço) ──────────────────
function gerarCenarioSemSalas() {
    const { poolFACOM, poolFAMAT } = lerProfessores();
    return montarCenario(
        MATRIZ_OBRIGATORIA,
        poolFACOM.slice(0, 14),
        poolFAMAT.slice(0, 5),
        6 
    );
}

// ── Cenário 3: Extremo — pouquíssimas salas, inviabilidade esperada ───────────
function gerarCenarioExtremo() {
    const { poolFACOM, poolFAMAT } = lerProfessores();
    return montarCenario(
        MATRIZ_OBRIGATORIA,
        poolFACOM.slice(0, 14),
        poolFAMAT.slice(0, 5),
        3 
    );
}

// ── Verificação de cargas T/P — pré-otimização ───────────────────────────────
// Reconstrói o mapa de disciplinas a partir das sessões processadas e imprime
// um diagnóstico no terminal antes do solver ser invocado.
function relatarCargas(dadosInput) {
    const demandas = dadosInput.demandas || [];

    // Reconstruir mapa disc → {teoria, pratica, split, tipo_lab}
    const discMap = new Map();
    demandas.forEach(s => {
        const isTeoria  = s.id.endsWith('_TEORIA');
        const isSplitA  = /_PRATICA_A$/.test(s.id);
        const isSplitB  = /_PRATICA_B$/.test(s.id);
        // isPratica = prática sem divisão de turma
        const isPratica = !isTeoria && !isSplitA && !isSplitB;

        const baseId   = s.id
            .replace(/_TEORIA$/, '')
            .replace(/_PRATICA_[A-Z]$/, '')
            .replace(/_PRATICA$/, '');
        // s.disc = "GBC014 - Programação Procedimental (Teoria)" → strip "(…)"
        const nomeBase = s.disc.replace(/ \(.*$/, '');

        if (!discMap.has(baseId)) {
            discMap.set(baseId, {
                id:       baseId,
                nome:     nomeBase,
                periodo:  s.periodo,
                teoria:   0,
                pratica:  0,
                tipo_lab: null,
                split:    false,
            });
        }
        const d = discMap.get(baseId);
        if      (isTeoria)   { d.teoria  = s.blocos_necessarios; }
        else if (isSplitA)   { d.pratica = s.blocos_necessarios; d.tipo_lab = s.tipo_sala; d.split = true; }
        else if (isPratica)  { d.pratica = s.blocos_necessarios; d.tipo_lab = s.tipo_sala; }
        // isSplitB → já registrado via isSplitA, ignorar
    });

    // Agrupar por período (ordem crescente)
    const porPeriodo = {};
    [...discMap.values()]
        .sort((a, b) => a.periodo - b.periodo || a.id.localeCompare(b.id))
        .forEach(d => {
            if (!porPeriodo[d.periodo]) porPeriodo[d.periodo] = [];
            porPeriodo[d.periodo].push(d);
        });

    const lista      = [...discMap.values()];
    const comPratica = lista.filter(d => d.pratica > 0).length;
    const comSplit   = lista.filter(d => d.split).length;
    const totais     = { disciplinas: discMap.size, comPratica, comSplit, sessoes: demandas.length };

    // ── Saída no terminal ──────────────────────────────────────────────────
    const LN = '─'.repeat(82);
    console.log(`\n  ┌${'─'.repeat(67)}┐`);
    console.log(`  │  VERIFICAÇÃO DE CARGAS T/P (pré-otimização)                       │`);
    console.log(`  └${'─'.repeat(67)}┘`);
    console.log('  ' + 'ID'.padEnd(14) + 'Per'.padEnd(5) + 'T(b)'.padEnd(6) +
        'P(b)'.padEnd(6) + 'Tipo Lab'.padEnd(24) + 'Split?'.padEnd(9) + 'Observação');
    console.log('  ' + LN);

    Object.keys(porPeriodo)
        .sort((a, b) => Number(a) - Number(b))
        .forEach(per => {
            porPeriodo[per].forEach(d => {
                const splitStr = d.pratica > 0 ? (d.split ? '✂ A+B' : 'única') : '—';
                const labStr   = d.tipo_lab && d.pratica > 0 ? d.tipo_lab : '—';
                const obs = d.pratica === 0
                    ? 'apenas teórica'
                    : d.split
                    ? '↑ turma dobrada (alunos > cap. lab)'
                    : '↓ turma única (alunos ≤ cap. lab)';
                console.log(
                    '  ' +
                    d.id.padEnd(14) +
                    String(d.periodo + 'º').padEnd(5) +
                    String(d.teoria  || 0).padEnd(6) +
                    String(d.pratica || 0).padEnd(6) +
                    labStr.padEnd(24) +
                    splitStr.padEnd(9) +
                    obs
                );
            });
            const nPrat = porPeriodo[per].filter(d => d.pratica > 0).length;
            console.log('  ' + ' '.repeat(14) +
                `  ── ${per}º Per: ${porPeriodo[per].length} disc. | ${nPrat} c/ prática`);
        });

    console.log('  ' + LN);
    console.log(`  📊 Disciplinas: ${totais.disciplinas} | C/ prática: ${totais.comPratica} ` +
        `| Split A+B: ${totais.comSplit} | Sessões p/ solver: ${totais.sessoes}`);
    if (comSplit > 0) {
        console.log(`  ⚠  ${comSplit} disciplina(s) geram 2 sessões de laboratório para o mesmo professor`);
    }

    return { porPeriodo, totais };
}

module.exports = { gerarCenarioBaseline, gerarCenarioSemSalas, gerarCenarioExtremo, relatarCargas };
