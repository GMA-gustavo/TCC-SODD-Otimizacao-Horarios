# Product

## Register

product

## Users

Coordenadores e gestores da FACOM/UFU que montam o cenário semestral de distribuição de
disciplinas: inserem turmas, professores e salas, depois disparam o solver. Professores que
declaram preferências de horário e indisponibilidades. Ambos operam sob pressão de prazos
institucionais; a ferramenta precisa ser confiável o suficiente para ser usada sem manual.
Contexto secundário: orientador e banca do TCC avaliam o protótipo como prova de conceito.

## Product Purpose

Motor de otimização de escalonamento acadêmico para a UFU. Resolve automaticamente a
atribuição de disciplinas a horários e salas usando programação por restrições (Google
OR-Tools CP-SAT). O protótipo demonstra viabilidade técnica para integração futura ao
sistema SODD da FACOM.

## Brand Personality

Precisa, institucional, sem fricção. Três palavras: confiável, direta, competente.
Transmite domínio técnico sem intimidar o coordenador não-técnico.

## Anti-references

- Sistemas legados universitários (SIGA-estilo): fontes miúdas, tabelas zebradas sem
  respiro, cores institucionais duras, densidade sem hierarquia.
- SaaS cream com gradiente: hero roxo/azul, métricas gigantes, parece startup que não
  tem relação com gestão universitária.
- Bootstrap padrão: azul #0d6efd genérico, parece projeto de faculdade inacabado.

## Design Principles

1. **Clareza antes de elegância** — cada elemento existe para reduzir carga cognitiva,
   não para impressionar.
2. **Densidade com respiro** — tabelas e grids densos precisam de espaçamento interno
   generoso; nunca compactar para caber mais dados visualmente.
3. **Status visível** — o usuário sabe a qualquer momento o que está salvo, o que está
   pendente e o que o solver encontrou.
4. **Erros honestos** — mensagens em linguagem direta, sem tecnicismos do solver expostos
   ao usuário final.
5. **Institucional sem ser pesado** — pertence ao contexto universitário, mas a estética
   é contemporânea, limpa, e pode ser mostrada com orgulho na banca.

## Accessibility & Inclusion

WCAG AA. Contraste mínimo 4.5:1 para texto corrido. Formulários com labels explícitas
associadas. Interface navegável por teclado. Sem dependência de cor como único indicador
de estado (ícones + cor em paralelo).
