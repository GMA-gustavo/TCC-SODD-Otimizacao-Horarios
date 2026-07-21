// pages/salas.js — cadastro de salas e laboratórios

import { S, autoSave, updateTabBadges } from '../state.js';
import { toast, escAttr } from '../util.js';

let host = null;
let editSalaIdx = null;   // null = nova sala; senão índice em S.salas

const $ = id => document.getElementById(id);

function renderList() {
  const tbody = $('tbody-sala');
  if (!S.salas.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">Nenhuma sala cadastrada.<br><small>Clique em <strong>Gerar padrão UFU</strong> para criar a configuração padrão (10 salas + 4 labs).</small></td></tr>';
    return;
  }
  tbody.innerHTML = S.salas.map((s, i) =>
    `<tr>
      <td style="font-family:ui-monospace,monospace;font-weight:500">${s.id}</td>
      <td><span class="badge ${s.tipo === 'Normal' ? 'b-blue' : 'b-yellow'}">${s.tipo}</span></td>
      <td style="text-align:center;color:var(--c-muted)">${s.capacidade}</td>
      <td style="color:var(--c-muted)">${s.bloco ? escAttr(s.bloco) : '<span style="color:var(--c-faint)">—</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit-sala" data-idx="${i}" aria-label="Editar ${s.id}">✏</button>
        <button class="btn btn-del       btn-sm btn-icon" data-action="del-sala"  data-idx="${i}" aria-label="Remover ${s.id}">🗑</button>
      </td></tr>`
  ).join('');
}

function abrirPanel() {
  $('panel-sala').classList.remove('hidden');
  $('layout-sala').classList.remove('full');
}
function fecharPanel() {
  $('panel-sala').classList.add('hidden');
  $('layout-sala').classList.add('full');
}

function novaSala() {
  editSalaIdx = null;
  $('panel-sala-h').textContent = 'Nova Sala';
  const normais = S.salas.filter(s => s.tipo === 'Normal').length;
  $('sl-id').value = `Sala_${String(normais + 1).padStart(2, '0')}`;
  $('sl-tipo').value = 'Normal';
  $('sl-tipo-custom').style.display = 'none';
  $('sl-cap').value = 60;
  $('sl-bloco').value = '';
  abrirPanel();
}

function editSala(idx) {
  editSalaIdx = idx;
  const s = S.salas[idx];
  $('panel-sala-h').textContent = `Editar: ${s.id}`;
  $('sl-id').value = s.id;
  $('sl-cap').value = s.capacidade;
  $('sl-bloco').value = s.bloco || '';
  const known = ['Normal', 'Lab', 'Lab_Sistemas_Digitais'];
  if (known.includes(s.tipo)) {
    $('sl-tipo').value = s.tipo;
    $('sl-tipo-custom').style.display = 'none';
  } else {
    $('sl-tipo').value = '__outro__';
    $('sl-tipo-custom').style.display = '';
    $('sl-tipo-custom').value = s.tipo;
  }
  abrirPanel();
}

function onSalaTipoChange() {
  $('sl-tipo-custom').style.display = $('sl-tipo').value === '__outro__' ? '' : 'none';
}

function salvarSala() {
  const id  = $('sl-id').value.trim();
  const cap = +$('sl-cap').value || 40;
  if (!id) { toast('ID é obrigatório', 'err'); return; }
  const tipoSel = $('sl-tipo').value;
  const tipo = tipoSel === '__outro__' ? ($('sl-tipo-custom').value.trim() || 'Lab') : tipoSel;
  const sala = { id, tipo, capacidade: cap, bloco: $('sl-bloco').value.trim() };
  if (editSalaIdx === null) S.salas.push(sala);
  else S.salas[editSalaIdx] = sala;
  renderList(); updateTabBadges(); fecharPanel();
  toast(`Sala "${id}" salva`, 'ok'); autoSave();
}

function delSala(i) {
  if (!confirm(`Remover "${S.salas[i].id}"?`)) return;
  S.salas.splice(i, 1);
  renderList(); updateTabBadges(); autoSave();
}

function gerarSalasUFU() {
  if (S.salas.length && !confirm('Substituir as salas atuais pelo padrão UFU?')) return;
  S.salas = [];
  for (let i = 1; i <= 10; i++)
    S.salas.push({ id: `Sala_${String(i).padStart(2, '0')}`, tipo: 'Normal', capacidade: 60, bloco: '' });
  for (let i = 1; i <= 3; i++)
    S.salas.push({ id: `Lab_Comp_${i}`, tipo: 'Lab', capacidade: 40, bloco: '' });
  S.salas.push({ id: 'Lab_Sist_Digitais', tipo: 'Lab_Sistemas_Digitais', capacidade: 40, bloco: '' });
  renderList(); updateTabBadges();
  toast('14 salas criadas: 10 normais + 3 labs computação + 1 lab SD', 'ok'); autoSave();
}

// ── Markup + wiring ─────────────────────────────────────────────────────────
function markup() {
  return `
  <div class="toolbar">
    <button class="btn btn-primary"   data-action="nova-sala">+ Nova Sala</button>
    <button class="btn btn-secondary" data-action="gerar-ufu">Gerar padrão UFU</button>
  </div>
  <div class="split full" id="layout-sala">
    <div class="card">
      <table class="dt" aria-label="Lista de salas">
        <thead><tr>
          <th scope="col">ID</th><th scope="col">Tipo</th><th scope="col">Capacidade</th><th scope="col">Bloco</th><th scope="col"></th>
        </tr></thead>
        <tbody id="tbody-sala"></tbody>
      </table>
    </div>
    <div class="panel hidden" id="panel-sala" role="region" aria-label="Editar sala">
      <h3 id="panel-sala-h">Nova Sala</h3>
      <div class="fg">
        <label for="sl-id">ID</label>
        <input id="sl-id" placeholder="ex: Sala_01 ou Lab_Comp_1">
      </div>
      <div class="fg">
        <label for="sl-tipo">Tipo</label>
        <select id="sl-tipo">
          <option value="Normal">Normal (sala de aula)</option>
          <option value="Lab">Lab (Computação)</option>
          <option value="Lab_Sistemas_Digitais">Lab Sistemas Digitais</option>
          <option value="__outro__">Outro tipo personalizado…</option>
        </select>
        <input id="sl-tipo-custom" style="display:none;margin-top:6px" placeholder="Nome do tipo de sala">
        <div class="hint">Deve corresponder ao campo "Lab" das disciplinas</div>
      </div>
      <div class="fg">
        <label for="sl-cap">Capacidade</label>
        <input type="number" id="sl-cap" min="1" value="40">
      </div>
      <div class="fg">
        <label for="sl-bloco">Bloco da UFU</label>
        <input id="sl-bloco" placeholder="ex: Bloco 1B">
        <div class="hint">Em qual bloco/prédio da UFU a sala fica</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-primary" style="flex:1" data-action="salvar-sala">Salvar</button>
        <button class="btn btn-secondary" data-action="fechar-sala" aria-label="Fechar painel">✕</button>
      </div>
    </div>
  </div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const idx = el.dataset.idx !== undefined ? +el.dataset.idx : null;
  switch (el.dataset.action) {
    case 'nova-sala':   novaSala(); break;
    case 'gerar-ufu':   gerarSalasUFU(); break;
    case 'salvar-sala': salvarSala(); break;
    case 'fechar-sala': fecharPanel(); break;
    case 'edit-sala':   editSala(idx); break;
    case 'del-sala':    delSala(idx); break;
  }
}

function onChange(e) {
  if (e.target.id === 'sl-tipo') onSalaTipoChange();
}

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  renderList();
}
