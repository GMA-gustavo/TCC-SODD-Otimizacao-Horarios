// pages/areas.js — áreas como etiquetas; uma disciplina pode ter várias áreas

import { S, autoSave } from '../state.js';
import { escAttr, toast } from '../util.js';

let host = null;
const $ = id => document.getElementById(id);

const temArea   = (d, g) => (d.grupos || []).includes(g);
const discsDoGrupo = g => S.disciplinas.filter(d => temArea(d, g));
const semArea   = () => S.disciplinas.filter(d => !(d.grupos || []).length);

// tabela das disciplinas de uma área (com botão de remover a etiqueta desta área)
function tabelaDiscs(discs, area) {
  if (!discs.length) return '<p style="font-size:12px;color:var(--c-faint);margin:4px 0 0">Nenhuma disciplina nesta área.</p>';
  const rows = discs.slice().sort((a, b) => a.periodo - b.periodo || a.id.localeCompare(b.id)).map(d => `<tr>
      <td style="font-family:ui-monospace,monospace;font-size:11px;color:var(--c-muted)">${d.id}</td>
      <td style="font-weight:500">${d.nome}</td>
      <td style="text-align:center;color:var(--c-muted)">${d.periodo}º</td>
      <td>${(d.grupos || []).length > 1 ? `<span style="font-size:11px;color:var(--c-faint)">+${d.grupos.length - 1} área(s)</span>` : ''}</td>
      <td><button class="btn btn-del btn-sm btn-icon" data-action="untag-disc" data-disc="${escAttr(d.id)}" data-area="${escAttr(area)}" title="Remover desta área">✕</button></td>
    </tr>`).join('');
  return `<table class="dt" style="margin-top:4px">
    <thead><tr><th>Código</th><th>Disciplina</th><th>Per.</th><th></th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// select para adicionar uma disciplina (ainda não etiquetada) à área
function selectAddDisc(area) {
  const fora = S.disciplinas.filter(d => !temArea(d, area));
  if (!fora.length) return '';
  return `<select data-action="tag-disc" data-area="${escAttr(area)}" style="margin-top:8px;padding:4px 8px;font-size:12px;border:1px solid var(--c-border);border-radius:5px;background:var(--c-surface)">
    <option value="">＋ adicionar disciplina a esta área…</option>
    ${fora.slice().sort((a, b) => a.id.localeCompare(b.id)).map(d => `<option value="${escAttr(d.id)}">${d.id} — ${d.nome}</option>`).join('')}
  </select>`;
}

function cardGrupo(g) {
  const discs = discsDoGrupo(g);
  return `<div class="card" style="padding:16px 18px;margin-bottom:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <div>
        <span class="badge b-blue" style="font-size:12px">${g}</span>
        <span style="color:var(--c-muted);font-size:12px;margin-left:6px">${discs.length} disciplina(s)</span>
      </div>
      <div style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-action="rename-area" data-area="${escAttr(g)}">✏ Renomear</button>
        <button class="btn btn-del       btn-sm" data-action="remove-area" data-area="${escAttr(g)}">🗑 Remover</button>
      </div>
    </div>
    <div style="overflow-x:auto">${tabelaDiscs(discs, g)}</div>
    ${selectAddDisc(g)}
  </div>`;
}

// select para adicionar uma disciplina "sem área" a alguma área existente
function selectAtribuirArea(disc) {
  const opts = S.grupos.filter(g => !temArea(disc, g));
  if (!opts.length) return '<span style="font-size:11px;color:var(--c-faint)">—</span>';
  return `<select data-action="tag-disc-de" data-disc="${escAttr(disc.id)}" style="padding:3px 6px;font-size:11px;border:1px solid var(--c-border);border-radius:5px;background:var(--c-surface)">
    <option value="">adicionar a…</option>
    ${opts.map(g => `<option value="${escAttr(g)}">${g}</option>`).join('')}
  </select>`;
}

function renderLista() {
  const cards = S.grupos.map(cardGrupo).join('');
  const sem = semArea();
  const cardSem = sem.length ? `<div class="card" style="padding:16px 18px;margin-bottom:12px;border-color:var(--c-warn-bg)">
    <div style="margin-bottom:8px">
      <span class="badge b-grey" style="font-size:12px">Sem área</span>
      <span style="color:var(--c-muted);font-size:12px;margin-left:6px">${sem.length} disciplina(s) sem nenhuma área</span>
    </div>
    <div style="overflow-x:auto"><table class="dt" style="margin-top:4px">
      <thead><tr><th>Código</th><th>Disciplina</th><th>Per.</th><th>Adicionar à área</th></tr></thead>
      <tbody>${sem.slice().sort((a, b) => a.periodo - b.periodo || a.id.localeCompare(b.id)).map(d => `<tr>
        <td style="font-family:ui-monospace,monospace;font-size:11px;color:var(--c-muted)">${d.id}</td>
        <td style="font-weight:500">${d.nome}</td>
        <td style="text-align:center;color:var(--c-muted)">${d.periodo}º</td>
        <td>${selectAtribuirArea(d)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : '';
  $('area-count').textContent = `${S.grupos.length} área(s) · ${S.disciplinas.length} disciplina(s)`;
  $('areas-lista').innerHTML = (cards + cardSem) ||
    '<div class="card" style="padding:24px;text-align:center;color:var(--c-faint)">Nenhuma área cadastrada. Adicione uma acima.</div>';
}

// ── Ações ────────────────────────────────────────────────────────────────────
function addArea() {
  const inp = $('area-nova');
  const nome = inp.value.trim();
  if (!nome) { toast('Digite um nome para a área', 'err'); return; }
  if (S.grupos.includes(nome)) { toast('Essa área já existe', 'err'); return; }
  S.grupos.push(nome); S.grupos.sort();
  inp.value = '';
  renderLista(); autoSave();
  toast(`Área "${nome}" adicionada`, 'ok');
}

function renameArea(antigo) {
  const novo = (prompt(`Renomear a área "${antigo}" para:`, antigo) || '').trim();
  if (!novo || novo === antigo) return;
  // atualiza a etiqueta em todas as disciplinas (evitando duplicar se já tiverem a nova)
  S.disciplinas.forEach(d => {
    if (temArea(d, antigo)) d.grupos = [...new Set(d.grupos.map(g => g === antigo ? novo : g))];
  });
  S.grupos = S.grupos.filter(g => g !== antigo);
  if (!S.grupos.includes(novo)) S.grupos.push(novo);
  S.grupos.sort();
  renderLista(); autoSave();
  toast(`Área renomeada para "${novo}"`, 'ok');
}

function removeArea(g) {
  const n = discsDoGrupo(g).length;
  if (n && !confirm(`A área "${g}" está em ${n} disciplina(s). A etiqueta será removida delas. Remover a área?`)) return;
  S.disciplinas.forEach(d => { if (temArea(d, g)) d.grupos = d.grupos.filter(x => x !== g); });
  S.grupos = S.grupos.filter(x => x !== g);
  renderLista(); autoSave();
  toast(`Área "${g}" removida`, 'ok');
}

function tagDisc(discId, area) {
  const d = S.disciplinas.find(x => x.id === discId);
  if (!d || !area) return;
  d.grupos = d.grupos || [];
  if (!d.grupos.includes(area)) d.grupos.push(area);
  renderLista(); autoSave();
}

function untagDisc(discId, area) {
  const d = S.disciplinas.find(x => x.id === discId);
  if (!d) return;
  d.grupos = (d.grupos || []).filter(g => g !== area);
  renderLista(); autoSave();
}

function markup() {
  return `
  <div class="toolbar">
    <input id="area-nova" class="filter-select" placeholder="Nome da nova área (ex: algoritmos)" style="min-width:220px">
    <button class="btn btn-primary" data-action="add-area">＋ Adicionar área</button>
    <span id="area-count" class="toolbar-count"></span>
  </div>
  <p style="font-size:12px;color:var(--c-muted);margin:0 0 14px">
    As áreas funcionam como etiquetas: uma mesma disciplina pode pertencer a várias áreas. Use os menus para adicionar disciplinas e o ✕ para remover a etiqueta de uma área.
  </p>
  <div id="areas-lista"></div>`;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'add-area':    addArea(); break;
    case 'rename-area': renameArea(el.dataset.area); break;
    case 'remove-area': removeArea(el.dataset.area); break;
    case 'untag-disc':  untagDisc(el.dataset.disc, el.dataset.area); break;
  }
}

function onChange(e) {
  const add = e.target.closest('[data-action="tag-disc"]');
  if (add && add.value) { tagDisc(add.value, add.dataset.area); return; }
  const addDe = e.target.closest('[data-action="tag-disc-de"]');
  if (addDe && addDe.value) tagDisc(addDe.dataset.disc, addDe.value);
}

function onKey(e) { if (e.target.id === 'area-nova' && e.key === 'Enter') addArea(); }

export function render(container) {
  host = container;
  host.innerHTML = markup();
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKey);
  renderLista();
}
