// Início: começar a treinar em um toque e ver a constância (diretrizes do caso principal).

import { dados } from '../dados.js';
import { constancia, totais } from '../motor/relatorio.js';
import { sugerirProgressao } from '../motor/plano.js';
import { h, trocar, anexar, dataCurta, duracao } from '../ui.js';

export function montar(raiz, { biblioteca }) {
  const d = dados();
  const k = constancia(d.historico);
  // Próxima ficha: a seguinte à do último treino (divisão A, B, C).
  const ultimo = d.historico[d.historico.length - 1];
  const idx = ultimo ? d.fichas.findIndex((f) => f.id === ultimo.fichaId) : -1;
  const proxima = d.fichas.length ? d.fichas[(idx + 1) % d.fichas.length] : null;

  const saudacao = k.total === 0 ? 'Vamos fazer o primeiro treino?' : k.treinos_na_semana === 0 ? 'Que bom te ver de volta.' : `Você já treinou ${k.treinos_na_semana} ${k.treinos_na_semana === 1 ? 'vez' : 'vezes'} esta semana.`;
  anexar(raiz, h('h1', {}, saudacao), h('p', { class: 'suave' }, 'Treinar um pouco, com regularidade, vale mais do que treinar muito de vez em quando.'));

  if (d.perfil.parq?.risco) anexar(raiz, h('div', { class: 'aviso pequeno' }, 'Lembrete: sua triagem indicou buscar liberação médica antes de treinar.'));

  if (proxima) {
    const n = proxima.itens.length;
    const min = Math.round(proxima.itens.reduce((s, it) => s + it.series * (it.repeticoes * 4 + it.descanso_s), 0) / 60 + (proxima.aquecimento || []).length * 0.6);
    anexar(raiz, h('div', { class: 'cartao destaque' },
      h('div', { class: 'rotulo' }, 'Treino de hoje'),
      h('h2', { style: 'margin:2px 0 4px' }, proxima.nome),
      h('p', { class: 'suave' }, `${n} ${n === 1 ? 'exercício' : 'exercícios'} · cerca de ${min} min`),
      h('ul', { class: 'limpa pequeno suave', style: 'margin-bottom:14px' }, proxima.itens.map((it) => h('li', {}, `${biblioteca[it.exercicio]?.nome || it.exercicio} · ${it.series}×${it.repeticoes}`))),
      h('a', { class: 'botao primario largo', href: `#/treino/${proxima.id}` }, 'Começar treino'),
      d.fichas.length > 1 && h('p', { class: 'pequeno', style: 'margin:12px 0 0;text-align:center' }, h('a', { href: '#/fichas' }, 'Escolher outra ficha'))));
  } else {
    anexar(raiz, h('div', { class: 'cartao' }, h('p', {}, 'Você ainda não tem uma ficha de treino.'), h('a', { class: 'botao primario largo', href: '#/ficha/nova' }, 'Montar minha ficha')));
  }

  anexar(raiz, h('h2', {}, 'Sua constância'), h('div', { class: 'grade tres' },
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.treinos_na_semana), h('div', { class: 'rotulo' }, 'treinos nesta semana')),
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.treinos_em_30_dias), h('div', { class: 'rotulo' }, 'treinos em 30 dias')),
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.semanas_seguidas), h('div', { class: 'rotulo' }, 'semanas seguidas'))));

  const sugestoes = [...new Set(d.historico.flatMap((t) => t.series.map((s) => s.exercicioId)))].map((id) => sugerirProgressao(d.historico, id, biblioteca)).filter(Boolean);
  if (sugestoes.length) {
    anexar(raiz, h('h2', {}, 'Hora de evoluir'), ...sugestoes.map((s) => h('div', { class: 'cartao' }, h('p', { style: 'margin:0' }, s.texto), h('p', { class: 'pequeno suave', style: 'margin:6px 0 0' }, 'Ajuste na ficha quando se sentir pronta.'))));
  }

  if (ultimo) {
    const t = totais(ultimo);
    anexar(raiz, h('h2', {}, 'Último treino'), h('a', { class: 'cartao', href: `#/relatorio/${ultimo.id}`, style: 'display:block;text-decoration:none;color:inherit' },
      h('div', { class: 'linha entre' }, h('strong', {}, ultimo.fichaNome), h('span', { class: 'suave pequeno' }, dataCurta(ultimo.data))),
      h('div', { class: 'suave pequeno' }, `${duracao(ultimo.duracao_s)} · ${t.total} repetições${t.pct_validas !== null ? ` · ${t.pct_validas}% com boa técnica` : ''}`)));
  }
}
