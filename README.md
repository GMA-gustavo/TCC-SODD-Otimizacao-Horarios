# SODD — Módulo de Otimização de Horários (protótipo)

Protótipo do módulo de otimização de grade horária para o **Sistema Online de Distribuição de
Disciplinas (SODD)** da Faculdade de Computação (FACOM) da Universidade Federal de Uberlândia (UFU).

O sistema resolve o *University Course Timetabling Problem* (UCTP) — alocar cada aula a um dia,
horário e sala — usando o solver **CP-SAT** da biblioteca [Google OR-Tools](https://developers.google.com/optimization).
Este repositório acompanha o Trabalho de Conclusão de Curso *"Evolução de um Sistema Acadêmico de
Distribuição de Disciplinas"* e contém o código-fonte, os dados de entrada e as instruções
necessárias para **reproduzir todos os experimentos** relatados na monografia.

---

## Arquitetura

Arquitetura híbrida em duas camadas, comunicando-se por JSON:

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Web | Node.js (sem dependências externas) | Interface de entrada de dados, persistência do cenário, orquestração |
| Otimização | Python + OR-Tools (CP-SAT) | Modelagem matemática e resolução do problema |

A camada Node serializa o cenário em JSON e executa o script Python como **subprocesso**,
recebendo de volta a grade resultante. O solver não depende de quem gera a entrada — é isso que
torna o módulo portável para o backend de produção do SODD.

---

## Pré-requisitos

- **Node.js** 18 ou superior
- **Python** 3.8 ou superior
- **OR-Tools** para Python

```bash
pip install ortools
```

Não há dependências npm: a camada web usa apenas os módulos nativos do Node.

---

## Instalação

```bash
git clone <url-do-repositorio>
cd tcc-prototipos-ortools
pip install ortools
```

Verifique se o Python está acessível como `python` no PATH (o Node o invoca por esse nome).

---

## Como usar

### 1. Interface web (uso interativo)

```bash
npm run frontend        # ou: node js/server.js
```

Acesse **http://localhost:3000**. O fluxo de trabalho é:

1. **Disciplinas** — cadastre ou importe a matriz curricular; etiquete cada disciplina com suas áreas.
2. **Professores** — cadastre um a um (*+ Novo Professor*) ou carregue o quadro completo de uma vez
   (*Importar JSON* — veja [o formato abaixo](#formato-do-arquivo-de-professores)). Para cada um,
   ajuste as preferências de horário (peso 1 a 10 por bloco), as indisponibilidades e as áreas
   preferidas.
3. **Salas** — cadastre as salas e laboratórios com tipo, capacidade e bloco físico.
4. **Áreas** — gerencie as áreas temáticas usadas na etiquetagem.
5. **Config** — ajuste alunos por turma, capacidade dos laboratórios, horários críticos e carga máxima.
6. **Otimizar** — dispare o solver e analise a grade, a auditoria docente e a carga horária.
   Exporte o relatório em HTML ou a grade em tabela (Excel/CSV).

O cenário é salvo em `js/cenario_editado.json` e recarregado automaticamente.

### 2. Bateria de experimentos (reprodução dos resultados do TCC)

```bash
npm run otimizar        # ou: node js/index.js
```

Executa os três experimentos relatados na monografia (limite de 300 s cada), imprime o comparativo
no terminal e gera um relatório HTML por experimento. Resultados esperados:

| Experimento | Salas conv. | Relatório gerado | Status | Pts | Tempo |
|---|---|---|---|---|---|
| EXP-1 — Baseline | 10 | `js/grade_exp1_baseline.html` | OPTIMAL | 4.613 | ~165–185 s |
| EXP-2 — Escassez | 6 | `js/grade_exp2_escassez.html` | OPTIMAL | 4.613 | ~110–145 s |
| EXP-3 — Extremo | 3 | `js/grade_exp3_extremo.html` | FEASIBLE | 4.445 | 300 s (limite) |

> ⏱️ A bateria leva ~10 minutos. Os tempos variam com a máquina; os status e as pontuações, não.

Os três cenários mantêm **constante** toda a demanda acadêmica (mesma matriz, mesmos professores,
mesmos laboratórios) e variam **apenas** o número de salas convencionais — é o controle variável que
permite isolar o efeito da escassez de espaço físico sobre a qualidade da grade.

Três achados valem destaque:

1. **EXP-1 e EXP-2 atingem o mesmo ótimo** (4.613) — as 4 salas extras do baseline são ociosas
   quanto à qualidade da grade.
2. **EXP-2 prova a otimalidade mais rápido que o EXP-1**, apesar de ter menos recursos: menos
   salas, menor espaço de busca a descartar.
3. **EXP-3 é o mais custoso de todos.** Perto da fronteira de viabilidade, a alocação vira um
   empacotamento apertado. A dificuldade em função da restrição tem forma de **U**, não é monotônica.

> Rodando o EXP-3 com 900 s (3× o limite), a pontuação fica **exatamente em 4.445** e o status
> segue `FEASIBLE`. Triplicar o tempo não acha grade melhor — forte indício de que 4.445 é o ótimo.
> O que não dá tempo de fazer é **provar** isso. Encontrar uma boa solução e demonstrar que ela é a
> melhor são tarefas de custos radicalmente diferentes.

---

## Estrutura do repositório

```
├── js/
│   ├── server.js                   # servidor HTTP da interface web (porta 3000)
│   ├── index.js                    # runner da bateria de 3 experimentos + relatório HTML
│   ├── scenarios.js                # monta os cenários dos 3 experimentos
│   ├── models.js                   # objetos de domínio; desdobramento (dobra) de laboratório
│   ├── cenario_editado.json        # cenário salvo pela interface
│   └── public/                     # front-end (ES modules nativos, sem build)
│       ├── index.html
│       ├── css/global.css
│       └── js/
│           ├── main.js             # navegação entre as abas
│           ├── state.js            # estado compartilhado e persistência
│           ├── util.js             # blocos, dias, horários, conversões
│           └── pages/              # um módulo por aba
│               ├── disciplinas.js  professores.js  salas.js
│               └── areas.js        config.js       otimizar.js
├── otimizador/
│   └── otimizador.py               # modelo CP-SAT: variáveis, restrições e função objetivo
├── disciplinas_bcc_ufu.json        # matriz curricular obrigatória (dados de entrada)
├── professores_exemplo.json        # quadro docente anonimizado (14 FACOM + 5 FAMAT)
└── package.json
```

---

## O modelo de otimização

O arquivo `otimizador/otimizador.py` concentra toda a modelagem, organizada em seções numeradas.

### Variáveis de decisão

Uma variável booleana por combinação de **sessão × sala × dia × bloco**. Vale 1 quando aquela aula
é alocada naquele lugar e horário.

Blocos: `M1` 07:10 · `M2` 08:50 · `M3` 10:40 · `T1` 13:10 · `T2` 14:50 · `T3` 16:50 — de segunda a sexta.

### Restrições rígidas (invioláveis)

- Cada sessão ocupa exatamente o número de blocos que sua carga horária exige.
- Uma sala não abriga duas aulas no mesmo horário.
- Um professor não ministra duas aulas no mesmo horário.
- **Indisponibilidades** dos professores são bloqueios absolutos — nenhuma pontuação as supera.
- Períodos ímpares ficam no turno da manhã; períodos pares, no turno da tarde.

### Status de retorno

| Status | Significado | O que fazer |
|---|---|---|
| `OPTIMAL` | Achou a melhor grade **e provou** que não existe melhor. | Nada. |
| `FEASIBLE` | Achou uma grade válida, mas o tempo acabou antes de provar otimalidade. | Usável; aumente o tempo se quiser o ótimo. |
| `INFEASIBLE` | **Provou** que nenhuma grade satisfaz todas as restrições rígidas. | Revise o cenário: mais salas, menos carga, menos indisponibilidades. |
| `UNKNOWN` | O tempo acabou antes de achar a primeira solução. | **Não é prova de inviabilidade** — aumente `tempo_solver`. |

> ⚠️ `UNKNOWN` e `INFEASIBLE` são coisas diferentes. O primeiro diz "não deu tempo de descobrir";
> o segundo diz "provei que é impossível". Tratá-los como iguais leva a mexer nas salas quando o
> problema era só o limite de tempo.

### Função objetivo (restrições flexíveis)

O solver maximiza a soma das parcelas abaixo. A grandeza de referência para calibrar todos os
bônus é o **intervalo de preferência** = peso alto (10) − peso crítico (2) = **8 pontos por bloco**.

| Parcela | Valor | Concedido | Por que esse valor |
|---|---|---|---|
| Preferência de horário | 1 a 10 | por bloco alocado | Escala declarada pelo docente; é a moeda base. Padrão **3** se o bloco não tiver peso declarado. |
| Aula geminada | **+50** | por par consecutivo da mesma sessão | *Acima* do intervalo para 2 blocos (16): prioriza intencionalmente a continuidade da aula sobre o conforto de horário. |
| Coorte de período | **+30** | por par consecutivo do mesmo período na mesma sala | *Acima* do intervalo, mas abaixo da geminada: compacta a grade da turma sem competir com a continuidade da aula. |
| Compensação por horário crítico | **+7** | uma vez por professor | *Estritamente menor* que o intervalo (8): arbitra equidade sem induzir o solver a buscar horários críticos de propósito. |
| Sala base da turma | **+5** | por bloco de aula teórica na sala base do período | Menor que o intervalo (8): atua só como desempate, nunca sacrifica um horário preferido. |

**Horários críticos** (`M1` e `T3`, configuráveis) são os blocos nos extremos do dia — indesejados,
mas não proibidos. A compensação garante que quem os recebe seja priorizado nos demais horários.

> **Calibração do bônus de compensação:** buscar o horário crítico de propósito precisa ser sempre
> pior. Comparando duas estratégias para dois blocos de um professor: alocação ótima = `10 + 10 = 20`
> contra crítico + compensação = `2 + 10 + 7 = 19`. Como `19 < 20`, nunca compensa. A condição geral
> é `BONUS_COMP < 8`; o valor 7 é o maior que ainda a satisfaz.

### Limite de tempo

Configurável na aba **Config** (10 a 600 s, padrão **120 s**) e enviado ao solver em
`config.tempo_solver`. Quando a entrada não informa o valor, o padrão é 120 s.

Encontrar o ótimo exige **provar** que nenhuma grade é melhor — e é essa prova, não a busca, que
custa caro. No cenário completo (10 salas): em **120 s** o solver retorna `FEASIBLE` com 4.598 pts;
em **~165–185 s** ele fecha `OPTIMAL` com 4.613 pts. Ou seja, a solução de 2 minutos já está a **0,3%
do ótimo** — o tempo extra serve para provar a otimalidade, não para achar uma grade melhor.

Por isso a bateria de experimentos (`js/scenarios.js`) usa **300 s**: ali a prova de otimalidade é
o próprio objeto de estudo. Para uso do dia a dia, 120 s é suficiente.

---

## Formato do arquivo de professores

O quadro docente é montado de duas formas: **manualmente** pela aba Professores, ou **importando um
JSON** pelo botão *Importar JSON*. Esta seção descreve o formato aceito.

> ⚠️ A importação **substitui** a lista atual de professores (não acrescenta).

### Formato mínimo

Só três campos são obrigatórios por professor. Todo o resto ganha um padrão sensato:

```json
{
  "professores": [
    { "id": "1001", "nome": "Prof. Ana",   "unidade": "FACOM" },
    { "id": "1002", "nome": "Prof. Bruno", "unidade": "FAMAT" }
  ]
}
```

Um array puro também funciona: `[ { "id": "1001", ... } ]`.

### Formato completo

```json
{
  "professores": [
    {
      "id": "1001",
      "nome": "Prof. Ana",
      "unidade": "FACOM",
      "preferencias": { "M1": 2, "M2": 10, "M3": 6, "T1": 6, "T2": 10, "T3": 2 },
      "indisponibilidades": [
        { "dia": "Seg", "bloco": "M1" },
        { "dia": "Sex", "bloco": "T3" }
      ],
      "areasPreferidas": ["algoritmos", "programacao"]
    }
  ]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | ✅ | Identificador único (na UFU, o SIAPE). Texto ou número. |
| `nome` | ✅ | Nome exibido na grade e nos relatórios. |
| `unidade` | ✅ | `"FACOM"` ou `"FAMAT"`. Define o pool de disciplinas que o professor pode receber. Qualquer valor diferente de `"FAMAT"` vira `"FACOM"`. |
| `preferencias` | — | Peso **1 a 10** para cada bloco (`M1`,`M2`,`M3`,`T1`,`T2`,`T3`). 1 = evitar, 10 = preferido. Omitido ⇒ padrão da unidade. |
| `indisponibilidades` | — | Horários **bloqueados** (restrição rígida). `dia` ∈ `Seg,Ter,Qua,Qui,Sex`; `bloco` ∈ `M1..T3`. Omitido ⇒ `[]`. |
| `areasPreferidas` | — | Áreas de afinidade. O sistema tenta dar ao professor disciplinas dessas áreas (nunca é obrigatório). Omitido ⇒ `[]`. |

**Padrões de `preferencias` quando omitido:**

| Unidade | M1 | M2 | M3 | T1 | T2 | T3 |
|---|---|---|---|---|---|---|
| FACOM | 2 | 10 | 6 | 6 | 10 | 2 |
| FAMAT | 2 | 8 | 6 | 10 | 8 | 2 |

### Diferença entre preferência e indisponibilidade

São coisas distintas, e confundi-las é o erro mais comum ao montar o arquivo:

- **`preferencias`** é uma *gradação*. Peso 1 não proíbe nada — só torna aquele horário pouco
  atrativo. O solver pode alocar ali se compensar no conjunto.
- **`indisponibilidades`** é uma *negação absoluta*. É restrição rígida: nenhuma pontuação a supera.

Repare também que a preferência é declarada **por bloco, não por dia**: peso 10 em `M2` vale para as
manhãs de todos os dias. Para dizer "não posso na sexta de manhã", use `indisponibilidades`.

### Arquivo de exemplo

O repositório inclui **`professores_exemplo.json`**, com 19 professores anonimizados
(14 FACOM + 5 FAMAT). É esse arquivo que a bateria de experimentos consome, e é ele que
reproduz os números da monografia. Serve também como ponto de partida para montar o seu.

---

## Formato do cenário completo

Além dos professores, você pode importar/exportar um **cenário inteiro** (disciplinas, professores,
salas, áreas e configuração) pela aba Otimizar. É o mesmo formato salvo em `js/cenario_editado.json`:

```json
{
  "disciplinas": [
    { "id": "GBC001", "nome": "Programação 1", "unidade": "FACOM", "periodo": 1,
      "t_horas": 60, "p_horas": 30, "lab": "Lab", "permiteDobra": true,
      "grupos": ["programacao"],
      "turmas": [{ "turma": "S", "alunos": 45, "professorId": null, "situacao": "Ativa" }] }
  ],
  "professores": [ /* mesmo formato da seção anterior */ ],
  "salas":  [{ "id": "1B-101", "tipo": "Normal", "capacidade": 60, "bloco": "1B" }],
  "grupos": ["algoritmos", "programacao", "bd"],
  "config": {
    "alunosPorTurma": 45, "capacidadeLabPadrao": 40,
    "horariosCriticos": ["M1", "T3"], "tempoSolver": 120, "cargaMaxProfessor": 180,
    "anoLetivo": 2026, "semestreLetivo": 1,
    "dataInicioPeriodo": "2026-03-02", "dataFimPeriodo": "2026-07-11"
  }
}
```

Notas úteis ao montar um cenário à mão:

- `t_horas`/`p_horas` são **horas semestrais** (como no projeto pedagógico), não blocos. A conversão
  para blocos semanais é automática: `blocos = round(horas / 30)`.
- `turmas[].professorId` com `null` significa **atribuição automática** — o sistema escolhe o
  professor, preferindo os que declararam as áreas da disciplina.
- `grupos` (no nível da disciplina) são as **áreas** dela. Uma disciplina pode ter várias.
- `grupos` (no nível raiz) é a lista de áreas existentes no sistema.
- Turmas com `"situacao": "Inativa"` ficam de fora da otimização sem precisar ser removidas.

---

## Formato dos dados (interno)

Este é o formato trocado entre as camadas — útil se você for integrar o solver a outro sistema.

### Entrada (Node → Python)

```json
{
  "salas":       [{ "id": "1B-101", "tipo": "Normal", "capacidade": 60, "bloco": "1B" }],
  "professores": [{ "id": "1543824", "nome": "Prof. Ana",
                    "preferencias":       { "M1": 2, "M2": 10, "M3": 6, "T1": 6, "T2": 10, "T3": 2 },
                    "indisponibilidades": [{ "dia": "Seg", "bloco": "M1" }] }],
  "demandas":    [{ "id": "GBC001~S_TEORIA", "prof": "1543824",
                    "disc": "Programação 1 (Teoria)", "periodo": 1,
                    "tipo_sala": "Normal", "blocos_necessarios": 2 }],
  "config":      { "horarios_criticos": ["M1", "T3"], "tempo_solver": 120 }
}
```

### Saída (Python → Node)

```json
{
  "status": "OPTIMAL",
  "tempo_execucao": 23.4,
  "pontuacao_objetivo": 4212,
  "alocacoes": [{ "Periodo": "1º Período", "Dia": "Seg", "Bloco": "M2",
                  "Sala": "1B-101", "Materia": "Programação 1 (Teoria)",
                  "Professor": "Prof. Ana", "Tipo": "Normal" }],
  "relatorio_professores": [{ "nome": "Prof. Ana", "pontuacao_prefs": 40, "max_possivel": 40,
                              "satisfacao_pct": 100.0, "criticos": 0, "sessoes_alocadas": [] }],
  "coorte_global": 120,
  "salas_turma": { "1": "1B-101" },
  "carga_horaria": { "Prof. Ana": { "blocos": 4, "dobras": 0 } }
}
```

O **percentual de satisfação** é calculado como `pontuacao_prefs / max_possivel × 100`, onde
`max_possivel` é o que o professor obteria se *todos* os seus blocos caíssem em sua maior
preferência. Os bônus são deliberadamente **excluídos** dessa razão, para que a métrica permaneça
entre 0% e 100% e seja comparável entre docentes.

---

## Conversões e regras de negócio

- **Horas → blocos semanais:** `blocos = round(horas / 30)`, considerando ~15 semanas letivas a 2h/aula.
- **Dobra de laboratório:** quando os alunos de uma turma excedem a capacidade do laboratório
  (padrão 45 alunos contra 40 vagas), a aula prática é desdobrada em duas sessões (A e B). Isso
  aumenta a carga efetiva do professor, que é contabilizada e sinalizada separadamente. Disciplinas
  de carga fixa podem ser marcadas para **não** sofrer desdobramento.

---

## Nota sobre os dados

A **matriz curricular** (`disciplinas_bcc_ufu.json`) é real: transcrita do projeto pedagógico do
curso, informação institucional pública.

O **quadro docente** (`professores_exemplo.json`) é **anonimizado**. Contém 19 professores
(`Prof. FACOM 01`…`Prof. FAMAT 05`) com identificadores fictícios. A versão original derivava de um
cadastro com nome completo e SIAPE — matrícula funcional — de servidores reais, e foi
deliberadamente retirada do repositório: um repositório público fica indexado permanentemente, e
dado pessoal não deve ser publicado sem necessidade.

**A anonimização não altera os resultados.** O modelo de otimização não usa nomes nem matrículas: o
que importa é a *quantidade* de professores por unidade, suas *preferências* e suas
*indisponibilidades*. Como o arquivo anonimizado preserva exatamente essas três coisas
(14 FACOM + 5 FAMAT, mesmos pesos, mesmas indisponibilidades nas mesmas posições), a bateria
reproduz os mesmos 4.613 pontos.

As **preferências de horário** também **não foram coletadas junto aos docentes**: são perfis padrão
plausíveis (peso 2 para M1/T3, 10 para M2/T2, 6 para os demais, com variação por unidade). São,
portanto, dados verossímeis quanto à demanda e à estrutura, porém **sintéticos quanto à vontade
individual**. As métricas de satisfação medem a capacidade do modelo de honrar um conjunto plausível
de preferências — não o contentamento efetivo do corpo docente da faculdade.

Para usar dados reais, monte seu próprio arquivo conforme a
[seção de formato](#formato-do-arquivo-de-professores). O `.gitignore` já bloqueia os padrões
`professores_ativos*.csv` e `professores_reais*.json`, de modo que um arquivo com dados pessoais não
seja versionado por acidente.

---

## Licença

Trabalho acadêmico desenvolvido na Universidade Federal de Uberlândia (UFU/FACOM).

**Autor:** Gustavo Mascarenhas Amorim
**Orientador:** Prof. Dr. Victor Sobreira
