// util.js — constantes e helpers compartilhados por todas as páginas

export const BLOCOS       = ['M1', 'M2', 'M3', 'T1', 'T2', 'T3'];
export const DIAS         = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
export const GRUPOS_ORDEM = ['algoritmos', 'bd', 'calculo', 'engenharia', 'estatistica',
  'fundamentos', 'hardware', 'ia', 'matematica', 'programacao', 'redes', 'sistemas', 'tcc', 'teoria'];
export const MAP_HORA     = { M1: '07:10', M2: '08:50', M3: '10:40', T1: '13:10', T2: '14:50', T3: '16:50' };
// fim de cada bloco (≈ 1h40 por bloco), usado na exportação da tabela
export const MAP_HORA_FIM = { M1: '08:50', M2: '10:30', M3: '12:20', T1: '14:50', T2: '16:30', T3: '18:30' };
export const BLOCOS_ALL = ['M1', 'M2', 'M3', 'T1', 'T2', 'T3'];
export const CRITICOS   = new Set(['M1', 'T3']);

// Converte horas semestrais em blocos semanais (~30h por bloco)
export const hToB = h => Math.max(0, Math.round(h / 30));

// Escapa texto para uso seguro dentro de um atributo HTML (value="...") ou texto
export const escAttr = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = `notif ${tipo}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Escapa um campo para CSV (separador ';'): aspas duplicadas + envolto se necessário
export function csvCampo(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Gera e baixa um arquivo CSV (separador ';', BOM UTF-8 p/ Excel pt-BR abrir com acentos)
export function baixarCSV(nomeArquivo, linhas) {
  const conteudo = '﻿' + linhas.map(l => l.map(csvCampo).join(';')).join('\r\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nomeArquivo; a.click();
}

// Lê um arquivo .json escolhido em um <input type="file"> e chama cb(dados)
export function lerArquivoJSON(ev, cb) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { try { cb(JSON.parse(e.target.result)); } catch { toast('Arquivo JSON inválido', 'err'); } };
  reader.readAsText(file);
  ev.target.value = '';
}
