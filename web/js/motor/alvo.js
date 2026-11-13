// Seleção da pessoa-alvo (seção 3.7): na calibração fixa-se quem está treinando (a maior e mais
// central no quadro). Depois, outra pessoa, criança ou animal que cruze a imagem é ignorado.

import { caixa } from './geometria.js';

const pontuacao = (c) => c.l * c.a * (1 - Math.min(1, Math.hypot(c.cx - 0.5, c.cy - 0.5)));

export class SeletorDeAlvo {
  constructor({ distanciaMaxima = 0.3, reaquisicao = 1 } = {}) {
    this.distanciaMaxima = distanciaMaxima;
    this.reaquisicao = reaquisicao;
    this.perdidoDesde = null;
    this.fixado = false;
    this.ultima = null;
  }

  liberar() { this.fixado = false; this.ultima = null; }
  fixar() { if (this.ultima) this.fixado = true; }

  /**
   * @param poses lista de { pontos, mundo? }
   * @param t instante (s)
   * @returns a pose do alvo, ou null se ele saiu do quadro
   */
  escolher(poses, t = 0) {
    const cands = (poses || []).map((p) => ({ pose: p, c: caixa(p.pontos) })).filter((x) => x.c);
    if (!cands.length) return null;
    let melhor = null;
    if (this.fixado && this.ultima) {
      let dMin = Infinity;
      for (const x of cands) {
        const d = Math.hypot(x.c.cx - this.ultima.cx, x.c.cy - this.ultima.cy);
        if (d < dMin && d <= this.distanciaMaxima) { dMin = d; melhor = x; }
      }
      if (!melhor) {
        // O alvo sumiu. Com mais gente no quadro, ninguém o substitui. Com uma única pessoa,
        // depois de um instante assume-se que é ele de volta (ex.: deitou para a flexão).
        this.perdidoDesde ??= t;
        if (cands.length > 1 || t - this.perdidoDesde < this.reaquisicao) return null;
        melhor = cands[0];
      }
    } else {
      melhor = cands.reduce((a, b) => (pontuacao(b.c) > pontuacao(a.c) ? b : a));
    }
    this.perdidoDesde = null;
    this.ultima = melhor.c;
    return melhor.pose;
  }
}
