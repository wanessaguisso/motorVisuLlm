// Máquina de estados das fases (seção 3.7): uma repetição só é contada como completa se
// percorrer o ciclo inteiro definido para o exercício, com histerese e tempo mínimo.
// Tentativas que não completam o ciclo são registradas como repetições inválidas.

import { Agregador } from './medidas.js';

const dentro = (faixa, a, folga = 0) => a >= faixa[0] - folga && a <= faixa[1] + folga;
const ORDEM_SEVERIDADE = { seguranca: 0, tecnica: 1 };
const VEL_PARADO = 20;   // graus/s: abaixo disso o segmento é considerado parado
const ASSENTAR_MAX = 0.6; // s: espera máxima pelo fim real do movimento após fechar o ciclo

export class MaquinaDeRepeticoes {
  constructor(def, { estabilidade = 0.03 } = {}) {
    this.def = def;
    this.estabilidade = estabilidade;
    this.reiniciar();
  }

  reiniciar() {
    this.idx = 0;
    this.candidato = null;
    this.rep = null;
    this.anterior = null;
    this.memoria = [];
    this.assenta = null;
    this.contagem = 0;
  }

  get fase() { return this.def.cicloFases[this.idx].nome; }
  get emAndamento() { return this.rep !== null || this.assenta !== null; }

  /** Abandona a repetição em curso (ex.: perda de visibilidade prolongada). */
  abortar() { this.rep = null; this.assenta = null; this.idx = 0; this.candidato = null; this.memoria = []; }

