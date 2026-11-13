// Definição declarativa de exercício (seção 3.6 do projeto): leitura, normalização e validação.
// O motor de análise nunca contém regras de um exercício específico: tudo vem do arquivo.

import { compilar } from './condicao.js';

export const SEVERIDADES = ['seguranca', 'tecnica'];
const PREFIXOS = ['min_', 'max_', 'variacao_', 'media_', 'volta_min_', 'volta_max_'];
const EMBUTIDAS = ['rom', 'tempo_concentrica', 'tempo_excentrica', 'tempo_pausa', 'tempo_total', 'ciclo_completo'];

export const ladoDoPonto = (i) => (i % 2 === 1 ? 'esq' : 'dir');

function separarLado(nome) {
  const m = /^(.*)_(dir|esq)$/.exec(nome);
  return m ? { base: m[1], lado: m[2] } : { base: nome, lado: null };
}

/** Nomes das séries (valores por quadro) que a definição produz. */
export function seriesDaDefinicao(def) {
  const s = new Set();
  for (const nome of Object.keys(def.articulacoes_chave || {})) {
    const { base, lado } = separarLado(nome);
    s.add(`angulo_${base}`);
    if (lado) s.add(`angulo_${base}_${lado}`);
  }
  for (const [nome, m] of Object.entries(def.medidas || {})) {
    s.add(m.tipo === 'deslocamento' ? `deslocamento_${nome}` : `angulo_${nome}`);
  }
  return [...s];
}

/** Prepara a definição para o motor: compila condições e resolve fases e ciclo. */
export function prepararDefinicao(def) {
  const problemas = validarDefinicao(def);
  if (problemas.length) throw new Error(`Definição "${def.id}" inválida: ${problemas.join('; ')}`);

  const articulacoes = Object.entries(def.articulacoes_chave).map(([nome, pontos]) => ({ nome, pontos, ...separarLado(nome) }));
  const principal = def.angulo_principal || articulacoes[0].base;
  const chavePrincipal = `angulo_${principal}`;
  const faixas = {};
  for (const f of def.fases) faixas[f.nome] = f[principal] ?? f.faixa;
  const ciclo = def.ciclo.map((nome) => ({ nome, faixa: faixas[nome] }));
  const apice = Math.floor(ciclo.length / 2);
  const f0 = ciclo[0].faixa, fa = ciclo[apice].faixa;
  const decrescente = f0[0] >= fa[1];
  const vao = decrescente ? f0[0] - fa[1] : fa[0] - f0[1];

  return {
    ...def,
    _pronta: true,
    articulacoes,
    principal,
    chavePrincipal,
    cicloFases: ciclo,
    apice,
    decrescente,
    vaoPrincipal: vao,
    romMinimoTentativa: def.rom_minimo_tentativa ?? Math.max(10, 0.3 * vao),
    tempoMinimo: def.tempo_minimo_fase_s ?? 0.4,
    histerese: def.histerese_graus ?? 2,
    concentricaNaVolta: def.fase_concentrica === 'volta',
    limites: def.limites || {},
    regras: (def.regras_erro || []).map((r) => ({ ...r, cond: compilar(r.condicao) })),
    condPoseInicial: def.condicao_pose_inicial ? compilar(def.condicao_pose_inicial) : null,
    pontosChave: [...new Set(articulacoes.flatMap((a) => a.pontos))],
  };
}

