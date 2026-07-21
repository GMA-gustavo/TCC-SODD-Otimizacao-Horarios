import json
import sys
from ortools.sat.python import cp_model

def main():
    # --- 1. RECEBIMENTO DOS DADOS ---
    try:
        arg = sys.argv[1]
        # Aceita JSON direto (string começando com '{') OU caminho de arquivo
        if arg.strip().startswith('{') or arg.strip().startswith('['):
            dados_entrada = json.loads(arg)
        else:
            with open(arg, 'r', encoding='utf-8') as f:
                dados_entrada = json.load(f)
    except (IndexError, json.JSONDecodeError, FileNotFoundError, OSError) as e:
        print(json.dumps({"status": "ERROR", "message": str(e)}))
        sys.exit(1)

    SALAS             = dados_entrada.get('salas', [])
    PROFESSORES       = dados_entrada.get('professores', [])
    SESSOES_DE_AULA   = dados_entrada.get('demandas', [])
    SLOTS_CRITICOS    = dados_entrada.get('config', {}).get('horarios_criticos', [])

    # Limite de tempo do solver, em segundos — definido pelo usuário na aba Config.
    # 120 s é o padrão usado quando a entrada não informa o valor (ex: JSON antigo).
    try:
        TEMPO_MAX = float(dados_entrada.get('config', {}).get('tempo_solver', 120))
    except (TypeError, ValueError):
        TEMPO_MAX = 120.0
    if TEMPO_MAX <= 0:
        TEMPO_MAX = 120.0

    DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
    BLOCOS_MANHA   = ['M1', 'M2', 'M3']
    BLOCOS_TARDE   = ['T1', 'T2', 'T3']
    TODOS_OS_BLOCOS = BLOCOS_MANHA + BLOCOS_TARDE

    dicionario_professores = {p['id']: p for p in PROFESSORES}

    # --- 2. MODELAGEM ---
    model = cp_model.CpModel()
    alocacoes = {}

    for sessao in SESSOES_DE_AULA:
        try:
            num_periodo = int(sessao.get('periodo', 9))
            blocos_ok = BLOCOS_MANHA if num_periodo % 2 != 0 else BLOCOS_TARDE
        except ValueError:
            blocos_ok = TODOS_OS_BLOCOS

        for sala in SALAS:
            if sessao['tipo_sala'] != sala['tipo']:
                continue
            for dia in DIAS_DA_SEMANA:
                for bloco in blocos_ok:
                    chave = (sessao['id'], sala['id'], dia, bloco)
                    alocacoes[chave] = model.NewBoolVar(f"a_{sessao['id']}_{sala['id']}_{dia}_{bloco}")

    # --- 3. RESTRIÇÕES RÍGIDAS (HARD CONSTRAINTS) ---

    # 3.1 Cada sessão ocupa exatamente blocos_necessarios slots
    for sessao in SESSOES_DE_AULA:
        vars_sessao = [
            alocacoes[(sessao['id'], sala['id'], dia, bloco)]
            for sala in SALAS if sessao['tipo_sala'] == sala['tipo']
            for dia in DIAS_DA_SEMANA
            for bloco in TODOS_OS_BLOCOS
            if (sessao['id'], sala['id'], dia, bloco) in alocacoes
        ]
        if vars_sessao:
            model.Add(sum(vars_sessao) == sessao['blocos_necessarios'])

    # 3.2 Sem duas sessões na mesma sala no mesmo horário
    for dia in DIAS_DA_SEMANA:
        for bloco in TODOS_OS_BLOCOS:
            for sala in SALAS:
                aulas_sala = [
                    alocacoes[(s['id'], sala['id'], dia, bloco)]
                    for s in SESSOES_DE_AULA
                    if (s['id'], sala['id'], dia, bloco) in alocacoes
                ]
                if aulas_sala:
                    model.Add(sum(aulas_sala) <= 1)

    # 3.3 Sem conflito de professor (mesmo professor, mesmo horário)
    for dia in DIAS_DA_SEMANA:
        for bloco in TODOS_OS_BLOCOS:
            for id_prof in dicionario_professores:
                aulas_prof = [
                    alocacoes[(s['id'], sala['id'], dia, bloco)]
                    for s in SESSOES_DE_AULA if s['prof'] == id_prof
                    for sala in SALAS
                    if (s['id'], sala['id'], dia, bloco) in alocacoes
                ]
                if aulas_prof:
                    model.Add(sum(aulas_prof) <= 1)

    # 3.4 Indisponibilidades de professores (hard constraint)
    # Para cada slot (dia, bloco) declarado como indisponível, todas as variáveis
    # de alocação desse professor naquele slot são forçadas a 0.
    # Isso garante que o solver nunca aloque o professor num horário bloqueado,
    # independentemente de quantos pontos de preferência ele valha.
    for prof in PROFESSORES:
        for indisp in prof.get('indisponibilidades', []):
            dia_b   = indisp.get('dia')
            bloco_b = indisp.get('bloco')
            if dia_b not in DIAS_DA_SEMANA or bloco_b not in TODOS_OS_BLOCOS:
                continue  # entrada inválida: ignorar silenciosamente
            for sessao in SESSOES_DE_AULA:
                if sessao['prof'] != prof['id']:
                    continue
                for sala in SALAS:
                    chave = (sessao['id'], sala['id'], dia_b, bloco_b)
                    if chave in alocacoes:
                        model.Add(alocacoes[chave] == 0)

    # --- 4. FUNÇÃO OBJETIVO — SOFT CONSTRAINTS ---
    pontuacao_total = []
    rastreio_geminadas   = []
    rastreio_coorte      = []
    rastreio_compensacao = []

    # 4.1 Preferências de horário dos professores
    for sessao in SESSOES_DE_AULA:
        prefs = dicionario_professores[sessao['prof']].get('preferencias', {})
        for sala in SALAS:
            if sessao['tipo_sala'] != sala['tipo']:
                continue
            for dia in DIAS_DA_SEMANA:
                for bloco in TODOS_OS_BLOCOS:
                    if (sessao['id'], sala['id'], dia, bloco) in alocacoes:
                        peso = prefs.get(bloco, 3)   # padrão 3 para blocos sem preferência explícita
                        pontuacao_total.append(alocacoes[(sessao['id'], sala['id'], dia, bloco)] * peso)

    # 4.2 Aulas geminadas (dois blocos consecutivos da mesma sessão = bônus de continuidade)
    sequencias = [('M1','M2'), ('M2','M3'), ('T1','T2'), ('T2','T3')]
    for sessao in SESSOES_DE_AULA:
        if sessao['blocos_necessarios'] >= 2:
            for sala in SALAS:
                if sessao['tipo_sala'] != sala['tipo']:
                    continue
                for dia in DIAS_DA_SEMANA:
                    for b1, b2 in sequencias:
                        c1 = (sessao['id'], sala['id'], dia, b1)
                        c2 = (sessao['id'], sala['id'], dia, b2)
                        if c1 in alocacoes and c2 in alocacoes:
                            gem = model.NewBoolVar(f"gem_{sessao['id']}_{sala['id']}_{dia}_{b1}")
                            model.Add(gem <= alocacoes[c1])
                            model.Add(gem <= alocacoes[c2])
                            pontuacao_total.append(gem * 50)
                            rastreio_geminadas.append({
                                "prof": sessao['prof'], "materia": sessao['disc'],
                                "dia": dia, "b1": b1, "b2": b2, "variavel": gem
                            })

    # 4.3 Coorte de período (turmas do mesmo período em salas adjacentes consecutivas)
    periodos_em_jogo = set(s.get('periodo', 1) for s in SESSOES_DE_AULA)
    for p in periodos_em_jogo:
        sessoes_p = [s for s in SESSOES_DE_AULA if s.get('periodo') == p and s['tipo_sala'] == 'Normal']
        if len(sessoes_p) < 2:
            continue
        for sala in SALAS:
            if sala['tipo'] != 'Normal':
                continue
            for dia in DIAS_DA_SEMANA:
                for b1, b2 in sequencias:
                    vp1 = [alocacoes[(s['id'], sala['id'], dia, b1)] for s in sessoes_p if (s['id'], sala['id'], dia, b1) in alocacoes]
                    vp2 = [alocacoes[(s['id'], sala['id'], dia, b2)] for s in sessoes_p if (s['id'], sala['id'], dia, b2) in alocacoes]
                    if vp1 and vp2:
                        coo = model.NewBoolVar(f"coo_{p}_{sala['id']}_{dia}_{b1}")
                        model.Add(coo <= sum(vp1))
                        model.Add(coo <= sum(vp2))
                        pontuacao_total.append(coo * 30)
                        rastreio_coorte.append({"periodo": p, "sala": sala['id'], "dia": dia, "b1": b1, "b2": b2, "variavel": coo})

    # 4.4 Compensação por horário crítico
    # Se um professor for alocado em horário crítico (M1/T3), recebe bônus quando
    # outra sessão sua cair em horário preferido — favorecendo-o na disputa por vagas.
    # BONUS_COMP = 7: suficientemente menor que (pref_alto - pref_critico) = 10-2 = 8
    # para não criar incentivo perverso de buscar horários críticos.
    BONUS_COMP = 7

    for id_prof in dicionario_professores:
        sessoes_prof = [s for s in SESSOES_DE_AULA if s['prof'] == id_prof]
        if len(sessoes_prof) < 2:
            continue

        # Variáveis de alocação deste professor em slots críticos
        vars_criticas = [
            alocacoes[(s['id'], sala['id'], dia, bloco)]
            for s in sessoes_prof
                for sala in SALAS if s['tipo_sala'] == sala['tipo']
                    for dia in DIAS_DA_SEMANA
                        for bloco in SLOTS_CRITICOS
                            if (s['id'], sala['id'], dia, bloco) in alocacoes
        ]
        if not vars_criticas:
            continue

        # Indicador binário: professor tem pelo menos um slot crítico
        prof_em_critico = model.NewBoolVar(f"em_critico_{id_prof}")
        model.AddMaxEquality(prof_em_critico, vars_criticas)

        # Variáveis de alocação deste professor em slots de alta preferência
        prefs = dicionario_professores[id_prof].get('preferencias', {})
        blocos_pref_altos = [b for b, w in prefs.items() if w >= 8]
        vars_pref = [
            alocacoes[(s['id'], sala['id'], dia, bloco)]
            for s in sessoes_prof
                for sala in SALAS if s['tipo_sala'] == sala['tipo']
                    for dia in DIAS_DA_SEMANA
                        for bloco in blocos_pref_altos
                            if (s['id'], sala['id'], dia, bloco) in alocacoes
        ]
        if not vars_pref:
            continue

        # Indicador: professor tem pelo menos um slot preferido
        prof_tem_pref = model.NewBoolVar(f"tem_pref_{id_prof}")
        model.AddMaxEquality(prof_tem_pref, vars_pref)

        # Bônus de compensação: ativo quando ambas as condições são verdadeiras
        compensacao = model.NewBoolVar(f"comp_{id_prof}")
        model.Add(compensacao <= prof_em_critico)
        model.Add(compensacao <= prof_tem_pref)
        pontuacao_total.append(compensacao * BONUS_COMP)
        rastreio_compensacao.append({"prof": id_prof, "variavel": compensacao})

    # 4.5 Sala da Turma — bônus por concentração de aulas teóricas do mesmo período na mesma sala
    # Ter uma "sala base" por período facilita a orientação espacial dos alunos,
    # especialmente nos períodos iniciais do curso.
    # BONUS_SALA_TURMA = 5: menor que o gap de preferência (10-2=8), portanto o solver
    # nunca sacrifica um horário preferido para ganhar o bônus de sala. Age como
    # desempate natural quando há liberdade de escolha de sala.
    BONUS_SALA_TURMA = 5
    salas_normais = [sala for sala in SALAS if sala['tipo'] == 'Normal']
    vars_home_por_periodo = {}

    for p in periodos_em_jogo:
        sessoes_p_normal = [
            s for s in SESSOES_DE_AULA
            if s.get('periodo') == p and s['tipo_sala'] == 'Normal'
        ]
        if not sessoes_p_normal or not salas_normais:
            continue

        vars_home = {
            sala['id']: model.NewBoolVar(f"home_{p}_{sala['id']}")
            for sala in salas_normais
        }
        # No máximo uma sala pode ser a "sala base" do período
        model.Add(sum(vars_home.values()) <= 1)

        for sessao in sessoes_p_normal:
            for sala in salas_normais:
                for dia in DIAS_DA_SEMANA:
                    for bloco in TODOS_OS_BLOCOS:
                        chave = (sessao['id'], sala['id'], dia, bloco)
                        if chave in alocacoes:
                            coin = model.NewBoolVar(
                                f"hcoin_{p}_{sessao['id']}_{sala['id']}_{dia}_{bloco}"
                            )
                            model.Add(coin <= alocacoes[chave])
                            model.Add(coin <= vars_home[sala['id']])
                            pontuacao_total.append(coin * BONUS_SALA_TURMA)

        vars_home_por_periodo[p] = vars_home

    model.Maximize(sum(pontuacao_total))

    # --- 5. SOLUÇÃO ---
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = TEMPO_MAX
    status = solver.Solve(model)

    # --- 6. EXTRAÇÃO DE RESULTADOS E AUDITORIA ---
    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        lista_final = []
        relatorio_profs = {
            p['id']: {
                'nome': p['nome'],
                'pontuacao_prefs':  0,   # pontos de preferência (nunca passa de max_possivel)
                'pontuacao_bonus':  0,   # bônus extras: geminadas e compensação
                'max_possivel':     0,   # máximo teórico se todos os blocos fossem preferidos
                'criticos':         0,
                'sessoes_alocadas': [],  # [{materia, dia, bloco, peso, status}]
                'blocos_total':     0,
                # Slots bloqueados declarados — usados para verificação no relatório HTML
                'indisponibilidades': p.get('indisponibilidades', [])
            }
            for p in PROFESSORES
        }
        pontuacao_coorte_global = 0

        # Máximo possível = se TODOS os blocos de cada sessão fossem no melhor horário
        for sessao in SESSOES_DE_AULA:
            p_id = sessao['prof']
            prefs = dicionario_professores[p_id].get('preferencias', {})
            max_bloco = max(prefs.values()) if prefs else 10
            relatorio_profs[p_id]['max_possivel'] += max_bloco * sessao['blocos_necessarios']

        # Registra cada bloco alocado com seu status detalhado
        for sessao in SESSOES_DE_AULA:
            for sala in SALAS:
                if sessao['tipo_sala'] != sala['tipo']:
                    continue
                for dia in DIAS_DA_SEMANA:
                    for bloco in TODOS_OS_BLOCOS:
                        chave = (sessao['id'], sala['id'], dia, bloco)
                        if chave in alocacoes and solver.Value(alocacoes[chave]) == 1:
                            lista_final.append({
                                "Periodo": f"{sessao.get('periodo', '?')}º Período",
                                "Dia": dia, "Bloco": bloco, "Sala": sala['id'],
                                "Materia": sessao['disc'],
                                "Professor": dicionario_professores[sessao['prof']]['nome'],
                                "Tipo": sala['tipo']
                            })
                            p_id = sessao['prof']
                            prefs = dicionario_professores[p_id].get('preferencias', {})
                            peso = prefs.get(bloco, 3)
                            max_bloco = max(prefs.values()) if prefs else 10

                            relatorio_profs[p_id]['pontuacao_prefs'] += peso
                            relatorio_profs[p_id]['blocos_total'] += 1

                            if bloco in SLOTS_CRITICOS:
                                st = 'critico'
                                relatorio_profs[p_id]['criticos'] += 1
                            elif peso >= 8:
                                st = 'atendido'
                            else:
                                st = 'neutro'

                            relatorio_profs[p_id]['sessoes_alocadas'].append({
                                'materia': sessao['disc'][:40],
                                'dia': dia,
                                'bloco': bloco,
                                'peso': peso,
                                'max_bloco': max_bloco,
                                'status': st
                            })

        # Geminadas conquistadas — bônus contabilizados separado das preferências
        for esp in rastreio_geminadas:
            if solver.Value(esp['variavel']) == 1:
                p_id = esp['prof']
                relatorio_profs[p_id]['pontuacao_bonus'] += 50
                relatorio_profs[p_id]['sessoes_alocadas'].append({
                    'materia': f"⭐ Geminada: {esp['materia'][:30]}",
                    'dia': esp['dia'], 'bloco': f"{esp['b1']}+{esp['b2']}",
                    'peso': 50, 'max_bloco': 50, 'status': 'bonus'
                })

        # Compensação por horário crítico conquistada — bônus único por professor
        for esp in rastreio_compensacao:
            if solver.Value(esp['variavel']) == 1:
                p_id = esp['prof']
                relatorio_profs[p_id]['pontuacao_bonus'] += BONUS_COMP
                relatorio_profs[p_id]['sessoes_alocadas'].append({
                    'materia': '⚖ Compensação por horário crítico',
                    'dia': '—', 'bloco': '—',
                    'peso': BONUS_COMP, 'max_bloco': BONUS_COMP, 'status': 'bonus'
                })

        # Coorte conquistado
        for esp in rastreio_coorte:
            if solver.Value(esp['variavel']) == 1:
                pontuacao_coorte_global += 30

        # Sala base ativada por período (qual vars_home o solver escolheu)
        salas_turma = {}
        for p, vars_home in vars_home_por_periodo.items():
            sala_escolhida = None
            for sala_id, var in vars_home.items():
                if solver.Value(var) == 1:
                    sala_escolhida = sala_id
                    break
            salas_turma[str(p)] = sala_escolhida

        # Cálculo de carga horária e dobras por professor
        carga_prof = {}
        for aul in lista_final:
            nome = aul['Professor']
            if nome not in carga_prof:
                carga_prof[nome] = {'blocos': 0, 'sessoes': []}
            carga_prof[nome]['blocos'] += 1
            carga_prof[nome]['sessoes'].append(aul['Materia'])

        for nome, dados in carga_prof.items():
            bases = {}
            for s in dados['sessoes']:
                base = s.split(' (')[0].rsplit('_', 1)[0]
                bases[base] = bases.get(base, 0) + 1
            dados['dobras'] = sum(1 for cnt in bases.values() if cnt >= 2)

        print(json.dumps({
            "status": solver.StatusName(status),
            "tempo_execucao": solver.WallTime(),
            "pontuacao_objetivo": int(solver.ObjectiveValue()),
            "alocacoes": lista_final,
            "relatorio_professores": [
                {
                    **v,
                    "pontuacao_total": v['pontuacao_prefs'] + v['pontuacao_bonus'],
                    "satisfacao_pct": round(v['pontuacao_prefs'] / v['max_possivel'] * 100, 1)
                                      if v['max_possivel'] > 0 else 0
                }
                for v in relatorio_profs.values()
            ],
            "coorte_global": pontuacao_coorte_global,
            "salas_turma": salas_turma,
            "carga_horaria": carga_prof
        }))
    else:
        print(json.dumps({
            "status": solver.StatusName(status),
            "tempo_execucao": solver.WallTime(),
            "pontuacao_objetivo": 0,
            "alocacoes": [],
            "relatorio_professores": [],
            "salas_turma": {},
            "carga_horaria": {}
        }))

if __name__ == '__main__':
    main()
