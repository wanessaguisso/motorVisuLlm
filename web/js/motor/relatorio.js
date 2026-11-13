// Relatório pós-treino e histórico (RF10). Destaca a constância e a evolução gradual,
// e não só repetições e erros (diretriz do caso principal, seção 3.2).

const DIA = 86400000;

function inicioDaSemana(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda-feira
  return d.getTime();
}

/** Frequência de treinos: na semana, em 30 dias e semanas seguidas com ao menos um treino. */
export function constancia(historico, agora = Date.now()) {
  const datas = historico.map((t) => t.data).filter((x) => typeof x === 'number');
  const semana = inicioDaSemana(agora);
  const semanas = new Set(datas.map(inicioDaSemana));
  let seguidas = 0;
  // A semana atual ainda em aberto não quebra a sequência.
  let cursor = semanas.has(semana) ? semana : semana - 7 * DIA;
  while (semanas.has(inicioDaSemana(cursor + DIA))) { seguidas++; cursor -= 7 * DIA; }
  return {
    treinos_na_semana: datas.filter((d) => d >= semana).length,
    treinos_em_30_dias: datas.filter((d) => d >= agora - 30 * DIA).length,
    semanas_seguidas: seguidas,
    total: datas.length,
  };
}

/** Agrupa as séries do treino por exercício. */
export function porExercicio(treino) {
  const mapa = new Map();
  for (const s of treino.series || []) {
    const e = mapa.get(s.exercicioId) || { exercicioId: s.exercicioId, nome: s.nome, series: [], total: 0, validas: 0, erros: {} };
    e.series.push(s); e.total += s.total; e.validas += s.validas;
    for (const [id, n] of Object.entries(s.erros || {})) e.erros[id] = (e.erros[id] || 0) + n;
    mapa.set(s.exercicioId, e);
  }
  return [...mapa.values()];
}

export function totais(treino) {
  const ss = treino.series || [];
  const total = ss.reduce((a, s) => a + s.total, 0), validas = ss.reduce((a, s) => a + s.validas, 0);
  return { series: ss.length, total, validas, invalidas: total - validas, pct_validas: total ? Math.round((validas / total) * 100) : null };
}

/** Relatório padronizado, usado quando o agente de linguagem não está disponível. */
export function relatorioLocal(treino, biblioteca, kons) {
  const t = totais(treino);
  const destaques = [], atencao = [];
  const resumo = [];
  resumo.push(treino.completo ? 'Treino concluído. Você veio e fez a sua parte, e é isso que constrói o hábito.' : 'Treino encerrado antes do fim, e tudo bem: o que você fez hoje já conta.');
  if (t.total) resumo.push(`Foram ${t.total} repetições em ${t.series} ${t.series === 1 ? 'série' : 'séries'}, ${t.validas} com boa técnica.`);
  if (kons?.treinos_na_semana > 1) destaques.push(`Este foi o seu ${kons.treinos_na_semana}º treino da semana.`);
  if (kons?.semanas_seguidas > 1) destaques.push(`${kons.semanas_seguidas} semanas seguidas treinando.`);
  for (const e of porExercicio(treino)) {
    if (e.total && e.validas === e.total) destaques.push(`${e.nome}: todas as repetições com boa técnica.`);
    const pior = Object.entries(e.erros).sort((a, b) => b[1] - a[1])[0];
    if (pior && pior[1] >= 2) {
      const regra = (biblioteca[e.exercicioId]?.regras_erro || []).find((r) => r.id === pior[0]);
      atencao.push(`${e.nome}: ${regra ? regra.fala : 'faça o movimento completo.'} (${pior[1]} vezes)`);
    }
    const ass = e.series.map((s) => s.assimetria).find((a) => a?.excede);
    if (ass) atencao.push(`${e.nome}: o lado ${ass.lado_menor} teve amplitude ${Math.round(ass.amplitude_pct)}% menor.`);
  }
  if ((treino.eventos || []).some((e) => e.tipo === 'dor')) atencao.unshift('Você relatou dor durante o treino. Se ela continuar, procure um profissional de saúde antes de voltar a esse exercício.');
  return {
    resumo: resumo.join(' '),
    destaques: destaques.slice(0, 3),
    atencao: atencao.slice(0, 3),
    proximo_passo: atencao.length ? 'No próximo treino, escolha um desses pontos e foque só nele.' : 'Repita este treino no próximo dia combinado. Constância vem antes de carga.',
    origem: 'padronizado',
  };
}
