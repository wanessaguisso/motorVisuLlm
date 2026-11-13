// Estatísticas de uma série: contagem, fadiga, assimetria e cadência (seções 3.5 e 3.7).
// Os limiares são pontos de partida e serão ajustados na validação (etapa C).

export const LIMIARES = {
  fadiga_aviso_pct: 25,      // perda de velocidade que gera aviso (faixa inicial: 20% a 30%)
  fadiga_encerrar_pct: 40,   // perda que leva à sugestão de encerrar a série
  assimetria_pct: 15,        // diferença entre lados que gera aviso
  cadencia_tolerancia: 0.6,  // fase mais rápida que 60% do planejado = "rápida demais"
  serie_ruim_reps: 3,        // repetições inválidas seguidas que levam à sugestão de reduzir carga
};

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;

export class EstatisticasDaSerie {
  constructor({ alvo = 0, cadencia = null, limiares = {} } = {}) {
    this.alvo = alvo;
    this.cadencia = cadencia;
    this.lim = { ...LIMIARES, ...limiares };
    this.reps = [];
  }

  registrar(rep) { this.reps.push(rep); return this.resumo(); }

  get total() { return this.reps.length; }
  get validas() { return this.reps.filter((r) => r.valida).length; }
  get invalidas() { return this.total - this.validas; }

  invalidasSeguidas() {
    let n = 0;
    for (let i = this.reps.length - 1; i >= 0 && !this.reps[i].valida; i--) n++;
    return n;
  }
  validasSeguidas() {
    let n = 0;
    for (let i = this.reps.length - 1; i >= 0 && this.reps[i].valida; i--) n++;
    return n;
  }

  /** Perda de velocidade: P = (v_max − v_final) / v_max × 100. */
  fadiga() {
    const vs = this.reps.filter((r) => r.completa).map((r) => r.velocidade_concentrica).filter((v) => typeof v === 'number' && v > 0);
    const roms = this.reps.filter((r) => r.completa).map((r) => r.rom);
    let perda = 0, queda = 0;
    if (vs.length >= 3) {
      const vmax = Math.max(...vs);
      perda = Math.max(0, ((vmax - vs[vs.length - 1]) / vmax) * 100);
    }
    if (roms.length >= 3) {
      const rmax = Math.max(...roms);
      queda = Math.max(0, ((rmax - roms[roms.length - 1]) / rmax) * 100);
    }
    const tecnicaCaindo = this.invalidasSeguidas() >= 2;
    let nivel = 'nenhum';
    if (perda >= this.lim.fadiga_encerrar_pct || (perda >= this.lim.fadiga_aviso_pct && tecnicaCaindo)) nivel = 'encerrar';
    else if (perda >= this.lim.fadiga_aviso_pct) nivel = 'aviso';
    return { perda_velocidade_pct: r1(perda), queda_rom_pct: r1(queda), nivel };
  }

  /** Compara amplitude e tempo de cada lado nos exercícios bilaterais. */
  assimetria() {
    const com = this.reps.filter((r) => r.lados?.dir && r.lados?.esq);
    if (com.length < 3) return null;
    const indice = (d, e) => (Math.max(d, e) > 0 ? (Math.abs(d - e) / Math.max(d, e)) * 100 : 0);
    const romD = media(com.map((r) => r.lados.dir.rom)), romE = media(com.map((r) => r.lados.esq.rom));
    const tD = media(com.map((r) => r.lados.dir.t_pico)), tE = media(com.map((r) => r.lados.esq.t_pico));
    const iRom = indice(romD, romE), iTempo = indice(tD, tE);
    const excede = iRom > this.lim.assimetria_pct;
    return {
      amplitude_pct: r1(iRom),
      tempo_pct: r1(iTempo),
      rom_dir: r1(romD), rom_esq: r1(romE),
      lado_menor: excede ? (romD < romE ? 'direito' : 'esquerdo') : null,
      excede,
    };
  }

  /** Compara a cadência planejada com o tempo real da última repetição. */
  cadenciaDaUltima() {
    const c = this.cadencia, rep = this.reps[this.reps.length - 1];
    if (!c || !rep || !rep.completa) return null;
    const tol = this.lim.cadencia_tolerancia;
    if (c.descida && rep.tempo_excentrica < c.descida * tol) return { id: 'descida_rapida', planejado: c.descida, medido: rep.tempo_excentrica };
    if (c.subida && rep.tempo_concentrica < c.subida * tol) return { id: 'subida_rapida', planejado: c.subida, medido: rep.tempo_concentrica };
    return null;
  }

  errosFrequentes() {
    const cont = {};
    for (const r of this.reps) for (const e of r.erros) cont[e.id] = (cont[e.id] || 0) + 1;
    return cont;
  }

  resumo() {
    const comp = this.reps.filter((r) => r.completa);
    return {
      alvo: this.alvo,
      total: this.total,
      validas: this.validas,
      invalidas: this.invalidas,
      erros: this.errosFrequentes(),
      fadiga: this.fadiga(),
      assimetria: this.assimetria(),
      cadencia_media: comp.length ? {
        concentrica: r1(media(comp.map((r) => r.tempo_concentrica))),
        excentrica: r1(media(comp.map((r) => r.tempo_excentrica))),
      } : null,
      rom_medio: comp.length ? r1(media(comp.map((r) => r.rom))) : null,
    };
  }
}
