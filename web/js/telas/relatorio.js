// Relatório pós-treino (RF10): repetições válidas e inválidas, erros frequentes, simetria,
// queda de desempenho, constância e sugestão de progressão.

import { dados, salvar, ROTULOS } from '../dados.js';
import { constancia, porExercicio, totais, relatorioLocal } from '../motor/relatorio.js';
import { sugerirProgressao } from '../motor/plano.js';
import { consultar } from '../agente.js';
import { h, trocar, anexar, dataCurta, duracao, kg, dec } from '../ui.js';

export function montar(raiz, { param, biblioteca }) {
  const d = dados();
  const treino = d.historico.find((t) => t.id === param);
  if (!treino) { anexar(raiz, h('p', {}, 'Treino não encontrado.'), h('a', { class: 'botao', href: '#/historico' }, 'Ver evolução')); return null; }
  const ate = d.historico.filter((t) => t.data <= treino.data);
  const k = constancia(ate, treino.data);
  const t = totais(treino);
  let vivo = true;

  const texto = h('div', { class: 'cartao destaque', 'aria-live': 'polite' });
  const mostrarTexto = (r) => {
    trocar(texto, 
      h('p', {}, r.resumo),
      r.destaques?.length > 0 && h('div', {}, h('h3', {}, 'O que foi bem'), h('ul', {}, r.destaques.map((x) => h('li', {}, x)))),
      r.atencao?.length > 0 && h('div', {}, h('h3', {}, 'Pontos de atenção'), h('ul', {}, r.atencao.map((x) => h('li', {}, x)))),
      r.proximo_passo && h('p', { style: 'margin:8px 0 0' }, h('strong', {}, 'Próximo passo: '), r.proximo_passo),
      h('p', { class: 'pequeno suave', style: 'margin:10px 0 0' }, r.origem === 'agente' ? 'Texto escrito pelo coach com IA, a partir dos números medidos neste treino.' : 'Resumo gerado a partir dos números medidos neste treino.'));
  };
  mostrarTexto(treino.relatorio || relatorioLocal(treino, biblioteca, k));

  if (!treino.relatorio) {
    consultar('relatorio', { treino: { duracao_s: treino.duracao_s, completo: treino.completo, series: treino.series, eventos: treino.eventos, ajustes: treino.ajustes }, constancia: k, perfil: { nivel: d.perfil.nivel, objetivo: d.perfil.objetivo } }, { tempoLimite: 25000 }).then((r) => {
      if (r.usado) { treino.agente ||= { consultas: 0, falas: 0, sem_base: 0 }; treino.agente.consultas++; if (r.semBase) treino.agente.sem_base++; }
      if (r.resposta) { treino.relatorio = { ...r.resposta, origem: 'agente' }; treino.agente.falas++; if (vivo) mostrarTexto(treino.relatorio); }
      if (r.usado) salvar();
    });
  }

  anexar(raiz, 
    h('p', { class: 'suave pequeno' }, `${dataCurta(treino.data)} · ${treino.fichaNome}${treino.demonstracao ? ' · demonstração' : ''}`),
    h('h1', {}, treino.completo ? 'Treino concluído' : 'Treino registrado'),
    texto,
    h('div', { class: 'grade' },
      h('div', { class: 'cartao' }, h('div', { class: 'numero' }, duracao(treino.duracao_s)), h('div', { class: 'rotulo' }, 'duração')),
      h('div', { class: 'cartao' }, h('div', { class: 'numero' }, t.total), h('div', { class: 'rotulo' }, 'repetições')),
      h('div', { class: 'cartao' }, h('div', { class: 'numero' }, t.pct_validas === null ? '–' : `${t.pct_validas}%`), h('div', { class: 'rotulo' }, 'com boa técnica')),
      h('div', { class: 'cartao' }, h('div', { class: 'numero' }, k.treinos_na_semana), h('div', { class: 'rotulo' }, k.treinos_na_semana === 1 ? 'treino na semana' : 'treinos na semana'))));

  const dores = (treino.eventos || []).filter((e) => e.tipo === 'dor');
  if (dores.length) anexar(raiz, h('div', { class: 'aviso erro' }, h('strong', {}, 'Dor relatada: '), dores.map((e) => `${biblioteca[e.exercicioId]?.nome || 'treino'}${e.repeticao != null ? ` (repetição ${e.repeticao})` : ''}`).join('; '), '. Se a dor continuar, procure um profissional de saúde.'));

  anexar(raiz, h('h2', {}, 'Por exercício'));
  for (const e of porExercicio(treino)) {
    const def = biblioteca[e.exercicioId];
    const falaDe = (id) => def?.regras_erro.find((r) => r.id === id)?.fala || (id === 'ciclo_incompleto' ? def?.fala_ciclo_incompleto || 'Movimento incompleto.' : id);
    const erros = Object.entries(e.erros).sort((a, b) => b[1] - a[1]);
    const ass = e.series.map((s) => s.assimetria).filter(Boolean).pop();
    const fadiga = Math.max(0, ...e.series.map((s) => s.fadiga?.perda_velocidade_pct || 0));
    const cad = e.series.find((s) => s.cadencia_media && s.cadencia_planejada);
    anexar(raiz, h('div', { class: 'cartao' },
      h('div', { class: 'linha entre' }, h('h3', {}, e.nome), h('span', { class: `etiqueta ${e.validas === e.total ? 'ok' : ''}` }, `${e.validas} de ${e.total} válidas`)),
      h('div', { class: 'rolavel' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Série'), h('th', { class: 'n' }, 'Feitas'), h('th', { class: 'n' }, 'Válidas'), h('th', { class: 'n' }, 'Com erro'), h('th', {}, 'Carga'), h('th', {}, 'Como terminou'))),
        h('tbody', {}, e.series.map((s) => h('tr', {}, h('td', {}, `${s.serie}${s.drop ? ' (drop)' : ''}`), h('td', { class: 'n' }, `${s.total}/${s.alvo}`), h('td', { class: 'n' }, s.validas), h('td', { class: 'n' }, s.invalidas), h('td', {}, kg(s.carga_kg, true)), h('td', {}, ROTULOS.termino[s.termino] || s.termino)))))),
      erros.length > 0 && h('div', { style: 'margin-top:12px' }, h('div', { class: 'rotulo' }, 'Erros mais frequentes'), h('ul', { class: 'limpa' }, erros.map(([id, n]) => h('li', {}, h('span', { class: 'etiqueta erro' }, `${n}×`), ' ', falaDe(id))))),
      h('ul', { class: 'limpa pequeno suave', style: 'margin-top:8px' },
        ass && h('li', {}, ass.excede ? `Simetria: o lado ${ass.lado_menor} teve amplitude ${Math.round(ass.amplitude_pct)}% menor.` : `Simetria: lados equilibrados (diferença de ${Math.round(ass.amplitude_pct)}%).`),
        fadiga >= 10 && h('li', {}, `Queda de velocidade ao longo da série: até ${Math.round(fadiga)}%.`),
        cad && h('li', {}, `Cadência média: subida ${dec(cad.cadencia_media.concentrica)} s, descida ${dec(cad.cadencia_media.excentrica)} s (planejado: ${dec(cad.cadencia_planejada.subida)} s e ${dec(cad.cadencia_planejada.descida)} s).`))));
  }

  if (treino.ajustes?.length) {
    const txt = { reduzir_carga: (a) => `carga reduzida para ${kg(a.valor)}`, aumentar_descanso: (a) => `descanso aumentado em ${a.valor}s`, encerrar_exercicio: () => 'exercício encerrado antes do fim' };
    anexar(raiz, h('h2', {}, 'Ajustes feitos durante o treino'), h('ul', {}, treino.ajustes.map((a) => h('li', {}, `${biblioteca[a.exercicioId]?.nome || ''}: ${txt[a.tipo]?.(a) || a.tipo} (sugestão ${a.origem === 'agente' ? 'do coach com IA' : 'do aplicativo'}, aceita por você).`))));
  }

  const prog = [...new Set(treino.series.map((s) => s.exercicioId))].map((id) => sugerirProgressao(ate, id, biblioteca)).filter(Boolean);
  if (prog.length) {
    anexar(raiz, h('h2', {}, 'Hora de evoluir'), ...prog.map((s) => {
      const ficha = d.fichas.find((f) => f.id === treino.fichaId);
      const item = ficha?.itens.find((it) => it.exercicio === s.exercicioId);
      const feito = item && (s.tipo === 'carga' ? item.carga_kg >= s.para : item.repeticoes >= s.para);
      const botao = h('button', { class: 'primario', disabled: !item || feito, onclick: () => {
        if (s.tipo === 'carga') item.carga_kg = s.para; else item.repeticoes = s.para;
        salvar(); botao.disabled = true; botao.textContent = 'Ficha atualizada';
      } }, feito ? 'Ficha atualizada' : 'Atualizar a ficha');
      return h('div', { class: 'cartao' }, h('p', {}, s.texto), botao);
    }));
  }

  if (treino.agente?.consultas) {
    anexar(raiz, h('p', { class: 'pequeno suave' }, `Coach com IA: ${treino.agente.falas} ${treino.agente.falas === 1 ? 'fala' : 'falas'} neste treino; ${treino.agente.sem_base} descartada(s) por não se apoiar em algo medido.`));
  }

  const nota = h('textarea', { maxlength: 600, placeholder: 'Como você se sentiu? O que funcionou, o que atrapalhou?', value: treino.nota || '' });
  nota.value = treino.nota || '';
  const salvo = h('span', { class: 'pequeno suave', role: 'status' });
  anexar(raiz, h('h2', {}, 'Diário de uso'), h('label', { class: 'pequeno suave', style: 'font-weight:400;margin-top:0' }, 'Anotação sobre este treino (fica só neste aparelho)', nota),
    h('div', { class: 'linha', style: 'margin-top:8px' }, h('button', { onclick: () => { treino.nota = nota.value.trim(); salvar(); salvo.textContent = 'Anotação salva.'; } }, 'Salvar anotação'), salvo),
    h('a', { class: 'botao primario largo', href: '#/inicio', style: 'margin-top:24px' }, 'Voltar ao início'));

  return () => { vivo = false; };
}
