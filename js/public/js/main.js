// main.js — casca: navegação entre páginas, ações do cabeçalho e carga inicial

import { carregarCenario, salvarCenario, updateTabBadges } from './state.js';
import { toast } from './util.js';
import { imprimirCenario } from './print.js';
import * as disciplinas from './pages/disciplinas.js';
import * as professores from './pages/professores.js';
import * as salas from './pages/salas.js';
import * as areas from './pages/areas.js';
import * as config from './pages/config.js';
import * as otimizar from './pages/otimizar.js';

const PAGES = { disciplinas, professores, salas, areas, config, otimizar };
const app = document.getElementById('app');

// Mostra uma página. Cada troca cria um elemento novo para a página, então os
// listeners da página anterior são descartados junto com o elemento antigo.
function show(name) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const active = b.id === `btn-${name}`;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  app.innerHTML = '';
  const wrap = document.createElement('section');
  wrap.className = 'tab-content';
  wrap.setAttribute('role', 'tabpanel');
  app.appendChild(wrap);
  PAGES[name].render(wrap);
}

function wireShell() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => show(b.id.replace('btn-', '')));
  });
  document.getElementById('btn-salvar-cenario').addEventListener('click', () => {
    salvarCenario();
    toast('Cenário salvo', 'ok');
  });
  document.getElementById('btn-imprimir-cenario').addEventListener('click', () => {
    const ok = imprimirCenario();
    if (!ok) toast('O navegador bloqueou a janela de impressão — permita pop-ups deste site', 'err');
  });
  document.getElementById('btn-ir-otimizar').addEventListener('click', () => show('otimizar'));
}

async function init() {
  wireShell();
  await carregarCenario();
  updateTabBadges();
  show('disciplinas');
}

init();
