import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarBiblioteca } from '../web/js/motor/biblioteca-node.js';
import { validarDefinicao, prepararDefinicao } from '../web/js/motor/definicao.js';
import { compilar } from '../web/js/motor/condicao.js';
import { angulo, inclinacaoVertical } from '../web/js/motor/geometria.js';
import { analisarGravacao } from '../web/js/motor/analisador.js';
import { gerarSerie, MODELOS } from '../web/js/motor/sintetico.js';
import { EstatisticasDaSerie } from '../web/js/motor/serie.js';
import { Coach } from '../web/js/motor/coach.js';
import { interpretarComando } from '../web/js/motor/comandos.js';
import { SeletorDeAlvo } from '../web/js/motor/alvo.js';
import { montarPlano, sugerirProgressao, filtrarBiblioteca, validarFicha } from '../web/js/motor/plano.js';

const bib = carregarBiblioteca();
const rotulo = (r) => (r.valida ? 'ok' : r.erros.map((e) => e.id).join('+'));

test('geometria: ângulo articular e inclinação', () => {
  assert.equal(Math.round(angulo({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })), 90);
  assert.equal(Math.round(angulo({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 180);
  assert.equal(Math.round(inclinacaoVertical({ x: 0, y: 1 }, { x: 0, y: 0 })), 0);
  assert.equal(Math.round(inclinacaoVertical({ x: 0, y: 0 }, { x: 1, y: 0 })), 90);
});

test('condições declarativas: operadores, "e"/"ou", variável ausente e sintaxe inválida', () => {
  assert.equal(compilar('a > 10').avaliar({ a: 11 }), true);
  assert.equal(compilar('a > limite').avaliar({ a: 0.1, limite: 0.2 }), false);
  assert.equal(compilar('a > 10 e b < 5').avaliar({ a: 11, b: 9 }), false);
  assert.equal(compilar('a > 10 ou (b < 5 e c == 1)').avaliar({ a: 1, b: 2, c: 1 }), true);
  assert.equal(compilar('x > 1').avaliar({}), false, 'variável ausente nunca dispara a regra');
  assert.deepEqual(compilar('min_a > 60').explicar({ min_a: 62.4 }), { variavel: 'min_a', medido: 62.4, configurado: 60 });
  assert.throws(() => compilar('a >'));
  assert.throws(() => compilar('alert(1)'));
});

test('biblioteca: as cinco definições são válidas', () => {
  assert.equal(Object.keys(bib).length, 5);
  for (const def of Object.values(bib)) assert.deepEqual(validarDefinicao(def), [], def.id);
});

test('definição inválida é recusada com o motivo', () => {
  const ruim = structuredClone(bib.rosca_direta_halteres);
  ruim.regras_erro[0].condicao = 'variavel_inexistente > 3';
  ruim.ciclo = ['descida_completa', 'subida', 'topo'];
  const p = validarDefinicao(ruim);
  assert.ok(p.some((x) => x.includes('variavel_inexistente')));
  assert.ok(p.some((x) => x.includes('ciclo')));
  assert.throws(() => prepararDefinicao(ruim));
});

for (const [id, def] of Object.entries(bib)) {
  test(`${id}: conta e classifica cada repetição, com o motivo do erro`, () => {
    const erros = Object.keys(MODELOS[id].erros);
    const reps = [null, null, ...erros.flatMap((e) => [e, null]), null];
    const g = gerarSerie(id, reps, { semente: 3 });
    const r = analisarGravacao(def, g.quadros);
    assert.deepEqual(r.reps.map(rotulo), reps.map((x) => x || 'ok'));
    assert.equal(r.reps.length, g.rotulos.repeticoes_reais);
  });

  test(`${id}: todo erro previsto nas regras tem movimento sintético que o exercita`, () => {
    for (const regra of def.regras_erro) assert.ok(MODELOS[id].erros[regra.id], `falta modelo para ${regra.id}`);
  });
}

test('pequenas oscilações na pose inicial não contam repetição', () => {
  const g = gerarSerie('rosca_direta_halteres', [], { tInicio: 4, ruido: 0.004 });
  assert.equal(analisarGravacao(bib.rosca_direta_halteres, g.quadros).reps.length, 0);
});

test('erro explica valor medido contra o configurado', () => {
  const g = gerarSerie('rosca_direta_halteres', ['amplitude_curta']);
  const [rep] = analisarGravacao(bib.rosca_direta_halteres, g.quadros).reps;
  const e = rep.erros.find((x) => x.id === 'amplitude_curta');
  assert.equal(e.configurado, 55);
  assert.ok(e.medido > 75 && e.medido < 95, `medido ${e.medido}`);
});

test('visibilidade baixa suspende a avaliação em vez de julgar', () => {
  const g = gerarSerie('rosca_direta_halteres', [null, null]);
  for (const q of g.quadros) for (const i of [12, 14, 16, 11, 13, 15]) q.pontos[i].visibility = 0.2;
  const r = analisarGravacao(bib.rosca_direta_halteres, g.quadros);
  assert.equal(r.reps.length, 0);
  assert.equal(r.quadrosSemVisao, g.quadros.length);
});

test('tempos de fase próximos do movimento real (cadência)', () => {
  const g = gerarSerie('rosca_direta_halteres', [null, null, null], { tIda: 1.0, tPausa: 0.5, tVolta: 2.0 });
  for (const rep of analisarGravacao(bib.rosca_direta_halteres, g.quadros).reps) {
    assert.ok(Math.abs(rep.tempo_concentrica - 1.0) < 0.25, `concêntrica ${rep.tempo_concentrica}`);
    assert.ok(Math.abs(rep.tempo_excentrica - 2.0) < 0.35, `excêntrica ${rep.tempo_excentrica}`);
  }
});

test('fadiga: perda de velocidade P = (vmax − vfinal)/vmax', () => {
  const g = gerarSerie('rosca_direta_halteres', Array(8).fill(null), { fadiga: 0.15 });
  const est = new EstatisticasDaSerie({ alvo: 8 });
  for (const rep of analisarGravacao(bib.rosca_direta_halteres, g.quadros).reps) est.registrar(rep);
  const f = est.fadiga();
  assert.ok(f.perda_velocidade_pct > 35, `perda ${f.perda_velocidade_pct}`);
  assert.equal(f.nivel, 'encerrar');
  const semFadiga = new EstatisticasDaSerie({ alvo: 8 });
  for (const rep of analisarGravacao(bib.rosca_direta_halteres, gerarSerie('rosca_direta_halteres', Array(8).fill(null)).quadros).reps) semFadiga.registrar(rep);
  assert.equal(semFadiga.fadiga().nivel, 'nenhum');
});

test('assimetria: avisa qual lado rende menos', () => {
  const reps = Array(5).fill({ assim: 22 });
  const est = new EstatisticasDaSerie({ alvo: 5 });
  for (const rep of analisarGravacao(bib.elevacao_lateral, gerarSerie('elevacao_lateral', reps).quadros).reps) est.registrar(rep);
  const a = est.assimetria();
  assert.equal(a.excede, true);
  assert.equal(a.lado_menor, 'esquerdo');
  const sim = new EstatisticasDaSerie({ alvo: 5 });
  for (const rep of analisarGravacao(bib.elevacao_lateral, gerarSerie('elevacao_lateral', Array(5).fill(null)).quadros).reps) sim.registrar(rep);
  assert.equal(sim.assimetria().excede, false);
});

test('cadência: descida mais rápida que o planejado gera aviso', () => {
  const est = new EstatisticasDaSerie({ alvo: 3, cadencia: { subida: 1, pausa_topo: 1, descida: 3 } });
  const reps = analisarGravacao(bib.rosca_direta_halteres, gerarSerie('rosca_direta_halteres', [null], { tVolta: 0.8 }).quadros).reps;
  est.registrar(reps[0]);
  assert.equal(est.cadenciaDaUltima().id, 'descida_rapida');
});

test('coach: uma correção por repetição, segurança primeiro, sem repetir o mesmo aviso mais de duas vezes', () => {
  const coach = new Coach({ intervaloMinimo: 0 });
  const est = new EstatisticasDaSerie({ alvo: 10 });
  const rep = (erros) => ({ valida: !erros.length, completa: true, erros, lados: {}, velocidade_concentrica: 100, rom: 100 });
  const tec = { id: 'amplitude_curta', severidade: 'tecnica', fala: 'Suba mais.' };
  const seg = { id: 'tronco_inclinado', severidade: 'seguranca', fala: 'Peito aberto.' };
  let r = rep([tec, seg]); est.registrar(r);
  assert.equal(coach.aoRepetir(r, est, 1).id, 'tronco_inclinado');
  const falas = [];
  for (let i = 0; i < 4; i++) { r = rep([tec]); est.registrar(r); falas.push(coach.aoRepetir(r, est, 10 + i).id); }
  assert.equal(falas.filter((x) => x === 'amplitude_curta').length, 2, falas.join(','));
  assert.ok(falas.includes('serie_ruim'), 'três inválidas seguidas → sugestão de reduzir carga ou pausar');
});

test('coach: respeita o intervalo mínimo entre falas, mas a contagem continua', () => {
  const coach = new Coach({ intervaloMinimo: 2.5 });
  const est = new EstatisticasDaSerie({ alvo: 10 });
  const tec = { id: 'x', severidade: 'tecnica', fala: 'Corrija.' };
  const mk = () => ({ valida: false, completa: true, erros: [tec], lados: {}, rom: 90, velocidade_concentrica: 90 });
  let r = mk(); est.registrar(r);
  assert.equal(coach.aoRepetir(r, est, 0).tipo, 'tecnica');
  r = mk(); est.registrar(r);
  assert.equal(coach.aoRepetir(r, est, 1).tipo, 'contagem');
});

test('comandos de voz', () => {
  assert.deepEqual(interpretarComando('Próximo'), { tipo: 'proximo' });
  assert.deepEqual(interpretarComando('pausar'), { tipo: 'pausar' });
  assert.deepEqual(interpretarComando('pode continuar'), { tipo: 'continuar' });
  assert.deepEqual(interpretarComando('terminar treino'), { tipo: 'terminar' });
  assert.deepEqual(interpretarComando('carga 10'), { tipo: 'carga', valor: 10 });
  assert.deepEqual(interpretarComando('carga doze e meio'), { tipo: 'carga', valor: 12.5 });
  assert.deepEqual(interpretarComando('carga 7,5 quilos'), { tipo: 'carga', valor: 7.5 });
  assert.deepEqual(interpretarComando('ai, está doendo'), { tipo: 'dor' });
  assert.deepEqual(interpretarComando('parar'), { tipo: 'parar' });
  assert.deepEqual(interpretarComando('repetir'), { tipo: 'repetir' });
  assert.deepEqual(interpretarComando('sim'), { tipo: 'sim' });
  assert.equal(interpretarComando('que horas são'), null);
});

test('pessoa-alvo: fixa quem calibra e ignora quem cruza a imagem', () => {
  const pose = (cx, alt) => ({ pontos: Array.from({ length: 33 }, (_, i) => ({ x: cx + (i % 2 ? 0.05 : -0.05), y: 0.5 + (i < 23 ? -alt / 2 : alt / 2), visibility: 0.9 })) });
  const s = new SeletorDeAlvo();
  const usuario = pose(0.5, 0.7), crianca = pose(0.2, 0.3);
  assert.equal(s.escolher([crianca, usuario], 0), usuario, 'maior e mais central');
  s.fixar();
  assert.equal(s.escolher([crianca, pose(0.52, 0.7)], 1).pontos[0].x > 0.4, true);
  assert.equal(s.escolher([crianca], 2), null, 'o alvo saiu: a criança não o substitui... de imediato');
  assert.equal(s.escolher([crianca, pose(0.9, 0.3)], 3), null, 'com duas pessoas, ninguém substitui o alvo');
});

test('ficha: plano com aquecimento, bi-set e drop set', () => {
  const ficha = {
    id: 'f', nome: 'F', aquecimento: ['rotacao_ombros'],
    itens: [
      { exercicio: 'rosca_direta_halteres', series: 2, repeticoes: 10, carga_kg: 8, descanso_s: 60, metodo: 'bi-set', lados: 'ambos' },
      { exercicio: 'elevacao_lateral', series: 2, repeticoes: 10, carga_kg: 3, descanso_s: 45, metodo: 'normal', lados: 'ambos' },
      { exercicio: 'desenvolvimento_ombros', series: 2, repeticoes: 8, carga_kg: 10, descanso_s: 60, metodo: 'drop-set', lados: 'ambos' },
    ],
  };
  assert.deepEqual(validarFicha(ficha, bib), []);
  const p = montarPlano(ficha, bib);
  assert.deepEqual(p.map((x) => (x.tipo === 'serie' ? `${x.exercicioId.slice(0, 5)}${x.serie}:${x.descanso_s}:${x.carga_kg}` : x.id)),
    ['rotacao_ombros', 'rosca1:0:8', 'eleva1:60:3', 'rosca2:0:8', 'eleva2:60:3', 'desen1:60:10', 'desen2:0:10', 'desen3:60:8']);
});

test('progressão: sugere aumentar a carga após duas sessões completas e válidas', () => {
  const s = (validas, carga = 8) => ({ series: [1, 2, 3].map((n) => ({ exercicioId: 'rosca_direta_halteres', serie: n, alvo: 12, validas, total: 12, carga_kg: carga, termino: 'meta' })) });
  assert.equal(sugerirProgressao([s(12)], 'rosca_direta_halteres', bib), null);
  assert.equal(sugerirProgressao([s(12), s(10)], 'rosca_direta_halteres', bib), null);
  assert.equal(sugerirProgressao([s(12, 6), s(12, 8)], 'rosca_direta_halteres', bib), null);
  assert.equal(sugerirProgressao([s(12), s(12)], 'rosca_direta_halteres', bib).para, 9);
});

test('biblioteca filtrada pelo equipamento; lesão informada é sinalizada', () => {
  const semHalter = filtrarBiblioteca(bib, { equipamento: [], lesoes: ['joelho'] });
  assert.deepEqual(semHalter.map((x) => x.def.id).sort(), ['agachamento_livre', 'flexao_de_braco']);
  assert.deepEqual(semHalter.find((x) => x.def.id === 'agachamento_livre').alerta, ['joelho']);
  assert.equal(filtrarBiblioteca(bib, { equipamento: ['halteres'], lesoes: [] }).length, 5);
});