  #novaRep(t, noApice = false) {
    const d = this.def;
    const agg = new Agregador();
    const traco = [];
    let inicio = t;
    if (!noApice && this.memoria.length) {
      // Recua até o instante em que o movimento realmente começou (ainda dentro da fase inicial).
      let i = this.memoria.length - 1;
      while (i > 0) {
        const a = this.memoria[i], b = this.memoria[i - 1];
        const vel = (d.decrescente ? b.a - a.a : a.a - b.a) / Math.max(1e-3, a.t - b.t);
        if (vel < VEL_PARADO) break;
        i--;
      }
      for (const m of this.memoria.slice(i)) { agg.somar(m.series, m.t); traco.push([m.t, m.a]); }
      inicio = this.memoria[i].t;
    } else if (this.anterior) agg.somar(this.anterior.series, this.anterior.t);
    this.memoria = [];
    this.rep = { t_inicio: inicio, agg, traco, aggVolta: noApice ? new Agregador() : null, inicioNoApice: noApice };
  }

  atualizar(t, series) {
    const d = this.def;
    const eventos = [];
    const a = series[d.chavePrincipal];
    if (typeof a !== 'number' || Number.isNaN(a)) return eventos;
    const ciclo = d.cicloFases;

    if (this.assenta) {
      // O ciclo fechou, mas o segmento ainda está terminando o movimento: espera parar
      // para medir amplitude e tempo da volta por inteiro.
      const s = this.assenta, ant = this.anterior;
      s.rep.agg.somar(series, t); s.rep.aggVolta?.somar(series, t); s.rep.traco.push([t, a]);
      const delta = ant ? a - ant.a : 0;
      const vel = ant ? Math.abs(delta) / Math.max(1e-3, t - ant.t) : 0;
      const revertendo = d.decrescente ? delta < -0.3 : delta > 0.3;
      if (vel < VEL_PARADO || revertendo || t - s.desde > ASSENTAR_MAX) {
        this.assenta = null;
        this.rep = s.rep;
        const r = this.#fechar(t, true);
        if (r) eventos.push({ tipo: 'rep', rep: r });
      }
    } else if (!this.rep) {
      this.memoria.push({ t, a, series });
      if (this.memoria.length > 90) this.memoria.shift();
    }

    const atual = ciclo[this.idx].faixa;
    const fora = !dentro(atual, a, d.histerese);

    let alvo = null;
    if (fora && this.idx < ciclo.length - 1 && dentro(ciclo[this.idx + 1].faixa, a)) alvo = this.idx + 1;
    else if (fora && this.idx > 0 && dentro(ciclo[this.idx - 1].faixa, a)) alvo = this.idx - 1;

    if (alvo === null) this.candidato = null;
    else if (!this.candidato || this.candidato.idx !== alvo) this.candidato = { idx: alvo, desde: t };

    if (this.rep) {
      this.rep.agg.somar(series, t);
      this.rep.aggVolta?.somar(series, t);
      this.rep.traco.push([t, a]);
    }

    if (this.candidato && t - this.candidato.desde >= this.estabilidade) {
      const tt = this.candidato.desde;
      const de = this.idx, para = this.candidato.idx;
      this.candidato = null;
      const ultimo = ciclo.length - 1;

      if (para > de) {
        if (de === 0) {
          if (this.assenta) { // nova repetição começou antes de a anterior assentar
            const pend = this.assenta.rep; this.assenta = null;
            const atualRep = this.rep; this.rep = pend;
            const r = this.#fechar(tt, true);
            if (r) eventos.push({ tipo: 'rep', rep: r });
            this.rep = atualRep;
          }
          this.#novaRep(tt); this.rep.agg.somar(series, t); this.rep.traco.push([t, a]);
        }
        if (para === d.apice && this.rep) { this.rep.aggVolta = new Agregador(); this.rep.aggVolta.somar(series, t); }
        this.idx = para;
        if (para === ultimo) {
          this.assenta = { rep: this.rep, desde: tt };
          this.rep = null;
          this.idx = 0;
        }
      } else if (de > d.apice) {
        // Voltou em direção ao ápice sem terminar a volta: repetição incompleta; a próxima começa aqui.
        const r = this.#fechar(tt, false);
        if (r) eventos.push({ tipo: 'rep', rep: r });
        this.idx = para;
        this.#novaRep(tt, para === d.apice);
        this.rep.agg.somar(series, t); this.rep.traco.push([t, a]);
      } else {
        this.idx = para;
        if (para === 0) {
          // Voltou ao início sem atingir o ápice: tentativa incompleta, se houve deslocamento relevante.
          const r = this.#fechar(tt, false);
          if (r) eventos.push({ tipo: 'rep', rep: r });
        }
      }
      eventos.unshift({ tipo: 'fase', fase: ciclo[this.idx].nome, t: tt });
    }
    this.anterior = { t, series };
    return eventos;
  }

  #fechar(tFim, completa) {
    const d = this.def;
    const rep = this.rep;
    this.rep = null;
    if (!rep) return null;
    const p = rep.agg.d[d.chavePrincipal];
    if (!p) return null;
    const duracao = tFim - rep.t_inicio;
    const rom = p.max - p.min;
    if (duracao < d.tempoMinimo) return null;                 // oscilação, não repetição
    if (!completa && rom < d.romMinimoTentativa) return null;  // ajuste de postura, não tentativa

    // Tempos pela trajetória: ida até chegar ao extremo, pausa junto dele, volta até parar.
    const extremo = d.decrescente ? p.min : p.max;
    const perto = rep.traco.filter(([, a]) => Math.abs(a - extremo) <= Math.max(3, 0.04 * rom));
    const tChega = perto.length ? perto[0][0] : rep.t_inicio;
    const tSai = perto.length ? perto[perto.length - 1][0] : rep.t_inicio;
    const ida = Math.max(0, tChega - rep.t_inicio);
    const pausa = Math.max(0, tSai - tChega);
    const tVolta = Math.max(0, tFim - tSai);
    const tConc = d.concentricaNaVolta ? tVolta : ida;
    const tExc = d.concentricaNaVolta ? ida : tVolta;

    // Variáveis "volta_*": só o trecho depois do ápice (ex.: faltou estender no retorno).
    const volta = {};
    for (const [k, a] of Object.entries(rep.aggVolta?.d || {})) { volta[`volta_min_${k}`] = a.min; volta[`volta_max_${k}`] = a.max; }
    const vars = {
      ...d.limites,
      ...rep.agg.variaveis(),
      ...volta,
      rom,
      tempo_concentrica: tConc,
      tempo_excentrica: tExc,
      tempo_pausa: pausa,
      tempo_total: duracao,
      ciclo_completo: completa ? 1 : 0,
    };

    const erros = [];
    for (const r of d.regras) {
      if (!r.cond.avaliar(vars)) continue;
      erros.push({ id: r.id, severidade: r.severidade, fala: r.fala, pontos: r.pontos ?? null, ...r.cond.explicar(vars) });
    }
    if (!completa && erros.length === 0) {
      erros.push({
        id: 'ciclo_incompleto', severidade: 'tecnica',
        fala: d.fala_ciclo_incompleto || 'Faça o movimento completo.',
        pontos: null, variavel: 'rom', medido: Math.round(rom), configurado: Math.round(d.vaoPrincipal),
      });
    }
    erros.sort((x, y) => ORDEM_SEVERIDADE[x.severidade] - ORDEM_SEVERIDADE[y.severidade]);

    const lados = {};
    for (const lado of ['dir', 'esq']) {
      const al = rep.agg.d[`${d.chavePrincipal}_${lado}`];
      if (!al) continue;
      lados[lado] = {
        rom: al.max - al.min,
        t_pico: Math.max(0, (d.decrescente ? al.tMin : al.tMax) - rep.t_inicio),
      };
    }

    this.contagem++;
    const r2 = (x) => Math.round(x * 100) / 100;
    return {
      n: this.contagem,
      completa,
      valida: completa && erros.length === 0,
      erros,
      t_inicio: rep.t_inicio,
      t_fim: tFim,
      duracao: r2(duracao),
      tempo_ida: r2(ida), tempo_pausa: r2(pausa), tempo_volta: r2(tVolta),
      tempo_concentrica: r2(tConc), tempo_excentrica: r2(tExc),
      rom: r2(rom),
      angulo_min: r2(p.min), angulo_max: r2(p.max),
      velocidade_concentrica: !(rep.inicioNoApice && !d.concentricaNaVolta) && tConc > 0.05 ? r2(rom / tConc) : null,
      lados,
    };
  }
}
