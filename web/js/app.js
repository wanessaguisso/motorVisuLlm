// Roteador do aplicativo (por hash) e barra de seções.

import { dados, carregarBiblioteca } from './dados.js';
import { h } from './ui.js';

const TELAS = {
  inicio: () => import('./telas/inicio.js'),
  cadastro: () => import('./telas/cadastro.js'),
  fichas: () => import('./telas/fichas.js'),
  ficha: () => import('./telas/fichas.js'),
  treino: () => import('./telas/treino.js'),
  relatorio: () => import('./telas/relatorio.js'),
  historico: () => import('./telas/historico.js'),
  perfil: () => import('./telas/perfil.js'),
  testes: () => import('./telas/testes.js'),
};

const ICONE = {
  inicio: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  fichas: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 5h6M9 12h6M9 16h4',
  historico: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
};
const ABAS = [['inicio', 'Início'], ['fichas', 'Fichas'], ['historico', 'Evolução'], ['perfil', 'Perfil']];

const main = document.getElementById('conteudo');
const abas = document.getElementById('abas');
let sair = null;

function desenharAbas(atual) {
  abas.replaceChildren(...ABAS.map(([rota, nome]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONE[rota]); svg.append(p);
    return h('a', { href: `#/${rota}`, 'aria-current': atual === rota || (rota === 'fichas' && atual === 'ficha') ? 'page' : null }, svg, nome);
  }));
}

async function navegar() {
  const [caminho, consulta = ''] = (location.hash || '#/inicio').split('?');
  const [, rota = 'inicio', param] = caminho.split('/');
  const d = dados();
  let nome = TELAS[rota] ? rota : 'inicio';
  // Perfil e triagem vêm antes de tudo (feitos uma vez).
  if (!d.perfil && nome !== 'cadastro') { location.replace('#/cadastro'); return; }
  if (sair) { try { await sair(); } catch { /* nada */ } sair = null; }
  const cheio = nome === 'treino';
  main.className = cheio ? 'cheio' : '';
  abas.hidden = cheio || nome === 'cadastro';
  if (!abas.hidden) desenharAbas(nome);
  main.replaceChildren(h('p', { class: 'suave' }, 'Carregando…'));
  try {
    const [modulo, biblioteca] = await Promise.all([TELAS[nome](), carregarBiblioteca()]);
    main.replaceChildren();
    sair = (await modulo.montar(main, { param: param ? decodeURIComponent(param) : null, biblioteca, rota: nome, consulta: new URLSearchParams(consulta) })) || null;
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'aviso erro' }, h('strong', {}, 'Não foi possível abrir esta tela. '), 'Verifique a conexão e tente de novo.'),
      h('a', { class: 'botao', href: '#/inicio' }, 'Voltar ao início'));
  }
  if (!cheio) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', navegar);
navegar();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !new URLSearchParams(location.search).has('semsw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
