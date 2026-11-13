// Evolução: frequência de treinos e progresso gradual (constância antes de desempenho).

import { dados } from '../dados.js';
import { constancia, totais } from '../motor/relatorio.js';
import { h, trocar, anexar, dataCurta, duracao, kg } from '../ui.js';

export function montar(raiz, { biblioteca }) {
  const d = dados();
  const hist = d.historico;
  anexar(raiz, h('h1', {}, 'Sua evolução'));
  if (!hist.length) {
    anexar(raiz, h('p', { class: 'suave' }, 'Seus treinos vão aparecer aqui. O primeiro é o mais difícil de começar.'), h('a', { class: 'botao primario', href: '#/inicio' }, 'Fazer o primeiro treino'));
    return;
  }
  const k = constancia(hist);
  anexar(raiz, h('div', { class: 'grade tres' },
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.total), h('div', { class: 'rotulo' }, k.total === 1 ? 'treino feito' : 'treinos feitos')),
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.treinos_em_30_dias), h('div', { class: 'rotulo' }, 'nos últimos 30 dias')),
    h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.semanas_seguidas), h('div', { class: 'rotulo' }, 'semanas seguidas'))));

  // Treinos por semana (últimas 8): uma série só, um eixo, valor visível na última barra e ao passar o ponteiro.
  const DIA = 86400000;
  const seg = (ms) => { const x = new Date(ms); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
  const atual = seg(Date.now());
  const semanas = Array.from({ length: 8 }, (_, i) => atual - (7 - i) * 7 * DIA);
  const cont = semanas.map((s) => hist.filter((t) => seg(t.data) === seg(s + DIA)).length);
  const max = Math.max(1, ...cont);
  anexar(raiz, h('h2', {}, 'Treinos por semana'),
    h('div', { class: 'cartao' },
      h('div', { class: 'grafico', role: 'img', 'aria-label': `Treinos por semana nas últimas 8 semanas: ${cont.join(', ')}` },
        cont.map((n, i) => h('div', { class: `col${i === cont.length - 1 ? ' ultimo' : ''}`, tabindex: 0, title: `Semana de ${new Date(semanas[i]).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${n} ${n === 1 ? 'treino' : 'treinos'}` },
          h('span', { class: 'valor' }, `${n} ${n === 1 ? 'treino' : 'treinos'}`), h('div', { class: 'barra', style: `height:${n ? Math.max(4, (n / max) * 100) : 0}%` })))),
      h('div', { class: 'eixo', 'aria-hidden': 'true' }, semanas.map((s) => h('span', {}, new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))))));

  // Evolução por exercício: primeira x última sessão.
  const porEx = new Map();
  for (const t of hist) for (const s of t.series) { if (!porEx.has(s.exercicioId)) porEx.set(s.exercicioId, []); const l = porEx.get(s.exercicioId); let u = l[l.length - 1]; if (!u || u.id !== t.id) { u = { id: t.id, data: t.data, total: 0, validas: 0, carga: 0 }; l.push(u); } u.total += s.total; u.validas += s.validas; u.carga = Math.max(u.carga, s.carga_kg); }
  const pct = (x) => (x.total ? `${Math.round((x.validas / x.total) * 100)}%` : '–');
  anexar(raiz, h('h2', {}, 'Por exercício'), h('p', { class: 'pequeno suave' }, 'Da primeira à última sessão de cada exercício.'), h('div', { class: 'cartao rolavel' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Exercício'), h('th', { class: 'n' }, 'Sessões'), h('th', {}, 'Carga'), h('th', {}, 'Boa técnica'))),
    h('tbody', {}, [...porEx.entries()].map(([id, l]) => h('tr', {}, h('td', {}, biblioteca[id]?.nome || id), h('td', { class: 'n' }, l.length), h('td', {}, l.length > 1 ? `${kg(l[0].carga, true)} → ${kg(l[l.length - 1].carga, true)}` : kg(l[0].carga, true)), h('td', {}, l.length > 1 ? `${pct(l[0])} → ${pct(l[l.length - 1])}` : pct(l[0]))))))));

  anexar(raiz, h('h2', {}, 'Treinos'), h('ul', { class: 'limpa' }, [...hist].reverse().slice(0, 60).map((t) => {
    const tt = totais(t);
    return h('li', {}, h('a', { class: 'cartao', href: `#/relatorio/${t.id}`, style: 'display:block;text-decoration:none;color:inherit;margin:0' },
      h('div', { class: 'linha entre' }, h('strong', {}, t.fichaNome), h('span', { class: 'suave pequeno' }, dataCurta(t.data))),
      h('div', { class: 'suave pequeno' }, `${duracao(t.duracao_s)} · ${tt.total} repetições${tt.pct_validas !== null ? ` · ${tt.pct_validas}% com boa técnica` : ''}${t.completo ? '' : ' · encerrado antes do fim'}`)));
  })));
}
