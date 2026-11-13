// Filtro One Euro (Casiez et al., 2012): suaviza o tremor entre quadros com pouco atraso
// em movimentos rápidos. Um filtro por coordenada de cada ponto-chave.

class PassaBaixa {
  constructor() { this.y = null; }
  filtrar(x, alfa) {
    this.y = this.y === null ? x : alfa * x + (1 - alfa) * this.y;
    return this.y;
  }
}

const alfa = (corte, dt) => {
  const tau = 1 / (2 * Math.PI * corte);
  return 1 / (1 + tau / dt);
};

export class FiltroOneEuro {
  constructor({ corteMin = 1.5, beta = 0.05, corteDeriv = 1.0 } = {}) {
    this.corteMin = corteMin; this.beta = beta; this.corteDeriv = corteDeriv;
    this.fx = new PassaBaixa(); this.fdx = new PassaBaixa();
    this.xAnt = null; this.tAnt = null;
  }
  filtrar(x, t) {
    if (this.tAnt === null || t <= this.tAnt) {
      this.tAnt = t; this.xAnt = x;
      return this.fx.filtrar(x, 1);
    }
    const dt = t - this.tAnt;
    const dx = (x - this.xAnt) / dt;
    const dxs = this.fdx.filtrar(dx, alfa(this.corteDeriv, dt));
    const corte = this.corteMin + this.beta * Math.abs(dxs);
    this.tAnt = t; this.xAnt = x;
    return this.fx.filtrar(x, alfa(corte, dt));
  }
}

/** Suaviza os 33 pontos (x, y, z); a visibilidade passa direto. */
export class SuavizadorDePose {
  constructor(opcoes) { this.opcoes = opcoes; this.filtros = null; }
  reiniciar() { this.filtros = null; }
  aplicar(pts, t) {
    if (!this.filtros || this.filtros.length !== pts.length) {
      this.filtros = pts.map(() => [new FiltroOneEuro(this.opcoes), new FiltroOneEuro(this.opcoes), new FiltroOneEuro(this.opcoes)]);
    }
    return pts.map((p, i) => ({
      x: this.filtros[i][0].filtrar(p.x, t),
      y: this.filtros[i][1].filtrar(p.y, t),
      z: this.filtros[i][2].filtrar(p.z ?? 0, t),
      v: p.v,
    }));
  }
}
