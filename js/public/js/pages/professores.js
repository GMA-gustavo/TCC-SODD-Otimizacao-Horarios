// pages/professores.js — cadastro de professores, preferências e indisponibilidades

import { S, nomesGrupos, autoSave, updateTabBadges } from '../state.js';
import { BLOCOS, DIAS, escAttr, toast, lerArquivoJSON } from '../util.js';

let host = null;
let editProfIdx = null;   // null = novo professor; senão índice em S.professores

const $ = id => document.getElementById(id);

function buildPrefGrid() {
  $('pref-grid').innerHTML = BLOCOS.map(b => `
    <div class="pref-cell">
      <span>${b}</span>
      <input type="number" id="pf-${b}" min="1" max="10" value="6" aria-label="Preferência ${b}">
    </div>`).join('');
}

function colorPref(b) {
  const inp = $(`pf-${b}`);
  const v = +inp.value || 6;
  inp.classList.remove('pref-low', 'pref-high');
  if (v <= 2) inp.classList.add('pref-low');
  else if (v >= 8) inp.classList.add('pref-high');
}

function buildIndispGrid() {
  $('indisp-grid').innerHTML =
    `<tr><th scope="col"></th>${DIAS.map(d => `<th scope="col">${d}</th>`).join('')}</tr>` +
    BLOCOS.map(b =>
      `<tr><th scope="row">${b}</th>${DIAS.map(d =>
        `<td class="${['M1', 'T3'].includes(b) ? 'critico' : ''}">
          <input type="checkbox" id="in-${d}-${b}" aria-label="${d} ${b}">
        </td>`).join('')}</tr>`
    ).join('');
}

