// Ficha de treino (seção 3.5): modelo de dados, expansão em passos e progressão de carga.

export const AQUECIMENTOS = {
  rotacao_ombros: { nome: 'Rotação de ombros', duracao_s: 30, instrucao: 'Gire os ombros para trás em círculos amplos e lentos.' },
  polichinelo_leve: { nome: 'Polichinelo leve', duracao_s: 30, instrucao: 'Polichinelos em ritmo leve, só para aquecer.' },
  marcha_parada: { nome: 'Marcha parada', duracao_s: 40, instrucao: 'Marche no lugar, elevando os joelhos sem pressa.' },
  rotacao_quadril: { nome: 'Rotação de quadril', duracao_s: 30, instrucao: 'Mãos na cintura, gire o quadril em círculos, para os dois lados.' },
  agachamento_sem_peso: { nome: 'Agachamento sem peso', duracao_s: 30, instrucao: 'Agachamentos curtos e lentos, sem carga, para soltar os joelhos.' },
};

export const METODOS = ['normal', 'bi-set', 'drop-set'];

const arred = (kg) => Math.max(0, Math.round(kg * 2) / 2);

export function novoItem(exercicioId, nivel = 'iniciante') {
  return {
    exercicio: exercicioId,
    series: nivel === 'iniciante' ? 2 : 3,
    repeticoes: nivel === 'iniciante' ? 10 : 12,
    carga_kg: 0,
    cadencia_s: { subida: 1, pausa_topo: 1, descida: 2 },
    descanso_s: 60,
    metodo: 'normal',
    lados: 'ambos',
  };
}

export function validarFicha(ficha, biblioteca) {
  const p = [];
  if (!ficha?.nome?.trim()) p.push('Dê um nome à ficha.');
  if (!Array.isArray(ficha?.itens) || !ficha.itens.length) p.push('Adicione ao menos um exercício.');
  for (const [i, it] of (ficha?.itens || []).entries()) {
    const n = i + 1;
    if (!biblioteca[it.exercicio]) p.push(`Item ${n}: exercício desconhecido.`);
    if (!(it.series >= 1 && it.series <= 10)) p.push(`Item ${n}: séries entre 1 e 10.`);
    if (!(it.repeticoes >= 1 && it.repeticoes <= 50)) p.push(`Item ${n}: repetições entre 1 e 50.`);
    if (!(it.carga_kg >= 0 && it.carga_kg <= 300)) p.push(`Item ${n}: carga entre 0 e 300 kg.`);
    if (!(it.descanso_s >= 0 && it.descanso_s <= 600)) p.push(`Item ${n}: descanso entre 0 e 600 s.`);
    if (!METODOS.includes(it.metodo)) p.push(`Item ${n}: método inválido.`);
  }
  return p;
}

/** Expande a ficha na sequência de passos da sessão (aquecimento e séries). */
export function montarPlano(ficha, biblioteca) {
  const passos = [];
  for (const id of ficha.aquecimento || []) {
    const a = AQUECIMENTOS[id];
    if (a) passos.push({ tipo: 'aquecimento', id, ...a });
  }
  const serie = (it, itemIdx, n, total, extra = {}) => ({
    tipo: 'serie', itemIdx, exercicioId: it.exercicio, nome: biblioteca[it.exercicio].nome,
    serie: n, totalSeries: total, alvo: it.repeticoes, carga_kg: it.carga_kg,
    descanso_s: it.descanso_s, cadencia_s: it.cadencia_s || null, lados: it.lados || 'ambos', metodo: it.metodo, ...extra,
  });
  const itens = ficha.itens;
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    if (!biblioteca[it.exercicio]) continue;
    const par = it.metodo === 'bi-set' && itens[i + 1] && biblioteca[itens[i + 1].exercicio] ? itens[i + 1] : null;
    if (par) {
      // Bi-set: os dois exercícios em sequência, sem descanso entre eles.
      const n = Math.max(it.series, par.series);
      for (let s = 1; s <= n; s++) {
        if (s <= it.series) passos.push(serie(it, i, s, it.series, { descanso_s: s <= par.series ? 0 : it.descanso_s }));
        if (s <= par.series) passos.push(serie(par, i + 1, s, par.series, { descanso_s: it.descanso_s }));
      }
      i++;
      continue;
    }
    for (let s = 1; s <= it.series; s++) {
      const ultima = s === it.series;
      if (it.metodo === 'drop-set' && ultima && it.carga_kg > 0) {
        // Drop set: após a última série, mais uma com carga reduzida, sem descanso.
        passos.push(serie(it, i, s, it.series + 1, { descanso_s: 0 }));
        passos.push(serie(it, i, s + 1, it.series + 1, { carga_kg: arred(it.carga_kg * 0.8), drop: true }));
      } else passos.push(serie(it, i, s, it.series));
    }
  }
  return passos;
}

/**
 * Progressão conservadora: se a pessoa completou todas as séries com repetições válidas
 * em duas sessões seguidas, com a mesma carga, sugere aumentar.
 * @param historico treinos do mais antigo ao mais recente
 */
export function sugerirProgressao(historico, exercicioId, biblioteca) {
  const sessoes = [];
  for (const treino of historico) {
    const ss = (treino.series || []).filter((s) => s.exercicioId === exercicioId && !s.drop);
    if (ss.length) sessoes.push(ss);
  }
  if (sessoes.length < 2) return null;
  const [a, b] = sessoes.slice(-2);
  const completa = (ss) => ss.every((s) => s.termino === 'meta' && s.validas >= s.alvo);
  const carga = b[0].carga_kg;
  if (!completa(a) || !completa(b) || a[0].carga_kg !== carga) return null;
  const nome = biblioteca[exercicioId]?.nome || exercicioId;
  if (carga > 0) {
    const nova = arred(carga + (carga < 10 ? 1 : carga * 0.1));
    return { exercicioId, tipo: 'carga', de: carga, para: nova, texto: `${nome}: duas sessões completas com boa técnica. Que tal subir de ${carga} kg para ${nova} kg?` };
  }
  return { exercicioId, tipo: 'repeticoes', de: b[0].alvo, para: b[0].alvo + 2, texto: `${nome}: duas sessões completas com boa técnica. Que tal fazer ${b[0].alvo + 2} repetições por série?` };
}

/** Exercícios que a pessoa pode fazer com o equipamento que tem; sinaliza os que tocam uma lesão. */
export function filtrarBiblioteca(biblioteca, perfil) {
  const tem = new Set(['peso_do_corpo', ...(perfil?.equipamento || [])]);
  const lesoes = new Set(perfil?.lesoes || []);
  return Object.values(biblioteca)
    .filter((d) => (d.equipamento || []).every((e) => tem.has(e)))
    .map((d) => ({ def: d, alerta: (d.contraindicacoes || []).filter((r) => lesoes.has(r)) }));
}

export { arred as arredondarCarga };
