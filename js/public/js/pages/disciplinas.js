// pages/disciplinas.js — cadastro de disciplinas e suas turmas

import { S, turmasAtivas, migrarDisciplina, nomesGrupos, autoSave, updateTabBadges } from '../state.js';
import { hToB, escAttr, toast, lerArquivoJSON } from '../util.js';

let host = null;
let editIdx = null;       // null = nova disciplina; senão índice em S.disciplinas
let editTurmas = [];      // turmas em edição (clone)

const $ = id => document.getElementById(id);

function novaTurma() {
  return { turma: '', alunos: S.config.alunosPorTurma, professorId: '', situacao: 'Ativa', necessidadesEspeciais: false, observacao: '' };
}

function profOptionsHTML(selectedId) {
  return '<option value="">— Auto (round-robin) —</option>' +
    S.professores.map(p => `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${p.nome} (${p.unidade})</option>`).join('');
}

function renderTurmasEditor() {
  $('tbody-turmas').innerHTML = (editTurmas || []).map((t, i) => `
    <tr>
      <td><input style="width:70px" value="${escAttr(t.turma)}" placeholder="ex: S" data-tfield="turma" data-tidx="${i}"></td>
      <td><input type="number" style="width:70px" min="1" value="${t.alunos ?? S.config.alunosPorTurma}" data-tfield="alunos" data-tidx="${i}"></td>
      <td><select data-tfield="professorId" data-tidx="${i}">${profOptionsHTML(t.professorId)}</select></td>
      <td><select data-tfield="situacao" data-tidx="${i}">
        <option${t.situacao !== 'Inativa' ? ' selected' : ''}>Ativa</option>
        <option${t.situacao === 'Inativa' ? ' selected' : ''}>Inativa</option>
      </select></td>
      <td style="text-align:center"><input type="checkbox" ${t.necessidadesEspeciais ? 'checked' : ''} data-tfield="necessidadesEspeciais" data-tidx="${i}"></td>
      <td><input style="width:140px" value="${escAttr(t.observacao)}" placeholder="opcional" data-tfield="observacao" data-tidx="${i}"></td>
      <td><button class="btn btn-del btn-sm btn-icon" type="button" data-action="remove-turma" data-idx="${i}" aria-label="Remover turma">🗑</button></td>
    </tr>`).join('') || '<tr class="empty"><td colspan="7">Nenhuma turma — adicione ao menos uma.</td></tr>';
}

function atuDatalistGrupos() {
  const gs = nomesGrupos();
  const sel = $('filtro-grupo'), cur = sel.value;
  sel.innerHTML = '<option value="">Todas as áreas</option>' +
    gs.map(g => `<option${g === cur ? ' selected' : ''}>${g}</option>`).join('');
}