// checkboxes das áreas preferidas do professor
function renderAreasPref(selecionadas) {
  const sel = new Set(selecionadas || []);
  const gs = nomesGrupos();
  $('pr-areas').innerHTML = gs.length
    ? gs.map(g => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--c-body);cursor:pointer;text-transform:none;font-weight:400;letter-spacing:0">
        <input type="checkbox" style="width:auto;margin:0" value="${escAttr(g)}" ${sel.has(g) ? 'checked' : ''} data-area-pref>${g}
      </label>`).join('')
    : '<span style="font-size:12px;color:var(--c-faint)">Nenhuma área cadastrada (crie na aba Áreas).</span>';
}
function areasPrefSelecionadas() {
  return [...$('pr-areas').querySelectorAll('input[data-area-pref]:checked')].map(i => i.value);
}

function renderList() {
  const tbody = $('tbody-prof');
  if (!S.professores.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="6">Nenhum professor cadastrado.<br><small>Use <strong>+ Novo Professor</strong> para cadastrar um a um, ou <strong>Importar JSON</strong> para carregar o quadro completo de uma vez.</small></td></tr>';
    return;
  }
  tbody.innerHTML = S.professores.map((p, i) => {
    const pr = p.preferencias || {};
    const prefStr = BLOCOS.map(b => {
      const v = pr[b] || 6;
      const cls = v <= 2 ? 'pref-lo' : v >= 8 ? 'pref-hi' : 'pref-md';
      return `<span class="${cls}">${b}:${v}</span>`;
    }).join(' ');
    const indisp = (p.indisponibilidades || [])
      .map(sl => `<span style="background:var(--c-warn-bg);color:var(--c-warn-text);padding:1px 5px;border-radius:4px;font-size:10px">${sl.dia}&nbsp;${sl.bloco}</span>`)
      .join(' ') || '<span style="color:var(--c-faint);font-size:11px">—</span>';
    return `<tr>
      <td style="font-family:ui-monospace,monospace;font-size:11px;color:var(--c-muted)">${p.id}</td>
      <td style="font-weight:500">${p.nome}</td>
      <td><span class="badge ${p.unidade === 'FACOM' ? 'b-blue' : 'b-green'}">${p.unidade}</span></td>
      <td style="line-height:2">${prefStr}</td>
      <td>${indisp}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit-prof" data-idx="${i}" aria-label="Editar ${p.nome}">✏</button>
        <button class="btn btn-del       btn-sm btn-icon" data-action="del-prof"  data-idx="${i}" aria-label="Remover ${p.nome}">🗑</button>
      </td></tr>`;
  }).join('');
}

function abrirPanel() {
  $('panel-prof').classList.remove('hidden');
  $('layout-prof').classList.remove('full');
}
function fecharPanel() {
  $('panel-prof').classList.add('hidden');
  $('layout-prof').classList.add('full');
}

function novoProf() {
  editProfIdx = null;
  $('panel-prof-h').textContent = 'Novo Professor';
  $('pr-id').value = '';
  $('pr-nome').value = '';
  $('pr-unidade').value = 'FACOM';
  BLOCOS.forEach(b => {
    const inp = $(`pf-${b}`);
    inp.value = b === 'M1' || b === 'T3' ? 2 : b === 'M2' || b === 'T2' ? 10 : 6;
    colorPref(b);
  });
  DIAS.forEach(d => BLOCOS.forEach(b => { $(`in-${d}-${b}`).checked = false; }));
  renderAreasPref([]);
  abrirPanel();
  setTimeout(() => $('pr-nome').focus(), 50);
}

function editProf(idx) {
  editProfIdx = idx;
  const p = S.professores[idx];
  $('panel-prof-h').textContent = `Editar: ${p.nome}`;
  $('pr-id').value = p.id;
  $('pr-nome').value = p.nome;
  $('pr-unidade').value = p.unidade || 'FACOM';
  const pr = p.preferencias || {};
  BLOCOS.forEach(b => { $(`pf-${b}`).value = pr[b] ?? 6; colorPref(b); });
  DIAS.forEach(d => BLOCOS.forEach(b => { $(`in-${d}-${b}`).checked = false; }));
  (p.indisponibilidades || []).forEach(sl => {
    const el = $(`in-${sl.dia}-${sl.bloco}`);
    if (el) el.checked = true;
  });
  renderAreasPref(p.areasPreferidas || []);
  abrirPanel();
}

function salvarProf() {
  const id   = $('pr-id').value.trim();
  const nome = $('pr-nome').value.trim();
  if (!id || !nome) { toast('SIAPE e Nome são obrigatórios', 'err'); return; }
  const prefs = {};
  BLOCOS.forEach(b => { prefs[b] = +$(`pf-${b}`).value || 6; });
  const indisp = [];
  DIAS.forEach(d => BLOCOS.forEach(b => {
    if ($(`in-${d}-${b}`).checked) indisp.push({ dia: d, bloco: b });
  }));
  const prof = { id, nome, unidade: $('pr-unidade').value, preferencias: prefs, indisponibilidades: indisp, areasPreferidas: areasPrefSelecionadas() };
  if (editProfIdx === null) S.professores.push(prof);
  else S.professores[editProfIdx] = prof;
  renderList(); updateTabBadges(); fecharPanel();
  toast(`Professor "${nome}" salvo`, 'ok'); autoSave();
}

function delProf(i) {
  if (!confirm(`Remover "${S.professores[i].nome}"?`)) return;
  S.professores.splice(i, 1);
  renderList(); updateTabBadges(); autoSave();
}

// Importa professores de um JSON: aceita um array direto ou { professores: [...] }.
// Campos ausentes recebem padrões, de modo que um arquivo mínimo
// ({ id, nome, unidade }) já seja utilizável.
const PREF_PADRAO = {
  FACOM: { M1: 2, M2: 10, M3: 6, T1: 6,  T2: 10, T3: 2 },
  FAMAT: { M1: 2, M2: 8,  M3: 6, T1: 10, T2: 8,  T3: 2 },
};

function onImportProf(ev) {
  lerArquivoJSON(ev, data => {
    const lista = Array.isArray(data) ? data : (data.professores || []);
    if (!lista.length) { toast('Nenhum professor encontrado no arquivo', 'err'); return; }

    const invalidos = lista.filter(p => !p || !p.id || !p.nome);
    if (invalidos.length) {
      toast(`${invalidos.length} registro(s) sem "id" ou "nome" — corrija o arquivo`, 'err');
      return;
    }

    S.professores = lista.map(p => {
      const unidade = p.unidade === 'FAMAT' ? 'FAMAT' : 'FACOM';
      return {
        id: String(p.id),
        nome: p.nome,
        unidade,
        preferencias: p.preferencias || PREF_PADRAO[unidade],
        indisponibilidades: Array.isArray(p.indisponibilidades) ? p.indisponibilidades : [],
        areasPreferidas: Array.isArray(p.areasPreferidas) ? p.areasPreferidas : [],
      };
    });
    renderList(); updateTabBadges();
    toast(`${S.professores.length} professores importados`, 'ok'); autoSave();
  });
}

// ── Markup + wiring ─────────────────────────────────────────────────────────
function markup() {
  return `
  <div class="toolbar">
    <button class="btn btn-primary"   data-action="novo-prof">+ Novo Professor</button>
    <button class="btn btn-secondary" data-action="import-prof">Importar JSON</button>
    <input type="file" id="file-prof" accept=".json" style="display:none">
  </div>
  <div class="split full" id="layout-prof">
    <div class="card">
      <table class="dt" aria-label="Lista de professores">
        <thead><tr>
          <th scope="col">SIAPE</th><th scope="col">Nome</th><th scope="col">Unidade</th>
          <th scope="col">Preferências</th><th scope="col">Indisponibilidades</th><th scope="col"></th>
        </tr></thead>
        <tbody id="tbody-prof"></tbody>
      </table>
    </div>
    <div class="panel hidden" id="panel-prof" role="region" aria-label="Editar professor">
      <h3 id="panel-prof-h">Novo Professor</h3>
      <div class="frow">
        <div class="fg">
          <label for="pr-id">SIAPE</label>
          <input id="pr-id" placeholder="ex: 1543824">
        </div>
        <div class="fg">
          <label for="pr-unidade">Unidade</label>
          <select id="pr-unidade"><option>FACOM</option><option>FAMAT</option></select>
        </div>
      </div>
      <div class="fg">
        <label for="pr-nome">Nome</label>
        <input id="pr-nome" placeholder="ex: Prof. João">
      </div>
      <div class="fg">
        <label>Preferências de Horário
          <span class="label-note">1 = evitar · 10 = preferido</span>
        </label>
        <div class="pref-grid" id="pref-grid"></div>
        <div class="hint" style="margin-top:5px">Manhã: M1 (07:10) M2 (08:50) M3 (10:40) &nbsp;·&nbsp; Tarde: T1 (13:10) T2 (14:50) T3 (16:50)</div>
      </div>
      <div class="fg">
        <label>Indisponibilidades
          <span class="label-note">marque os horários bloqueados</span>
        </label>
        <table class="indisp-tbl" id="indisp-grid" aria-label="Grade de indisponibilidades"></table>
        <div class="hint">Slots marcados nunca recebem alocação do solver</div>
      </div>
      <div class="fg">
        <label>Áreas preferidas
          <span class="label-note">o sistema prioriza dar ao professor disciplinas dessas áreas</span>
        </label>
        <div id="pr-areas" style="display:flex;flex-wrap:wrap;gap:6px 14px"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-primary" style="flex:1" data-action="salvar-prof">Salvar</button>
        <button class="btn btn-secondary" data-action="fechar-prof" aria-label="Fechar painel">✕</button>
      </div>
    </div>
  </div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const idx = el.dataset.idx !== undefined ? +el.dataset.idx : null;
  switch (el.dataset.action) {
    case 'novo-prof':    novoProf(); break;
    case 'import-prof':  $('file-prof').click(); break;
    case 'salvar-prof':  salvarProf(); break;
    case 'fechar-prof':  fecharPanel(); break;
    case 'edit-prof':    editProf(idx); break;
    case 'del-prof':     delProf(idx); break;
  }
}

function onInput(e) {
  if (e.target.id && e.target.id.startsWith('pf-')) colorPref(e.target.id.slice(3));
}

function onChange(e) {
  if (e.target.id === 'file-prof') onImportProf(e);
}

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onChange);
  buildPrefGrid();
  buildIndispGrid();
  renderList();
}
