// pages/config.js — parâmetros globais do cenário

import { S, autoSave } from '../state.js';
import { toast } from '../util.js';

let host = null;
const $ = id => document.getElementById(id);

function salvarConfig() {
  S.config.alunosPorTurma      = +$('cfg-alunos').value  || 45;
  S.config.capacidadeLabPadrao = +$('cfg-cap-lab').value || 40;
  S.config.horariosCriticos    = $('cfg-criticos').value.split(',').map(s => s.trim()).filter(Boolean);
  S.config.tempoSolver         = +$('cfg-tempo').value   || 120;
  S.config.cargaMaxProfessor   = +$('cfg-carga-max').value || 180;
  S.config.anoLetivo           = +$('cfg-ano').value || new Date().getFullYear();
  S.config.semestreLetivo      = +$('cfg-semestre').value || 1;
  S.config.dataInicioPeriodo   = $('cfg-data-ini').value || '';
  S.config.dataFimPeriodo      = $('cfg-data-fim').value || '';
  toast('Configurações salvas', 'ok'); autoSave();
}

function atuLabelPeriodo() {
  const el = $('cfg-periodo-label');
  if (el) el.textContent = `Período letivo: ${$('cfg-ano').value}/${$('cfg-semestre').value}`;
}

function markup() {
  return `
  <div style="max-width:440px">
    <div class="card" style="padding:22px">
      <h3 style="margin:0 0 18px;font-size:15px;font-weight:700;color:var(--c-text);letter-spacing:-.01em">Parâmetros Globais</h3>
      <div class="fg">
        <label for="cfg-alunos">Alunos por turma (padrão)</label>
        <input type="number" id="cfg-alunos" min="1" value="45">
        <div class="hint">Usado quando a turma não define valor próprio</div>
      </div>
      <div class="fg">
        <label for="cfg-cap-lab">Capacidade padrão dos laboratórios</label>
        <input type="number" id="cfg-cap-lab" min="1" value="40">
        <div class="hint">Turmas maiores geram split A+B no laboratório</div>
      </div>
      <div class="fg">
        <label for="cfg-criticos">Horários críticos (separados por vírgula)</label>
        <input type="text" id="cfg-criticos" value="M1,T3">
        <div class="hint">Blocos com compensação especial na função objetivo</div>
      </div>
      <div class="fg">
        <label for="cfg-tempo">Limite de tempo do solver (segundos)</label>
        <input type="number" id="cfg-tempo" min="10" max="600" value="120">
      </div>
      <div class="fg">
        <label for="cfg-carga-max">Carga máxima por professor (horas/semestre)</label>
        <input type="number" id="cfg-carga-max" min="0" step="30" value="180">
        <div class="hint">Limite de referência. Acima dele, o professor é sinalizado no resumo e no relatório (ex.: 180h ≈ 3 disciplinas de 60h)</div>
      </div>

      <div style="height:1px;background:var(--c-border-subtle);margin:6px 0 16px"></div>
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:var(--c-text);letter-spacing:-.01em">Período Letivo</h3>
      <div class="frow">
        <div class="fg">
          <label for="cfg-ano">Ano letivo</label>
          <input type="number" id="cfg-ano" min="2000" max="2100" step="1" value="2026">
        </div>
        <div class="fg">
          <label for="cfg-semestre">Semestre</label>
          <select id="cfg-semestre">
            <option value="1">1º (primeiro semestre)</option>
            <option value="2">2º (segundo semestre)</option>
          </select>
        </div>
      </div>
      <div class="hint" id="cfg-periodo-label" style="margin:-6px 0 12px;font-weight:600;color:var(--c-accent-text)">Período letivo: 2026/1</div>
      <div class="frow">
        <div class="fg">
          <label for="cfg-data-ini">Início do período</label>
          <input type="date" id="cfg-data-ini">
        </div>
        <div class="fg">
          <label for="cfg-data-fim">Fim do período</label>
          <input type="date" id="cfg-data-fim">
        </div>
      </div>
      <div class="hint" style="margin:-4px 0 14px">Usados na tabela exportável (Excel), nas colunas de data de cada aula</div>

      <button class="btn btn-primary" data-action="salvar-config">Salvar configurações</button>
    </div>
  </div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (el && el.dataset.action === 'salvar-config') salvarConfig();
}

function onChange(e) {
  if (e.target.id === 'cfg-ano' || e.target.id === 'cfg-semestre') atuLabelPeriodo();
}

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('input', onChange);
  // preenche com os valores atuais do cenário
  $('cfg-alunos').value    = S.config.alunosPorTurma;
  $('cfg-cap-lab').value   = S.config.capacidadeLabPadrao;
  $('cfg-criticos').value  = (S.config.horariosCriticos || []).join(',');
  $('cfg-tempo').value     = S.config.tempoSolver || 120;
  $('cfg-carga-max').value = S.config.cargaMaxProfessor ?? 180;
  $('cfg-ano').value       = S.config.anoLetivo || new Date().getFullYear();
  $('cfg-semestre').value  = String(S.config.semestreLetivo || 1);
  $('cfg-data-ini').value  = S.config.dataInicioPeriodo || '';
  $('cfg-data-fim').value  = S.config.dataFimPeriodo || '';
  atuLabelPeriodo();
}