// checkboxes de área (etiquetas) no editor de disciplina
function renderGruposCheckboxes(selecionados) {
  const sel = new Set(selecionados || []);
  const gs = nomesGrupos();
  const cont = $('di-grupos');
  cont.innerHTML = gs.length
    ? gs.map(g => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--c-body);cursor:pointer;text-transform:none;font-weight:400;letter-spacing:0">
        <input type="checkbox" style="width:auto;margin:0" value="${escAttr(g)}" ${sel.has(g) ? 'checked' : ''} data-grupo>${g}
      </label>`).join('')
    : '<span style="font-size:12px;color:var(--c-faint)">Nenhuma área cadastrada — crie uma abaixo.</span>';
}
function gruposSelecionados() {
  return [...$('di-grupos').querySelectorAll('input[data-grupo]:checked')].map(i => i.value);
}
function addGrupoInline() {
  const inp = $('di-grupo-novo');
  const nome = inp.value.trim();
  if (!nome) return;
  if (!S.grupos.includes(nome)) { S.grupos.push(nome); S.grupos.sort(); atuDatalistGrupos(); }
  const atuais = new Set(gruposSelecionados()); atuais.add(nome);
  renderGruposCheckboxes([...atuais]);
  inp.value = '';
}

function renderList() {
  const filtro = $('filtro-grupo').value;
  const lista  = filtro ? S.disciplinas.filter(d => (d.grupos || []).includes(filtro)) : S.disciplinas;
  $('disc-count').textContent = `${lista.length} disciplina(s)${filtro ? ` · área "${filtro}"` : ''}`;
  const tbody = $('tbody-disc');
  if (!lista.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="9">Nenhuma disciplina cadastrada.<br><small>Clique em <strong>+ Nova Disciplina</strong> ou importe um JSON para começar.</small></td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(d => {
    const ri   = S.disciplinas.indexOf(d);
    const tB   = hToB(d.t_horas), pB = hToB(d.p_horas);
    const turmas = d.turmas || [];
    const ativas = turmasAtivas(d);
    const split  = pB > 0 && d.permiteDobra !== false && turmas.some(t => (t.alunos ?? S.config.alunosPorTurma) > S.config.capacidadeLabPadrao);
    const turmaBadges = turmas.map(t =>
      `<span class="badge ${t.situacao === 'Inativa' ? 'b-grey' : 'b-blue'}" title="${t.situacao === 'Inativa' ? 'Inativa' : 'Ativa'}">${t.turma || '?'}</span>`
    ).join(' ') || '<span style="color:var(--c-faint)">—</span>';
    return `<tr>
      <td style="font-family:ui-monospace,'Roboto Mono',monospace;font-size:11px;color:var(--c-muted)">${d.id}</td>
      <td style="font-weight:500">${d.nome}</td>
      <td style="text-align:center;color:var(--c-muted)">${d.periodo}º</td>
      <td>${(d.grupos || []).length ? (d.grupos.map(g => `<span class="badge b-blue">${g}</span>`).join(' ')) : '<span style="color:var(--c-faint)">—</span>'}</td>
      <td style="text-align:center">${d.t_horas}h <span style="color:var(--c-faint);font-size:11px">${tB}b</span></td>
      <td style="text-align:center">${pB ? `${d.p_horas}h <span style="color:var(--c-faint);font-size:11px">${pB}b</span>${split ? ' <span class="badge b-red">✂ A+B</span>' : ''}` : '<span style="color:var(--c-faint)">—</span>'}</td>
      <td>${pB ? `<span class="badge b-yellow">${d.lab || 'Lab'}</span>` : '<span style="color:var(--c-faint)">—</span>'}</td>
      <td style="font-size:12px">${turmaBadges} <span style="color:var(--c-muted)">${ativas.length}/${turmas.length} ativa${turmas.length !== 1 ? 's' : ''}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit-disc" data-idx="${ri}" aria-label="Editar ${d.id}">✏</button>
        <button class="btn btn-del       btn-sm btn-icon" data-action="del-disc"  data-idx="${ri}" aria-label="Remover ${d.id}">🗑</button>
      </td></tr>`;
  }).join('');
}

function abrirPanel() {
  $('panel-disc').classList.remove('hidden');
  $('layout-disc').classList.remove('full');
}
function fecharPanel() {
  $('panel-disc').classList.add('hidden');
  $('layout-disc').classList.add('full');
}

function atuBlocos() {
  const t = +$('di-t').value || 0;
  const p = +$('di-p').value || 0;
  $('di-t-bl').textContent = `${hToB(t)} bloco(s)/sem`;
  $('di-p-bl').textContent = `${hToB(p)} bloco(s)/sem`;
  $('di-lab-wrap').style.display = p > 0 ? '' : 'none';
}
function onLabChange() {
  $('di-lab-custom').style.display = $('di-lab').value === '__outro__' ? '' : 'none';
}

function novaDisc() {
  editIdx = null;
  $('panel-disc-h').textContent = 'Nova Disciplina';
  ['di-id', 'di-nome'].forEach(id => $(id).value = '');
  $('di-unidade').value = 'FACOM';
  $('di-grupo-novo').value = '';
  renderGruposCheckboxes([]);
  $('di-periodo').value = '1';
  $('di-t').value = 60;
  $('di-p').value = 0;
  $('di-lab').value = 'Lab';
  $('di-lab-custom').style.display = 'none';
  $('di-lab-wrap').style.display = 'none';
  $('di-permite-dobra').checked = true;
  editTurmas = [{ ...novaTurma(), turma: 'S' }];
  renderTurmasEditor();
  atuBlocos();
  abrirPanel();
  setTimeout(() => $('di-id').focus(), 50);
}

function editDisc(idx) {
  editIdx = idx;
  const d = S.disciplinas[idx];
  $('panel-disc-h').textContent = `Editar: ${d.id}`;
  $('di-id').value = d.id;
  $('di-nome').value = d.nome;
  $('di-unidade').value = d.unidade || 'FACOM';
  $('di-grupo-novo').value = '';
  renderGruposCheckboxes(d.grupos || []);
  $('di-periodo').value = d.periodo;
  $('di-t').value = d.t_horas;
  $('di-p').value = d.p_horas;
  const known = ['Lab', 'Lab_Sistemas_Digitais'];
  if (known.includes(d.lab)) {
    $('di-lab').value = d.lab;
    $('di-lab-custom').style.display = 'none';
  } else {
    $('di-lab').value = '__outro__';
    $('di-lab-custom').style.display = '';
    $('di-lab-custom').value = d.lab || '';
  }
  $('di-lab-wrap').style.display = hToB(d.p_horas) > 0 ? '' : 'none';
  $('di-permite-dobra').checked = d.permiteDobra !== false;
  editTurmas = (d.turmas || []).map(t => ({ ...t }));
  if (!editTurmas.length) editTurmas = [{ ...novaTurma(), turma: 'S' }];
  renderTurmasEditor();
  atuBlocos();
  abrirPanel();
}

function salvarDisc() {
  const id = $('di-id').value.trim();
  const nome = $('di-nome').value.trim();
  if (!id || !nome) { toast('Código e Nome são obrigatórios', 'err'); return; }
  const turmas = (editTurmas || []).map(t => ({ ...t, turma: (t.turma || '').trim() }));
  if (!turmas.length) { toast('Cadastre ao menos uma turma', 'err'); return; }
  if (turmas.some(t => !t.turma)) { toast('Todas as turmas precisam de um código', 'err'); return; }
  const codigos = turmas.map(t => t.turma);
  if (new Set(codigos).size !== codigos.length) { toast('Códigos de turma devem ser únicos dentro da disciplina', 'err'); return; }
  const labSel = $('di-lab').value;
  const lab = labSel === '__outro__' ? ($('di-lab-custom').value.trim() || 'Lab') : labSel;
  const grupos = gruposSelecionados();
  const disc = {
    id, nome,
    unidade:  $('di-unidade').value,
    grupos,
    periodo: +$('di-periodo').value,
    t_horas: +$('di-t').value || 0,
    p_horas: +$('di-p').value || 0,
    lab,
    permiteDobra: $('di-permite-dobra').checked,
    turmas,
  };
  if (editIdx === null) S.disciplinas.push(disc);
  else S.disciplinas[editIdx] = disc;
  renderList(); updateTabBadges(); fecharPanel();
  toast(`Disciplina "${id}" salva`, 'ok'); autoSave();
}

function delDisc(i) {
  if (!confirm(`Remover "${S.disciplinas[i].id}"?`)) return;
  S.disciplinas.splice(i, 1);
  renderList(); updateTabBadges(); autoSave();
}

function onImportDisc(ev) {
  lerArquivoJSON(ev, data => {
    const lista = Array.isArray(data) ? data : (data.disciplinas || []);
    if (!lista.length) { toast('Nenhuma disciplina encontrada no JSON', 'err'); return; }
    lista.forEach(migrarDisciplina);   // garante turmas[] e grupos[]
    lista.forEach(d => (d.grupos || []).forEach(g => { if (!S.grupos.includes(g)) S.grupos.push(g); }));
    S.grupos.sort();
    S.disciplinas = lista;
    atuDatalistGrupos(); renderList(); updateTabBadges();
    toast(`${lista.length} disciplinas importadas`, 'ok'); autoSave();
  });
}

// ── Markup + wiring ─────────────────────────────────────────────────────────
function markup() {
  return `
  <div class="toolbar">
    <button class="btn btn-primary"   data-action="nova-disc">+ Nova Disciplina</button>
    <button class="btn btn-secondary" data-action="import-disc">Importar JSON</button>
    <input type="file" id="file-disc" accept=".json" style="display:none">
    <select id="filtro-grupo" class="filter-select" aria-label="Filtrar por área">
      <option value="">Todas as áreas</option>
    </select>
    <span id="disc-count" class="toolbar-count"></span>
  </div>
  <div class="split full" id="layout-disc">
    <div class="card">
      <table class="dt" aria-label="Lista de disciplinas">
        <thead><tr>
          <th scope="col">Código</th><th scope="col">Nome</th><th scope="col">Per.</th>
          <th scope="col">Áreas</th><th scope="col">T (h)</th><th scope="col">P (h)</th>
          <th scope="col">Lab</th><th scope="col">Turmas</th><th scope="col"></th>
        </tr></thead>
        <tbody id="tbody-disc"></tbody>
      </table>
    </div>
    <div class="panel hidden" id="panel-disc" role="region" aria-label="Editar disciplina">
      <h3 id="panel-disc-h">Nova Disciplina</h3>
      <div class="frow">
        <div class="fg">
          <label for="di-id">Código</label>
          <input id="di-id" placeholder="ex: GBC014">
        </div>
        <div class="fg">
          <label for="di-periodo">Período</label>
          <select id="di-periodo">
            <option>1</option><option>2</option><option>3</option><option>4</option>
            <option>5</option><option>6</option><option>7</option><option>8</option>
          </select>
        </div>
      </div>
      <div class="fg">
        <label for="di-nome">Nome</label>
        <input id="di-nome" placeholder="Nome completo da disciplina">
      </div>
      <div class="fg">
        <label for="di-unidade">Unidade</label>
        <select id="di-unidade" style="max-width:200px"><option>FACOM</option><option>FAMAT</option></select>
      </div>
      <div class="fg">
        <label>Áreas (etiquetas) <span class="label-note">a disciplina pode ter várias</span></label>
        <div id="di-grupos" style="display:flex;flex-wrap:wrap;gap:6px 14px"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input id="di-grupo-novo" placeholder="Nova área…" style="flex:1">
          <button class="btn btn-secondary btn-sm" type="button" data-action="add-grupo-inline">+ Área</button>
        </div>
      </div>
      <div class="frow">
        <div class="fg">
          <label for="di-t">Carga Teórica (horas)</label>
          <input type="number" id="di-t" min="0" step="15" value="60">
          <div class="hint" id="di-t-bl">2 blocos/sem</div>
        </div>
        <div class="fg">
          <label for="di-p">Carga Prática (horas)</label>
          <input type="number" id="di-p" min="0" step="15" value="0">
          <div class="hint" id="di-p-bl">0 blocos/sem</div>
        </div>
      </div>
      <div class="fg" id="di-lab-wrap" style="display:none">
        <label for="di-lab">Tipo de Laboratório</label>
        <select id="di-lab">
          <option value="Lab">Lab (Computação)</option>
          <option value="Lab_Sistemas_Digitais">Lab Sistemas Digitais</option>
          <option value="__outro__">Outro (personalizado)…</option>
        </select>
        <input id="di-lab-custom" style="display:none;margin-top:6px" placeholder="Nome do tipo de laboratório">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:12px;color:var(--c-body);margin-top:10px;letter-spacing:0;cursor:pointer">
          <input type="checkbox" id="di-permite-dobra" style="width:auto;margin:0">
          Permitir dobra de turma (A/B) ao exceder a capacidade do lab
        </label>
        <div class="hint">Desmarque para disciplinas de carga fixa que não devem dobrar — a prática nunca será dividida e a carga do professor não infla</div>
      </div>
      <div class="fg">
        <label style="display:flex;align-items:center;justify-content:space-between">
          <span>Turmas <span class="label-note">cada turma tem professor, vagas e situação próprios</span></span>
          <button class="btn btn-secondary btn-sm" type="button" data-action="add-turma">+ Adicionar turma</button>
        </label>
        <div style="overflow-x:auto">
          <table class="dt" style="margin-top:6px" aria-label="Turmas da disciplina">
            <thead><tr>
              <th scope="col">Turma</th><th scope="col">Vagas Ofert.</th><th scope="col">Professor</th>
              <th scope="col">Situação</th><th scope="col">Nec. especiais</th><th scope="col">Observação</th><th scope="col"></th>
            </tr></thead>
            <tbody id="tbody-turmas"></tbody>
          </table>
        </div>
        <div class="hint">Vagas Ofertadas acima da capacidade do lab (padrão: 40) gera split A+B na turma</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-primary" style="flex:1" data-action="salvar-disc">Salvar</button>
        <button class="btn btn-secondary" data-action="fechar-disc" aria-label="Fechar painel">✕</button>
      </div>
    </div>
  </div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const idx = el.dataset.idx !== undefined ? +el.dataset.idx : null;
  switch (el.dataset.action) {
    case 'nova-disc':    novaDisc(); break;
    case 'import-disc':  $('file-disc').click(); break;
    case 'add-turma':    editTurmas.push(novaTurma()); renderTurmasEditor(); break;
    case 'remove-turma': editTurmas.splice(idx, 1); renderTurmasEditor(); break;
    case 'salvar-disc':  salvarDisc(); break;
    case 'fechar-disc':  fecharPanel(); break;
    case 'edit-disc':    editDisc(idx); break;
    case 'del-disc':     delDisc(idx); break;
    case 'add-grupo-inline': addGrupoInline(); break;
  }
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'di-t' || t.id === 'di-p') { atuBlocos(); return; }
  if (t.dataset.tfield) updateTurmaField(t);
}

function onKey(e) {
  if (e.target.id === 'di-grupo-novo' && e.key === 'Enter') { e.preventDefault(); addGrupoInline(); }
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'filtro-grupo') { renderList(); return; }
  if (t.id === 'di-lab')       { onLabChange(); return; }
  if (t.id === 'file-disc')    { onImportDisc(e); return; }
  if (t.dataset.tfield)        updateTurmaField(t);
}

function updateTurmaField(t) {
  const i = +t.dataset.tidx, f = t.dataset.tfield;
  if (f === 'alunos') editTurmas[i].alunos = +t.value || S.config.alunosPorTurma;
  else if (f === 'professorId') editTurmas[i].professorId = t.value || null;
  else if (f === 'necessidadesEspeciais') editTurmas[i].necessidadesEspeciais = t.checked;
  else editTurmas[i][f] = t.value;
}

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKey);
  atuDatalistGrupos();
  renderList();
}
