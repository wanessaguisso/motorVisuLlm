// Analisador de uma série: recebe quadros (sequências de pontos-chave) e devolve fases,
// repetições classificadas e o estado de visibilidade. Como só depende dos pontos,
// o mesmo código roda ao vivo e sobre vídeos gravados (seção 3.11).

import { pontosDoQuadro } from './geometria.js';
import { SuavizadorDePose } from './filtro.js';
import { calcularSeries } from './medidas.js';
import { MaquinaDeRepeticoes } from './repeticoes.js';
import { prepararDefinicao } from './definicao.js';

export const VISIBILIDADE_MINIMA = 0.5;

export class Analisador {
  /**
   * @param definicao definição do exercício (bruta ou preparada)
   * @param opcoes.lado 'ambos' | 'direito' | 'esquerdo'
   * @param opcoes.calibracao resultado da calibração individual (opcional)
   * @param opcoes.usar3d usa coordenadas "mundo" quando existirem
   */
  constructor(definicao, opcoes = {}) {
    this.def = definicao._pronta ? definicao : prepararDefinicao(definicao);
    this.opcoes = { lado: 'ambos', usar3d: false, visibilidadeMinima: VISIBILIDADE_MINIMA, suavizar: true, ...opcoes };
    this.suavizador = new SuavizadorDePose();
    this.maquina = new MaquinaDeRepeticoes(this.def);
    this.visEma = { dir: null, esq: null };
    this.ladoLateral = null;
    this.tSemVisao = null;
    this.series = {};
  }

  get fase() { return this.maquina.fase; }
  get emAndamento() { return this.maquina.emAndamento; }

  reiniciar() {
    this.maquina.reiniciar();
    this.suavizador.reiniciar();
    this.tSemVisao = null;
  }

  #ladosAtivos(quadro) {
    const { lado } = this.opcoes;
    if (lado === 'direito') return ['dir'];
    if (lado === 'esquerdo') return ['esq'];
    if (this.def.vista_camera !== 'lateral') return ['dir', 'esq'];
    // Vista lateral: analisa o lado mais visível, com troca amortecida para não oscilar.
    for (const l of ['dir', 'esq']) {
      const pts = this.def.articulacoes.filter((a) => a.lado === l).flatMap((a) => a.pontos);
      if (!pts.length) continue;
      const v = pts.reduce((s, i) => s + (quadro.pontos[i]?.visibility ?? 0), 0) / pts.length;
      this.visEma[l] = this.visEma[l] === null ? v : 0.9 * this.visEma[l] + 0.1 * v;
    }
    const { dir, esq } = this.visEma;
    if (dir === null || esq === null) return [dir === null ? 'esq' : 'dir'];
    if (!this.ladoLateral) this.ladoLateral = dir >= esq ? 'dir' : 'esq';
    else if (this.ladoLateral === 'dir' && esq > dir + 0.15) this.ladoLateral = 'esq';
    else if (this.ladoLateral === 'esq' && dir > esq + 0.15) this.ladoLateral = 'dir';
    return [this.ladoLateral];
  }

  /** Pontos-chave do exercício nos lados ativos (para visibilidade e desenho). */
  pontosAtivos(lados) {
    const s = new Set();
    for (const a of this.def.articulacoes) if (!a.lado || lados.includes(a.lado)) a.pontos.forEach((i) => s.add(i));
    return [...s];
  }

  /**
   * @param quadro { t (s), pontos: [{x,y,z,visibility}×33], mundo?, aspecto }
   * @returns { ok, motivo, lados, pontosChave, series, fase, eventos }
   */
  processar(quadro) {
    const lados = this.#ladosAtivos(quadro);
    const chave = this.pontosAtivos(lados);
    const min = this.opcoes.visibilidadeMinima;
    const ocultos = chave.filter((i) => (quadro.pontos[i]?.visibility ?? 0) < min);
    if (ocultos.length) {
      // Confiança baixa: suspende a avaliação em vez de julgar com dados ruins.
      if (this.tSemVisao === null) this.tSemVisao = quadro.t;
      if (quadro.t - this.tSemVisao > 2 && this.maquina.emAndamento) this.maquina.abortar();
      return { ok: false, motivo: 'visibilidade', ocultos, lados, pontosChave: chave, series: this.series, fase: this.fase, eventos: [] };
    }
    this.tSemVisao = null;

    let pts = pontosDoQuadro(quadro, this.opcoes.usar3d);
    if (this.opcoes.suavizar) pts = this.suavizador.aplicar(pts, quadro.t);
    this.series = calcularSeries(this.def, pts, lados, this.opcoes.calibracao?.escala);
    const eventos = this.maquina.atualizar(quadro.t, this.series);
    return { ok: true, motivo: null, lados, pontosChave: chave, series: this.series, fase: this.fase, eventos };
  }

  /** O corpo está na pose inicial do exercício? (primeira fase do ciclo + condição declarada) */
  naPoseInicial() {
    const d = this.def;
    const a = this.series[d.chavePrincipal];
    if (typeof a !== 'number' || Number.isNaN(a)) return false;
    const f = d.cicloFases[0].faixa;
    if (a < f[0] - d.histerese || a > f[1] + d.histerese) return false;
    return d.condPoseInicial ? d.condPoseInicial.avaliar(this.series) : true;
  }
}

/** Roda o motor sobre uma gravação de pontos-chave e devolve todas as repetições. */
export function analisarGravacao(definicao, quadros, opcoes = {}) {
  const an = new Analisador(definicao, opcoes);
  const reps = [];
  let semVisao = 0;
  for (const q of quadros) {
    const r = an.processar(q);
    if (!r.ok) semVisao++;
    for (const e of r.eventos) if (e.tipo === 'rep') reps.push(e.rep);
  }
  return { reps, quadros: quadros.length, quadrosSemVisao: semVisao };
}
