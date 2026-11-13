import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarBiblioteca } from '../web/js/motor/biblioteca-node.js';
import { Sessao } from '../web/js/motor/sessao.js';
import { PessoaSimulada } from '../web/js/motor/sintetico.js';

const bib = carregarBiblioteca();
const item = (exercicio, o = {}) => ({ exercicio, series: 2, repeticoes: 5, carga_kg: 8, cadencia_s: { subida: 1, pausa_topo: 0, descida: 1 }, descanso_s: 15, metodo: 'normal', lados: 'ambos', ...o });

/** Roda a sessão com uma pessoa simulada. `aoQuadro(sessao, t, log)` pode enviar comandos. */
function rodar(ficha, { pessoa = {}, aoQuadro = () => {}, config = {}, limite = 900, semPessoa = () => false } = {}) {
  const log = { falas: [], estados: [], reps: [], fim: null, series: [] };
  const sessao = new Sessao({
    ficha, biblioteca: bib, config,
    emitir: (e) => {
      if (e.tipo === 'falar') log.falas.push(e.texto);
      else if (e.tipo === 'estado') log.estados.push(e.estado);
      else if (e.tipo === 'rep') log.reps.push(e);
      else if (e.tipo === 'serie_fim') log.series.push(e.serie);
      else if (e.tipo === 'treino_fim') log.fim = e.resultado;
    },
  });
  const p = new PessoaSimulada(pessoa);
  sessao.iniciar(0);
  let t = 0;
  while (!log.fim && t < limite) {
    t += 1 / 30;
    const q = p.quadro(t, sessao.visao());
    sessao.quadro(semPessoa(t, sessao) ? { t, poses: [], aspecto: q.aspecto } : q);
    aoQuadro(sessao, t, log);
  }
  return { sessao, log, t };
}

test('sessão completa sem as mãos: preparo, calibração, séries, descanso e fim', () => {
  const ficha = { id: 'a', nome: 'Treino A', aquecimento: ['rotacao_ombros'], itens: [item('rosca_direta_halteres'), item('agachamento_livre', { series: 1, carga_kg: 0 })] };
  const { log } = rodar(ficha);
  assert.ok(log.fim?.completo);
  assert.deepEqual([...new Set(log.estados)], ['preparo', 'calibracao', 'aquecimento', 'aguardando_pose', 'contagem', 'executando', 'descanso', 'concluido']);
  assert.deepEqual(log.fim.series.map((s) => [s.exercicioId, s.serie, s.total, s.validas, s.termino]), [
    ['rosca_direta_halteres', 1, 5, 5, 'meta'], ['rosca_direta_halteres', 2, 5, 5, 'meta'], ['agachamento_livre', 1, 5, 5, 'meta'],
  ]);
  assert.ok(log.fim.calibracao.neutro.cotovelo > 150);
  assert.ok(log.falas.some((f) => f.startsWith('Rosca direta com halteres. Série 1 de 2. 5 repetições com 8 quilos.')));
  assert.ok(log.falas.includes('Vai!'));
});

test('repetições com erro: contagem de válidas e inválidas e correção falada', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('rosca_direta_halteres', { series: 1, repeticoes: 6 })] };
  const { log } = rodar(ficha, { pessoa: { erros: { rosca_direta_halteres: { 2: 'cotovelo_foge', 5: 'balanco_tronco' } } } });
  const [s] = log.fim.series;
  assert.deepEqual([s.total, s.validas, s.invalidas], [6, 4, 2]);
  assert.deepEqual(s.erros, { cotovelo_foge: 1, balanco_tronco: 1 });
  assert.ok(log.falas.includes('Cotovelo colado ao corpo.'));
  assert.ok(log.falas.some((f) => f.includes('6 de 6, 2 com erro')));
});

test('fim automático antes da meta pergunta a causa; resposta "falha" é registrada', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('elevacao_lateral', { series: 1, repeticoes: 8, carga_kg: 3 })] };
  const { log } = rodar(ficha, {
    pessoa: { parar: { elevacao_lateral: 3 } },
    aoQuadro: (s) => { if (s.estado === 'pergunta_causa') s.comando({ tipo: 'falha' }); },
  });
  assert.ok(log.falas.includes('Você parou antes da meta. Foi falha ou dor?'));
  assert.deepEqual([log.fim.series[0].total, log.fim.series[0].termino], [3, 'falha']);
});

