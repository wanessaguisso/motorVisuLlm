// Preparação do ambiente e calibração individual (seções 3.3 e 3.7).

import { angulo, caixa, pontosDoQuadro, comprimentoTronco, distancia, PONTOS_CORPO } from './geometria.js';

const NOMES = { 11: 'ombro', 12: 'ombro', 13: 'cotovelo', 14: 'cotovelo', 15: 'punho', 16: 'punho', 23: 'quadril', 24: 'quadril', 25: 'joelho', 26: 'joelho', 27: 'tornozelo', 28: 'tornozelo' };

export function nomeDoPonto(i) { return NOMES[i] || 'corpo'; }

/** Verifica se o corpo inteiro está bem enquadrado; devolve a orientação a dar, se não estiver. */
export function verificarEnquadramento(quadro, { visibilidadeMinima = 0.5 } = {}) {
  if (!quadro || !quadro.pontos) {
    return { ok: false, id: 'sem_pessoa', dica: 'Não estou te vendo. Apoie o celular e fique de corpo inteiro na imagem.' };
  }
  if (typeof quadro.luminosidade === 'number' && quadro.luminosidade < 45) {
    return { ok: false, id: 'escuro', dica: 'O ambiente está escuro. Acenda uma luz ou fique de frente para a claridade.' };
  }
  const p = quadro.pontos;
  const cortado = PONTOS_CORPO.some((i) => (p[i].visibility ?? 0) < visibilidadeMinima || p[i].x < 0.01 || p[i].x > 0.99 || p[i].y < 0.01 || p[i].y > 0.99);
  if (cortado) {
    return { ok: false, id: 'cortado', dica: 'Preciso ver seu corpo inteiro, da cabeça aos pés. Afaste-se um pouco da câmera.' };
  }
  const c = caixa(p);
  const altura = Math.max(p[27].y, p[28].y) - p[0].y;
  if (altura < 0.4) return { ok: false, id: 'longe', dica: 'Chegue um pouco mais perto da câmera.' };
  if (altura > 0.95) return { ok: false, id: 'perto', dica: 'Afaste-se um pouco da câmera.' };
  if (c.cx < 0.25 || c.cx > 0.75) return { ok: false, id: 'descentralizado', dica: 'Fique mais no centro da imagem.' };
  return { ok: true, id: 'ok', dica: null };
}

/**
 * Calibração em pose neutra (em pé, braços ao lado do corpo) por cerca de 3 segundos.
 * Mede proporções e a extensão natural de cotovelos e joelhos, usada para ajustar
 * as faixas de ângulo à pessoa (quem não estende 180° não é punido por isso).
 */
export class Calibrador {
  constructor({ duracao = 3, movimentoMaximo = 0.03 } = {}) {
    this.duracao = duracao;
    this.movimentoMaximo = movimentoMaximo;
    this.reiniciar();
  }
  reiniciar() { this.amostras = []; this.inicio = null; this.ref = null; }

  get progresso() {
    if (this.inicio === null || !this.amostras.length) return 0;
    return Math.min(1, (this.amostras[this.amostras.length - 1].t - this.inicio) / this.duracao);
  }

  /** @returns null enquanto coleta; o resultado quando termina */
  somar(quadro) {
    const c = caixa(quadro.pontos);
    if (this.ref && Math.hypot(c.cx - this.ref.cx, c.cy - this.ref.cy) > this.movimentoMaximo) this.reiniciar();
    if (this.inicio === null) { this.inicio = quadro.t; this.ref = c; }
    const pts = pontosDoQuadro(quadro, false);
    this.amostras.push({
      t: quadro.t,
      cotovelo: (angulo(pts[11], pts[13], pts[15]) + angulo(pts[12], pts[14], pts[16])) / 2,
      joelho: (angulo(pts[23], pts[25], pts[27]) + angulo(pts[24], pts[26], pts[28])) / 2,
      tronco: comprimentoTronco(pts),
      ombros: distancia(pts[11], pts[12]),
      altura: Math.max(quadro.pontos[27].y, quadro.pontos[28].y) - quadro.pontos[0].y,
    });
    if (quadro.t - this.inicio < this.duracao) return null;
    const med = (k) => {
      const v = this.amostras.map((a) => a[k]).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const neutro = { cotovelo: med('cotovelo'), joelho: med('joelho') };
    const escala = {};
    for (const [k, v] of Object.entries(neutro)) {
      // Só corrige quem já está perto da extensão; limite de 8% para não mascarar erro de execução.
      escala[k] = v >= 160 && v < 180 ? Math.min(1.08, 180 / v) : 1;
    }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    return {
      neutro: { cotovelo: Math.round(neutro.cotovelo), joelho: Math.round(neutro.joelho) },
      escala: { cotovelo: r3(escala.cotovelo), joelho: r3(escala.joelho) },
      proporcoes: { tronco: r3(med('tronco')), ombros: r3(med('ombros')), altura_no_quadro: r3(med('altura')) },
    };
  }
}
