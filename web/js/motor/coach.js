// Coach, camada imediata (seção 3.9): decide o que falar a cada repetição a partir das frases
// padronizadas do exercício. Funciona sem conexão. Regras:
//  - prioridade: segurança > técnica > cadência > motivação;
//  - no máximo uma correção por repetição, com intervalo mínimo entre falas;
//  - o mesmo aviso não se repete mais de duas vezes seguidas;
//  - três repetições inválidas seguidas levam à sugestão de reduzir a carga ou pausar.

export const PRIORIDADE = { seguranca: 0, tecnica: 1, cadencia: 2, motivacao: 3, contagem: 4 };

const FALAS_CADENCIA = {
  descida_rapida: 'Desça mais devagar, controlando o peso.',
  subida_rapida: 'Suba com mais controle.',
};
const ELOGIOS = ['Boa!', 'Isso mesmo!', 'Ótimo ritmo!', 'Muito bem!'];

export class Coach {
  constructor({ intervaloMinimo = 2.5, maxRepeticoesSeguidas = 2 } = {}) {
    this.intervaloMinimo = intervaloMinimo;
    this.maxRep = maxRepeticoesSeguidas;
    this.novaSerie();
  }

  novaSerie() {
    this.tUltimaFala = -Infinity;
    this.ultimoAviso = null;
    this.repeticoesDoAviso = 0;
    this.avisou = new Set();
    this.elogio = 0;
  }

  /**
   * @param rep repetição classificada
   * @param est EstatisticasDaSerie (já com a repetição registrada)
   * @param t instante atual (s)
   * @returns { texto, tipo, id, prioridade, pontos } — sempre devolve ao menos a contagem
   */
  aoRepetir(rep, est, t) {
    const candidatos = [];
    for (const e of rep.erros) {
      candidatos.push({ texto: e.fala, tipo: e.severidade, id: e.id, prioridade: PRIORIDADE[e.severidade], pontos: e.pontos });
    }
    const fad = est.fadiga();
    if (fad.nivel === 'encerrar' && !this.avisou.has('fadiga_encerrar')) {
      candidatos.push({ texto: 'Sua velocidade caiu bastante. Pode encerrar a série por aqui, você já fez um bom trabalho.', tipo: 'seguranca', id: 'fadiga_encerrar', prioridade: PRIORIDADE.seguranca, unico: true });
    } else if (fad.nivel === 'aviso' && !this.avisou.has('fadiga_aviso')) {
      candidatos.push({ texto: 'O ritmo está caindo. Mantenha a técnica, sem pressa.', tipo: 'tecnica', id: 'fadiga_aviso', prioridade: PRIORIDADE.tecnica + 0.5, unico: true });
    }
    if (est.invalidasSeguidas() >= est.lim.serie_ruim_reps && !this.avisou.has('serie_ruim')) {
      candidatos.push({ texto: 'Está difícil manter a técnica. Que tal reduzir a carga ou fazer uma pausa?', tipo: 'tecnica', id: 'serie_ruim', prioridade: PRIORIDADE.tecnica - 0.5, unico: true });
    }
    const ass = est.assimetria();
    if (ass?.excede && !this.avisou.has('assimetria')) {
      candidatos.push({ texto: `O lado ${ass.lado_menor} está subindo menos. Tente igualar os dois lados.`, tipo: 'tecnica', id: 'assimetria', prioridade: PRIORIDADE.tecnica + 0.6, unico: true });
    }
    const cad = est.cadenciaDaUltima();
    if (cad) candidatos.push({ texto: FALAS_CADENCIA[cad.id], tipo: 'cadencia', id: cad.id, prioridade: PRIORIDADE.cadencia });
    if (rep.valida && est.validasSeguidas() > 0 && est.validasSeguidas() % 4 === 0) {
      candidatos.push({ texto: ELOGIOS[this.elogio++ % ELOGIOS.length], tipo: 'motivacao', id: 'elogio', prioridade: PRIORIDADE.motivacao });
    }
    candidatos.sort((a, b) => a.prioridade - b.prioridade);

    const contagem = { texto: String(est.total), tipo: 'contagem', id: 'contagem', prioridade: PRIORIDADE.contagem, pontos: rep.erros[0]?.pontos ?? null };
    const urgente = (c) => c.tipo === 'seguranca';
    for (const c of candidatos) {
      const repetido = c.id === this.ultimoAviso && this.repeticoesDoAviso >= this.maxRep;
      if (repetido && !urgente(c)) continue;                                   // não vira ruído
      if (t - this.tUltimaFala < this.intervaloMinimo && !urgente(c)) continue; // intervalo mínimo
      this.tUltimaFala = t;
      if (c.tipo !== 'motivacao' && !c.unico) {
        this.repeticoesDoAviso = c.id === this.ultimoAviso ? this.repeticoesDoAviso + 1 : 1;
        this.ultimoAviso = c.id;
      }
      if (c.unico) this.avisou.add(c.id);
      return c;
    }
    if (rep.valida) { this.ultimoAviso = null; this.repeticoesDoAviso = 0; }
    return contagem;
  }

  /** Resumo falado ao fim da série: reconhece o que foi bem feito antes de corrigir. */
  resumoDaSerie(resumo, definicao) {
    const { total, validas, invalidas, erros } = resumo;
    if (total === 0) return 'Série encerrada sem repetições. Tudo bem, a gente tenta de novo.';
    const partes = [];
    const alvo = resumo.alvo || total;
    const abre = total >= alvo ? 'Série concluída.' : 'Série encerrada antes da meta, e tudo bem.';
    if (invalidas === 0) partes.push(`${abre} ${total} de ${alvo}, todas com boa técnica.${total >= alvo ? ' Parabéns!' : ''}`);
    else {
      partes.push(`${abre} ${total} de ${alvo}, ${invalidas} com erro.`);
      if (validas > 0) partes.push(`Você acertou ${validas}.`);
      const principal = Object.entries(erros).sort((a, b) => b[1] - a[1])[0];
      const regra = principal && (definicao.regras_erro || []).find((r) => r.id === principal[0]);
      if (regra) partes.push(`Na próxima, atenção: ${regra.fala}`);
    }
    return partes.join(' ');
  }
}
