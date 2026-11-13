// Cálculo das séries (ângulos e medidas) de um quadro, a partir da definição do exercício.

import { angulo, meio, inclinacaoVertical, comprimentoTronco } from './geometria.js';
import { ladoDoPonto } from './definicao.js';

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function pontoMedio(pts, indices, lados) {
  let escolhidos = indices;
  if (lados && indices.length > 1) {
    const f = indices.filter((i) => lados.includes(ladoDoPonto(i)));
    if (f.length) escolhidos = f;
  }
  const ps = escolhidos.map((i) => pts[i]);
  return ps.length === 1 ? ps[0] : ps.reduce((a, b) => meio(a, b));
}

/**
 * @param def definição preparada
 * @param pts pontos métricos {x,y,z,v}
 * @param lados lados ativos: ['dir'], ['esq'] ou ['dir','esq']
 * @param escala fatores de calibração por articulação (opcional)
 */
export function calcularSeries(def, pts, lados, escala = {}) {
  const s = {};
  const porBase = {};
  for (const a of def.articulacoes) {
    let val = angulo(pts[a.pontos[0]], pts[a.pontos[1]], pts[a.pontos[2]]);
    const k = escala[a.base];
    if (k) val = Math.min(180, val * k);
    if (a.lado) {
      // Só os lados ativos entram: em vista lateral o lado oculto não é medido nem comparado.
      if (!lados.includes(a.lado)) continue;
      s[`angulo_${a.base}_${a.lado}`] = val;
      (porBase[a.base] ||= []).push(val);
    } else {
      (porBase[a.base] ||= []).push(val);
    }
  }
  for (const [base, vals] of Object.entries(porBase)) s[`angulo_${base}`] = media(vals.filter((v) => !Number.isNaN(v)));

  const tronco = comprimentoTronco(pts) || 1;
  for (const [nome, m] of Object.entries(def.medidas || {})) {
    if (m.tipo === 'inclinacao') {
      s[`angulo_${nome}`] = inclinacaoVertical(pontoMedio(pts, m.de, lados), pontoMedio(pts, m.para, lados));
    } else if (m.tipo === 'deslocamento') {
      const p = pontoMedio(pts, m.pontos, lados), r = pontoMedio(pts, m.referencia, lados);
      s[`deslocamento_${nome}`] = (p[m.eixo] - r[m.eixo]) / tronco;
    }
  }
  return s;
}

/** Acumula mínimo, máximo, média e valor inicial de cada série ao longo de uma repetição. */
export class Agregador {
  constructor() { this.d = {}; }
  somar(series, t) {
    for (const [k, v] of Object.entries(series)) {
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      const a = (this.d[k] ||= { min: v, max: v, soma: 0, n: 0, inicial: v, tMin: t, tMax: t });
      if (v < a.min) { a.min = v; a.tMin = t; }
      if (v > a.max) { a.max = v; a.tMax = t; }
      a.soma += v; a.n++;
    }
  }
  /** Variáveis disponíveis às condições das regras. */
  variaveis() {
    const v = {};
    for (const [k, a] of Object.entries(this.d)) {
      v[`min_${k}`] = a.min;
      v[`max_${k}`] = a.max;
      v[`variacao_${k}`] = a.max - a.min;
      v[`media_${k}`] = a.soma / a.n;
      // Nome puro: maior afastamento em relação ao início da repetição.
      v[k] = Math.max(Math.abs(a.max - a.inicial), Math.abs(a.min - a.inicial));
    }
    return v;
  }
}
