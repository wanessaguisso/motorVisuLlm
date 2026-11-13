// Controle da sessão (seção 3.8): máquina de estados que conduz o treino sem o uso das mãos,
// avançando por detecção de pose e por comandos de voz. Não toca em DOM, câmera ou rede:
// recebe quadros e comandos e emite efeitos (falas e eventos) por uma função.

import { Analisador } from './analisador.js';
import { prepararDefinicao } from './definicao.js';
import { EstatisticasDaSerie } from './serie.js';
import { Coach } from './coach.js';
import { SeletorDeAlvo } from './alvo.js';
import { Calibrador, verificarEnquadramento, nomeDoPonto } from './calibracao.js';
import { montarPlano, arredondarCarga } from './plano.js';
import { vistaDaCamera } from './geometria.js';

export const ESTADOS = ['preparo', 'calibracao', 'aquecimento', 'aguardando_pose', 'contagem', 'executando', 'pergunta_causa', 'descanso', 'pausado', 'concluido'];

const PADRAO = {
  pose_inicial_s: 1.5,   // tempo na pose inicial para começar a contagem
  contagem_s: 3,
  calibracao_s: 3,
  ocioso_s: 6,           // parado após repetições = fim da série
  fora_do_quadro_s: 2,
  resposta_s: 8,         // espera pela resposta "falha ou dor"
  enquadramento_s: 1,
  usar3d: false,
  pularPreparo: false,
  limiares: {},
};

const kg = (n) => (n === 1 ? '1 quilo' : `${String(n).replace('.', ',')} quilos`);

export class Sessao {
  /**
   * @param ficha ficha de treino
   * @param biblioteca mapa id → definição de exercício
   * @param emitir função que recebe os efeitos: { tipo: 'falar' | 'rep' | 'serie_fim' | 'treino_fim' | 'estado', ... }
   */
  constructor({ ficha, biblioteca, perfil = {}, config = {}, emitir = () => {}, calibracao = null }) {
    this.ficha = ficha;
    this.biblioteca = biblioteca;
    this.perfil = perfil;
    this.cfg = { ...PADRAO, ...config };
    this.emitir = emitir;
    this.plano = montarPlano(ficha, biblioteca);
    this.defs = {};
    for (const p of this.plano) if (p.tipo === 'serie' && !this.defs[p.exercicioId]) this.defs[p.exercicioId] = prepararDefinicao(biblioteca[p.exercicioId]);
    this.seletor = new SeletorDeAlvo();
    this.calibrador = new Calibrador({ duracao: this.cfg.calibracao_s });
    this.calibracao = calibracao;
    this.coach = new Coach();
    this.estado = 'preparo';
    this.idx = -1;
    this.t = 0;
    this.analisador = null;
    this.est = null;
    this.series = [];
    this.eventos = [];      // dor e paradas
    this.ajustes = [];      // ajustes de ficha aceitos durante a sessão
    this.sugestao = null;   // ajuste aguardando "sim" ou "não"
    this.dicaAtual = null;
    this.ultimaDica = { id: null, t: -Infinity };
    this.marcas = {};       // temporizadores do estado atual
    this.pausa = null;
    this.pontosErro = { pontos: null, ate: 0 };
    this.ultimaAnalise = null;
    this.inicio = null;
    this.fim = null;
  }

  // ---------------------------------------------------------------- utilidades

  get passo() { return this.plano[this.idx] || null; }
  get def() { return this.passo?.tipo === 'serie' ? this.defs[this.passo.exercicioId] : null; }