/** Devolve a lista de problemas da definição (vazia = válida). Usada na carga e nos testes. */
export function validarDefinicao(def) {
  const p = [];
  const exige = (c, msg) => { if (!c) p.push(msg); };
  exige(def && typeof def === 'object', 'definição ausente');
  if (p.length) return p;
  exige(typeof def.id === 'string' && /^[a-z0-9_]+$/.test(def.id), 'id ausente ou fora do padrão');
  exige(typeof def.nome === 'string' && def.nome, 'nome ausente');
  exige(['forca', 'aquecimento', 'mobilidade'].includes(def.categoria), 'categoria inválida');
  exige(Array.isArray(def.equipamento), 'equipamento deve ser lista');
  exige(['frontal', 'lateral'].includes(def.vista_camera), 'vista_camera deve ser frontal ou lateral');
  exige(['bilateral', 'unilateral'].includes(def.lados), 'lados deve ser bilateral ou unilateral');

  const arts = def.articulacoes_chave;
  exige(arts && Object.keys(arts).length > 0, 'articulacoes_chave ausente');
  if (arts) {
    for (const [nome, pts] of Object.entries(arts)) {
      exige(Array.isArray(pts) && pts.length === 3 && pts.every((i) => Number.isInteger(i) && i >= 0 && i <= 32),
        `articulação ${nome}: informe 3 pontos do BlazePose (0 a 32)`);
    }
  }
  const bases = arts ? [...new Set(Object.keys(arts).map((n) => separarLado(n).base))] : [];
  const principal = def.angulo_principal || bases[0];
  exige(bases.includes(principal), `angulo_principal "${principal}" não está em articulacoes_chave`);

  for (const [nome, m] of Object.entries(def.medidas || {})) {
    if (m.tipo === 'inclinacao') {
      exige(Array.isArray(m.de) && Array.isArray(m.para), `medida ${nome}: informe "de" e "para"`);
    } else if (m.tipo === 'deslocamento') {
      exige(Array.isArray(m.pontos) && Array.isArray(m.referencia), `medida ${nome}: informe "pontos" e "referencia"`);
      exige(['x', 'y'].includes(m.eixo), `medida ${nome}: eixo deve ser x ou y`);
    } else p.push(`medida ${nome}: tipo desconhecido`);
  }

  const nomesFases = new Set();
  exige(Array.isArray(def.fases) && def.fases.length >= 2, 'fases: informe ao menos duas');
  for (const f of def.fases || []) {
    const faixa = f[principal] ?? f.faixa;
    exige(typeof f.nome === 'string', 'fase sem nome');
    exige(Array.isArray(faixa) && faixa.length === 2 && faixa[0] < faixa[1], `fase ${f.nome}: faixa de ângulo inválida`);
    nomesFases.add(f.nome);
  }
  exige(Array.isArray(def.ciclo) && def.ciclo.length >= 3, 'ciclo: informe ao menos três passos');
  for (const n of def.ciclo || []) exige(nomesFases.has(n), `ciclo cita fase inexistente: ${n}`);
  if (Array.isArray(def.ciclo) && def.ciclo.length) {
    exige(def.ciclo[0] === def.ciclo[def.ciclo.length - 1], 'ciclo deve terminar na fase em que começa');
  }

  const series = seriesDaDefinicao(def);
  const conhecidas = new Set([...EMBUTIDAS, ...Object.keys(def.limites || {})]);
  for (const s of series) {
    conhecidas.add(s);
    for (const pre of PREFIXOS) conhecidas.add(pre + s);
  }
  const ids = new Set();
  for (const r of def.regras_erro || []) {
    exige(typeof r.id === 'string' && !ids.has(r.id), `regra com id ausente ou repetido: ${r.id}`);
    ids.add(r.id);
    exige(SEVERIDADES.includes(r.severidade), `regra ${r.id}: severidade deve ser seguranca ou tecnica`);
    exige(typeof r.fala === 'string' && r.fala.trim(), `regra ${r.id}: fala de correção ausente`);
    try {
      for (const id of compilar(r.condicao).identificadores) {
        exige(conhecidas.has(id), `regra ${r.id}: variável desconhecida "${id}"`);
      }
    } catch (e) { p.push(`regra ${r.id}: ${e.message}`); }
  }
  if (def.condicao_pose_inicial) {
    try {
      for (const id of compilar(def.condicao_pose_inicial).identificadores) {
        exige(series.includes(id) || conhecidas.has(id), `pose inicial: variável desconhecida "${id}"`);
      }
    } catch (e) { p.push(`pose inicial: ${e.message}`); }
  }
  return p;
}