test('comando "dor" interrompe a série na hora, registra o evento e não retoma o exercício', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('rosca_direta_halteres', { series: 3 }), item('agachamento_livre', { series: 1, carga_kg: 0 })] };
  let disse = false, continuou = false;
  const { log } = rodar(ficha, {
    aoQuadro: (s, t, l) => {
      if (!disse && l.reps.length === 2) { disse = true; assert.equal(s.comando({ tipo: 'dor' }), true); assert.equal(s.estado, 'pausado'); }
      else if (disse && !continuou && s.estado === 'pausado') { continuou = true; s.comando({ tipo: 'continuar' }); }
    },
  });
  assert.equal(log.fim.eventos.length, 1);
  assert.deepEqual([log.fim.eventos[0].tipo, log.fim.eventos[0].exercicioId, log.fim.eventos[0].repeticao], ['dor', 'rosca_direta_halteres', 2]);
  assert.deepEqual(log.fim.series.map((s) => [s.exercicioId, s.termino]), [['rosca_direta_halteres', 'dor'], ['agachamento_livre', 'meta']]);
  assert.ok(log.falas.some((f) => f.includes('procure um profissional de saúde')));
});

test('comandos: pausar/continuar, carga, próximo e terminar treino', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('rosca_direta_halteres', { series: 3, descanso_s: 40 })] };
  const feito = {};
  const { log } = rodar(ficha, {
    aoQuadro: (s, t, l) => {
      if (!feito.pausa && l.reps.length === 2) { feito.pausa = t; s.comando({ tipo: 'pausar' }); }
      else if (feito.pausa && !feito.volta && t > feito.pausa + 3) { feito.volta = true; assert.equal(s.estado, 'pausado'); s.comando({ tipo: 'continuar' }); assert.equal(s.estado, 'executando'); }
      else if (s.estado === 'descanso' && l.series.length === 1 && !feito.carga) { feito.carga = true; s.comando({ tipo: 'carga', valor: 10 }); s.comando({ tipo: 'proximo' }); assert.equal(s.estado, 'aguardando_pose'); }
      else if (l.series.length === 2 && !feito.fim) { feito.fim = true; s.comando({ tipo: 'terminar' }); }
    },
  });
  assert.equal(log.fim.completo, false);
  assert.deepEqual(log.fim.series.map((s) => [s.serie, s.total, s.carga_kg]), [[1, 5, 10], [2, 5, 10]]);
});

test('série ruim: sugere reduzir a carga e só aplica depois do "sim"', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('rosca_direta_halteres', { series: 2, repeticoes: 5, carga_kg: 10 })] };
  const erros = { rosca_direta_halteres: { 2: 'amplitude_curta', 3: 'amplitude_curta', 4: 'amplitude_curta' } };
  let respondeu = false;
  const { log } = rodar(ficha, {
    pessoa: { erros },
    aoQuadro: (s) => { if (s.estado === 'descanso' && s.sugestao && !respondeu) { respondeu = true; assert.equal(s.sugestao.tipo, 'reduzir_carga'); s.comando({ tipo: 'sim' }); } },
  });
  assert.ok(respondeu);
  assert.deepEqual(log.fim.series.map((s) => s.carga_kg), [10, 9]);
  assert.deepEqual(log.fim.ajustes.map((a) => [a.tipo, a.valor, a.origem]), [['reduzir_carga', 9, 'motor']]);
});

test('sugestão do agente só é aceita dentro de limites conservadores', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('rosca_direta_halteres', { series: 2, carga_kg: 10 })] };
  let testou = false;
  rodar(ficha, {
    aoQuadro: (s) => {
      if (s.estado !== 'descanso' || testou) return;
      testou = true;
      assert.equal(s.sugestaoDoAgente({ tipo: 'reduzir_carga', valor: 14 }), false, 'agente não aumenta carga');
      assert.equal(s.sugestaoDoAgente({ tipo: 'reduzir_carga', valor: 2 }), false, 'redução acima de 30% é recusada');
      assert.equal(s.sugestaoDoAgente({ tipo: 'mudar_regra', valor: 1 }), false, 'agente não altera regras');
      assert.equal(s.sugestaoDoAgente({ tipo: 'reduzir_carga', valor: 8 }), true);
      assert.equal(s.plano.at(-1).carga_kg, 10, 'nada muda sem confirmação');
      s.comando({ tipo: 'sim' });
      assert.equal(s.plano.at(-1).carga_kg, 8);
    },
  });
  assert.ok(testou);
});

test('sair do quadro pausa a série; voltar retoma sem perder a contagem', () => {
  const ficha = { id: 'a', nome: 'A', itens: [item('agachamento_livre', { series: 1, repeticoes: 4, carga_kg: 0 })] };
  let saiu = null;
  const { log } = rodar(ficha, {
    aoQuadro: (s, t, l) => { if (saiu === null && l.reps.length === 2) saiu = t; },
    semPessoa: (t) => saiu !== null && t > saiu && t < saiu + 5,
  });
  assert.ok(log.falas.includes('Você saiu da imagem. Pausei a série.'));
  assert.ok(log.estados.includes('pausado'));
  assert.ok(log.fim.completo);
  assert.ok(log.fim.series[0].total >= 4);
});