  #falar(texto, prioridade = 'normal', categoria = 'coach') {
    if (texto) this.emitir({ tipo: 'falar', texto, prioridade, categoria });
  }

  #dica(id, texto, intervalo = 7) {
    this.dicaAtual = texto;
    if (id === this.ultimaDica.id && this.t - this.ultimaDica.t < intervalo) return;
    this.ultimaDica = { id, t: this.t };
    this.#falar(texto, 'baixa', 'dica');
  }

  #mudar(estado) {
    this.estado = estado;
    this.marcas = { entrada: this.t };
    this.dicaAtual = null;
    this.emitir({ tipo: 'estado', estado });
  }

  // ---------------------------------------------------------------- ciclo de vida

  iniciar(t = 0) {
    this.t = t;
    this.inicio = t;
    if (!this.plano.length) return this.#concluir(false);
    if (this.cfg.pularPreparo) return this.#avancar();
    this.#mudar('preparo');
    this.#falar('Vamos começar. Apoie o celular a uns dois metros e fique de corpo inteiro na imagem.');
  }

  /** Avança para o próximo passo do plano. */
  #avancar() {
    this.idx++;
    this.sugestao = null;
    const p = this.passo;
    if (!p) return this.#concluir(true);
    if (p.tipo === 'aquecimento') {
      this.#mudar('aquecimento');
      this.#falar(`Aquecimento: ${p.nome}, ${p.duracao_s} segundos. ${p.instrucao}`);
      return;
    }
    this.#prepararSerie(true);
  }

  #prepararSerie(anunciar) {
    const p = this.passo, d = this.def;
    this.analisador = new Analisador(d, { lado: p.lados, calibracao: this.calibracao, usar3d: this.cfg.usar3d });
    this.est = new EstatisticasDaSerie({ alvo: p.alvo, cadencia: p.cadencia_s, limiares: this.cfg.limiares });
    this.coach.novaSerie();
    this.maxInvalidasSeguidas = 0;
    this.#mudar('aguardando_pose');
    if (!anunciar) return;
    const anterior = this.plano[this.idx - 1];
    const novoExercicio = !anterior || anterior.exercicioId !== p.exercicioId;
    const partes = [`${p.nome}. Série ${p.serie} de ${p.totalSeries}. ${p.alvo} repetições${p.carga_kg > 0 ? ` com ${kg(p.carga_kg)}` : ''}.`];
    if (p.drop) partes.push('Drop set: carga reduzida, sem descanso.');
    if (novoExercicio) {
      partes.push(d.vista_camera === 'lateral' ? 'Fique de lado para a câmera.' : 'Fique de frente para a câmera.');
      partes.push(...(d.dicas_inicio || []).map((x) => `${x}.`));
    }
    partes.push('Quando estiver na posição inicial, eu começo a contar.');
    this.#falar(partes.join(' '));
  }

  #concluir(completo) {
    if (this.estado === 'concluido') return;
    this.fim = this.t;
    this.#mudar('concluido');
    this.#falar(completo ? 'Treino concluído. Parabéns por ter vindo treinar hoje!' : 'Treino encerrado. O que você fez hoje já conta.');
    this.emitir({ tipo: 'treino_fim', resultado: this.resultado(completo) });
  }

  // ---------------------------------------------------------------- quadros

  /**
   * @param q { t, poses: [{ pontos, mundo? }], aspecto, luminosidade? }
   */
  quadro(q) {
    this.t = q.t;
    const pose = this.seletor.escolher(q.poses, q.t);
    const quadro = pose ? { t: q.t, pontos: pose.pontos, mundo: pose.mundo, aspecto: q.aspecto || 1, luminosidade: q.luminosidade } : null;
    this.pontosAtuais = quadro?.pontos || null;

    if (!quadro) this.marcas.semPessoa ??= q.t; else this.marcas.semPessoa = null;
    const sumiu = this.marcas.semPessoa != null && q.t - this.marcas.semPessoa >= this.cfg.fora_do_quadro_s;

    switch (this.estado) {
      case 'preparo': this.#emPreparo(quadro); break;
      case 'calibracao': this.#emCalibracao(quadro); break;
      case 'aguardando_pose': this.#emAguardando(quadro); break;
      case 'contagem':
        if (sumiu) { this.#mudar('aguardando_pose'); this.#dica('sem_pessoa', 'Não estou te vendo. Volte para a frente da câmera.'); }
        break;
      case 'executando':
        if (sumiu) this.#pausar('fora_do_quadro', 'Você saiu da imagem. Pausei a série.');
        else if (quadro) this.#emExecucao(quadro);
        break;
      case 'pausado':
        if (this.pausa?.motivo === 'fora_do_quadro' && quadro) {
          this.marcas.voltou ??= q.t;
          if (q.t - this.marcas.voltou >= 1) this.#retomar();
        } else this.marcas.voltou = null;
        break;
      default: break;
    }
    this.tique(q.t);
  }

  #emPreparo(quadro) {
    const v = verificarEnquadramento(quadro);
    if (!v.ok) { this.marcas.ok = null; return this.#dica(v.id, v.dica); }
    this.dicaAtual = null;
    this.marcas.ok ??= this.t;
    if (this.t - this.marcas.ok < this.cfg.enquadramento_s) return;
    this.calibrador.reiniciar();
    this.#mudar('calibracao');
    this.#falar('Ótimo, estou te vendo. Fique em pé, parada, com os braços ao lado do corpo, por três segundos.');
  }

  #emCalibracao(quadro) {
    const v = verificarEnquadramento(quadro);
    if (!v.ok) { this.calibrador.reiniciar(); return this.#dica(v.id, v.dica); }
    this.dicaAtual = null;
    const r = this.calibrador.somar(quadro);
    if (!r) return;
    this.calibracao = r;
    this.seletor.fixar(); // a partir daqui, só esta pessoa é acompanhada
    this.emitir({ tipo: 'calibracao', calibracao: r });
    this.#falar('Calibração feita.');
    this.#avancar();
  }

  #emAguardando(quadro) {
    if (!quadro) { this.marcas.pose = null; return this.#dica('sem_pessoa', 'Não estou te vendo. Volte para a frente da câmera.'); }
    const d = this.def;
    const r = this.analisador.processar(quadro);
    this.ultimaAnalise = r;
    let problema = null;
    const vista = vistaDaCamera(quadro);
    if (!r.ok) problema = ['visibilidade', `Ajuste a câmera: não consigo ver bem ${this.#partes(r.ocultos)}.`];
    else if (d.vista_camera === 'lateral' && vista === 'frontal') problema = ['vista', 'Fique de lado para a câmera.'];
    else if (d.vista_camera === 'frontal' && vista === 'lateral') problema = ['vista', 'Fique de frente para a câmera.'];
    else if (!this.analisador.naPoseInicial()) {
      this.marcas.pose = null;
      if (this.t - this.marcas.entrada > 6) this.#dica('pose', `Fique na posição inicial. ${(d.dicas_inicio || [])[0] || ''}`.trim() + '.', 10);
      return;
    }
    if (problema) { this.marcas.pose = null; return this.#dica(problema[0], problema[1]); }
    this.dicaAtual = null;
    this.marcas.pose ??= this.t;
    if (this.t - this.marcas.pose >= this.cfg.pose_inicial_s) {
      this.#mudar('contagem');
      this.marcas.falou = this.cfg.contagem_s + 1;
    }
  }

  #partes(indices) {
    const nomes = [...new Set((indices || []).map(nomeDoPonto))];
    return nomes.length ? nomes.slice(0, 2).map((n) => `o ${n}`).join(' e ') : 'o corpo';
  }

  #emExecucao(quadro) {
    const r = this.analisador.processar(quadro);
    this.ultimaAnalise = r;
    if (!r.ok) {
      this.marcas.semVisao ??= this.t;
      if (this.t - this.marcas.semVisao > 1.5) this.#dica('visibilidade', `Não consigo ver bem ${this.#partes(r.ocultos)}. Ajuste a posição.`, 8);
      return;
    }
    this.marcas.semVisao = null;
    this.dicaAtual = null;
    for (const e of r.eventos) {
      this.marcas.atividade = this.t;
      if (e.tipo !== 'rep') continue;
      this.est.registrar(e.rep);
      this.maxInvalidasSeguidas = Math.max(this.maxInvalidasSeguidas, this.est.invalidasSeguidas());
      const fala = this.coach.aoRepetir(e.rep, this.est, this.t);
      if (!e.rep.valida) {
        const pts = e.rep.erros[0]?.pontos || r.pontosChave;
        this.pontosErro = { pontos: pts, ate: this.t + 1.5 };
      }
      this.emitir({ tipo: 'rep', rep: e.rep, total: this.est.total, validas: this.est.validas, invalidas: this.est.invalidas, fala });
      this.#falar(fala.texto, fala.tipo === 'seguranca' ? 'alta' : fala.tipo === 'contagem' ? 'baixa' : 'normal', fala.tipo);
      if (this.est.total >= this.passo.alvo) return this.#fimDaSerie('meta');
    }
    const ref = this.marcas.atividade ?? this.marcas.entrada;
    if (this.est.total > 0 && !this.analisador.emAndamento && this.t - ref >= this.cfg.ocioso_s) {
      // Parou depois de fazer repetições, antes da meta: pergunta a causa por voz.
      this.#mudar('pergunta_causa');
      this.#falar('Você parou antes da meta. Foi falha ou dor?', 'normal', 'pergunta');
    } else if (this.est.total === 0 && this.t - ref >= 20) {
      this.marcas.atividade = this.t;
      this.#dica('comece', 'Quando estiver pronta, pode começar.', 15);
    }
  }

  // ---------------------------------------------------------------- séries

  /** Registra a série encerrada, calcula a sugestão de ajuste e avisa a interface. */
  #registrarSerie(termino) {
    const p = this.passo;
    const resumo = this.est.resumo();
    const serie = {
      exercicioId: p.exercicioId, nome: p.nome, itemIdx: p.itemIdx, serie: p.serie, totalSeries: p.totalSeries,
      alvo: p.alvo, carga_kg: p.carga_kg, drop: !!p.drop, metodo: p.metodo, termino,
      total: resumo.total, validas: resumo.validas, invalidas: resumo.invalidas,
      erros: resumo.erros, fadiga: resumo.fadiga, assimetria: resumo.assimetria,
      cadencia_media: resumo.cadencia_media, cadencia_planejada: p.cadencia_s, rom_medio: resumo.rom_medio,
      reps: this.est.reps.map((r) => ({ n: r.n, valida: r.valida, completa: r.completa, erros: r.erros.map((e) => ({ id: e.id, medido: e.medido, configurado: e.configurado })), rom: r.rom, tc: r.tempo_concentrica, te: r.tempo_excentrica, v: r.velocidade_concentrica })),
      t: this.t,
    };
    this.series.push(serie);

    const proximo = this.plano[this.idx + 1] || null;
    const restam = this.plano.slice(this.idx + 1).some((x) => x.tipo === 'serie' && x.itemIdx === p.itemIdx);
    this.sugestao = null;
    if (restam && !['dor', 'parada', 'pulou'].includes(termino)) {
      const ruim = this.maxInvalidasSeguidas >= this.est.lim.serie_ruim_reps || resumo.fadiga.nivel === 'encerrar' || (termino === 'falha' && resumo.total < 0.7 * p.alvo);
      if (ruim && p.carga_kg > 0) {
        const nova = Math.min(arredondarCarga(p.carga_kg * 0.9), p.carga_kg - 0.5);
        this.sugestao = { tipo: 'reduzir_carga', valor: nova, origem: 'motor', texto: `Quer que eu reduza a carga para ${kg(nova)} nas próximas séries? Diga sim ou não.` };
      } else if (ruim) {
        this.sugestao = { tipo: 'aumentar_descanso', valor: 30, origem: 'motor', texto: 'Quer mais 30 segundos de descanso entre as séries? Diga sim ou não.' };
      }
    }
    this.emitir({ tipo: 'serie_fim', serie, restamSeriesDoExercicio: restam, proximo });
    return { resumo, proximo };
  }

  #fimDaSerie(termino, { silencioso = false } = {}) {
    const p = this.passo;
    const { resumo, proximo } = this.#registrarSerie(termino);
    const falas = [];
    if (!silencioso) falas.push(this.coach.resumoDaSerie(resumo, this.def));
    if (!proximo) { this.#falar(falas.join(' ')); return this.#concluir(true); }
    if (p.descanso_s > 0) {
      falas.push(`Descanse ${p.descanso_s} segundos.`);
      falas.push(proximo.tipo === 'serie' ? `Depois: ${proximo.nome}, série ${proximo.serie} de ${proximo.totalSeries}.` : `Depois: ${proximo.nome}.`);
      if (this.sugestao) falas.push(this.sugestao.texto);
      this.#falar(falas.join(' '));
      const sug = this.sugestao;
      this.#mudar('descanso');
      this.sugestao = sug;
      this.marcas.duracao = p.descanso_s;
    } else {
      this.#falar(falas.join(' '));
      this.#avancar();
    }
  }

  /** Aplica um ajuste de ficha (do motor ou do agente) às séries restantes do exercício. Só reduz esforço. */
  #aplicarSugestao(s) {
    const p = this.plano[this.idx];
    const restantes = this.plano.slice(this.idx + 1).filter((x) => x.tipo === 'serie' && x.itemIdx === p?.itemIdx);
    if (s.tipo === 'reduzir_carga') restantes.forEach((x) => { x.carga_kg = s.valor; });
    else if (s.tipo === 'aumentar_descanso') {
      restantes.forEach((x) => { if (x.descanso_s > 0) x.descanso_s += s.valor; });
      if (this.estado === 'descanso') this.marcas.duracao += s.valor;
    } else if (s.tipo === 'encerrar_exercicio') {
      this.plano = this.plano.filter((x, i) => i <= this.idx || !(x.tipo === 'serie' && x.itemIdx === p?.itemIdx));
    }
    this.ajustes.push({ tipo: s.tipo, valor: s.valor ?? null, origem: s.origem, exercicioId: p?.exercicioId, t: this.t });
  }

  /**
   * Sugestão vinda do agente de linguagem. Só é aceita dentro de limites conservadores
   * e sempre depende da confirmação da pessoa. O agente não altera regras de exercício.
   */
  sugestaoDoAgente(s) {
    if (this.estado !== 'descanso' || this.sugestao || !s) return false;
    const p = this.passo;
    if (!p || p.tipo !== 'serie') return false;
    if (s.tipo === 'reduzir_carga') {
      if (!(p.carga_kg > 0) || !(s.valor >= p.carga_kg * 0.7 && s.valor < p.carga_kg)) return false;
      const v = arredondarCarga(s.valor);
      this.sugestao = { tipo: 'reduzir_carga', valor: v, origem: 'agente', texto: `Quer que eu reduza a carga para ${kg(v)}? Diga sim ou não.` };
    } else if (s.tipo === 'aumentar_descanso') {
      if (!(s.valor >= 15 && s.valor <= 60)) return false;
      this.sugestao = { tipo: 'aumentar_descanso', valor: Math.round(s.valor), origem: 'agente', texto: `Quer mais ${Math.round(s.valor)} segundos de descanso? Diga sim ou não.` };
    } else if (s.tipo === 'encerrar_exercicio') {
      this.sugestao = { tipo: 'encerrar_exercicio', origem: 'agente', texto: 'Quer encerrar este exercício por hoje? Diga sim ou não.' };
    } else return false;
    this.#falar(this.sugestao.texto, 'normal', 'pergunta');
    return true;
  }

  // ---------------------------------------------------------------- tempo

  tique(t) {
    this.t = t;
    const m = this.marcas;
    if (this.estado === 'contagem') {
      const resta = Math.ceil(this.cfg.contagem_s - (t - m.entrada));
      if (resta > 0 && resta < m.falou) { m.falou = resta; this.#falar(String(resta), 'normal', 'contagem'); }
      if (t - m.entrada >= this.cfg.contagem_s) {
        this.analisador.reiniciar();
        this.#mudar('executando');
        this.#falar('Vai!', 'normal', 'contagem');
      }
    } else if (this.estado === 'descanso') {
      const resta = m.duracao - (t - m.entrada);
      if (resta <= 10 && m.duracao > 15 && !m.avisou10) { m.avisou10 = true; this.#falar('Dez segundos.', 'baixa'); }
      if (resta <= 0) this.#avancar();
    } else if (this.estado === 'aquecimento') {
      if (t - m.entrada >= this.passo.duracao_s) { this.#falar('Pronto.', 'baixa'); this.#avancar(); }
    } else if (this.estado === 'pergunta_causa') {
      if (t - m.entrada >= this.cfg.resposta_s) this.#fimDaSerie('nao_informado');
    }
  }

  // ---------------------------------------------------------------- pausa

  #pausar(motivo, fala) {
    if (this.estado === 'pausado' || this.estado === 'concluido') return;
    this.pausa = { motivo, estado: this.estado, marcas: { ...this.marcas }, t: this.t };
    this.estado = 'pausado';
    this.marcas = { entrada: this.t };
    this.emitir({ tipo: 'estado', estado: 'pausado', motivo });
    this.#falar(fala, motivo === 'dor' ? 'alta' : 'normal');
  }

  #retomar() {
    const p = this.pausa;
    if (!p) return;
    this.pausa = null;
    if (p.motivo === 'dor') {
      // Depois de dor, o exercício não é retomado: segue para o próximo.
      const item = this.passo?.itemIdx;
      this.plano = this.plano.filter((x, i) => i <= this.idx || !(x.tipo === 'serie' && x.itemIdx === item));
      this.#falar('Certo. Vamos deixar esse exercício por hoje.');
      return this.#avancar();
    }
    if (p.motivo === 'parada') {
      const proximo = this.plano[this.idx + 1];
      if (!proximo) return this.#concluir(true);
      this.#falar('Vamos seguir.');
      return this.#avancar();
    }
    const decorrido = p.t - (p.marcas.entrada ?? p.t);
    this.estado = p.estado;
    this.marcas = { ...p.marcas, entrada: this.t - decorrido, atividade: this.t, semPessoa: null, pose: null, semVisao: null };
    if (p.estado === 'contagem') { this.estado = 'aguardando_pose'; this.marcas = { entrada: this.t }; }
    if (p.estado === 'executando') this.analisador.maquina.abortar();
    this.emitir({ tipo: 'estado', estado: this.estado });
    this.#falar(p.estado === 'executando' ? 'Continuando. Pode seguir de onde parou.' : 'Continuando.');
  }

  // ---------------------------------------------------------------- comandos

  /** @param c { tipo, valor? }  @returns true se o comando foi aceito neste estado */
  comando(c, t = this.t) {
    this.t = t;
    if (!c || this.estado === 'concluido') return false;
    const e = this.estado;
    switch (c.tipo) {
      case 'dor': return this.#interromper('dor');
      case 'parar': return this.#interromper('parada');
      case 'terminar':
        if (this.#serieAberta() && this.est.total > 0) this.#registrarSerie('pulou');
        this.#concluir(false);
        return true;
      case 'pausar':
        if (e === 'pausado') return false;
        this.#pausar('usuario', 'Pausado. Diga continuar quando quiser voltar.');
        return true;
      case 'continuar':
        if (e !== 'pausado') return false;
        this.#retomar();
        return true;
      case 'proximo': return this.#proximo();
      case 'repetir': return this.#repetir();
      case 'carga': return this.#carga(c.valor);
      case 'falha':
        if (e !== 'pergunta_causa') return false;
        this.#fimDaSerie('falha');
        return true;
      case 'sim': case 'nao':
        if (!this.sugestao) return false;
        if (c.tipo === 'sim') { this.#aplicarSugestao(this.sugestao); this.#falar('Combinado, ajustei.'); } else this.#falar('Tudo bem, mantemos como está.');
        this.sugestao = null;
        return true;
      default: return false;
    }
  }

  #serieAberta() {
    const e = this.estado === 'pausado' ? this.pausa?.estado : this.estado;
    return ['executando', 'pergunta_causa'].includes(e);
  }

  /** "Dor" ou "parar": interrompe imediatamente e registra o evento. */
  #interromper(motivo) {
    const emSerie = this.#serieAberta();
    const p = this.passo;
    this.eventos.push({
      tipo: motivo, t: this.t, exercicioId: p?.exercicioId || null, serie: p?.serie || null,
      repeticao: emSerie ? this.est?.total ?? 0 : null, carga_kg: p?.carga_kg ?? null,
    });
    if (emSerie) this.#registrarSerie(motivo);
    this.sugestao = null;
    this.pausa = { motivo, estado: 'interrompido', marcas: {}, t: this.t };
    this.estado = 'pausado';
    this.marcas = { entrada: this.t };
    this.emitir({ tipo: 'estado', estado: 'pausado', motivo });
    this.#falar(motivo === 'dor'
      ? 'Parei. Dor não faz parte do treino. Se ela continuar, encerre por hoje e procure um profissional de saúde. Diga continuar para ir ao próximo exercício, ou terminar treino.'
      : 'Série interrompida. Está tudo bem? Se sentiu dor, diga dor. Para seguir, diga continuar.', 'alta', 'seguranca');
    return true;
  }

  #proximo() {
    switch (this.estado) {
      case 'aquecimento': this.#avancar(); return true;
      case 'descanso': this.#avancar(); return true;
      case 'aguardando_pose': case 'contagem': this.#fimDaSerie('pulou', { silencioso: true }); return true;
      case 'executando': this.#fimDaSerie(this.est.total >= this.passo.alvo ? 'meta' : 'pulou'); return true;
      case 'pergunta_causa': this.#fimDaSerie('nao_informado'); return true;
      case 'preparo': case 'calibracao': this.#falar('Pulando a calibração.'); this.#avancar(); return true;
      default: return false;
    }
  }

  #repetir() {
    const e = this.estado;
    if (['aguardando_pose', 'contagem', 'executando', 'pergunta_causa'].includes(e)) {
      this.#falar('Vamos recomeçar esta série.');
      this.#prepararSerie(false);
      return true;
    }
    if (e === 'descanso' && this.series.length) {
      this.series.pop();
      this.#falar('Vamos repetir a série.');
      this.#prepararSerie(false);
      return true;
    }
    return false;
  }

  #carga(valor) {
    const p = this.estado === 'descanso' ? this.plano[this.idx] : this.passo;
    if (!p || p.tipo !== 'serie' || !(valor >= 0)) return false;
    const item = p.itemIdx;
    this.plano.forEach((x, i) => { if (i >= this.idx && x.tipo === 'serie' && x.itemIdx === item && !x.drop) x.carga_kg = valor; });
    // No descanso, "carga 10" corrige a carga da série que acabou de ser feita.
    const ultima = this.series[this.series.length - 1];
    if (this.estado === 'descanso' && ultima && ultima.itemIdx === item) ultima.carga_kg = valor;
    this.#falar(`Carga registrada: ${kg(valor)}.`);
    return true;
  }

  // ---------------------------------------------------------------- saída

  /** Estado para a interface. */
  visao() {
    const p = this.passo, m = this.marcas;
    let restante = null;
    if (this.estado === 'descanso') restante = Math.max(0, m.duracao - (this.t - m.entrada));
    else if (this.estado === 'aquecimento') restante = Math.max(0, p.duracao_s - (this.t - m.entrada));
    else if (this.estado === 'contagem') restante = Math.max(0, this.cfg.contagem_s - (this.t - m.entrada));
    else if (this.estado === 'calibracao') restante = Math.max(0, this.cfg.calibracao_s * (1 - this.calibrador.progresso));
    const a = this.ultimaAnalise;
    return {
      estado: this.estado,
      motivoPausa: this.pausa?.motivo || null,
      passo: p,
      proximo: this.plano[this.idx + 1] || null,
      progresso: this.plano.length ? Math.max(0, this.idx) / this.plano.length : 0,
      total: this.est?.total ?? 0,
      validas: this.est?.validas ?? 0,
      invalidas: this.est?.invalidas ?? 0,
      fase: a?.fase ?? null,
      restante,
      dica: this.dicaAtual,
      sugestao: this.sugestao,
      pontos: this.pontosAtuais,
      pontosChave: a?.pontosChave || [],
      pontosErro: this.t < this.pontosErro.ate ? this.pontosErro.pontos : null,
      visivel: a ? a.ok : true,
    };
  }

  resultado(completo = this.estado === 'concluido') {
    const fim = this.fim ?? this.t;
    return {
      fichaId: this.ficha.id, fichaNome: this.ficha.nome, divisao: this.ficha.divisao || null,
      duracao_s: Math.round(fim - (this.inicio ?? fim)),
      completo,
      series: this.series,
      eventos: this.eventos,
      ajustes: this.ajustes,
      calibracao: this.calibracao,
    };
  }
}
