// Fidelidade do agente de linguagem (Quadro 4): toda fala do agente precisa se apoiar em um
// fato detectado pelo motor de visão ou em uma regra do exercício. Aqui se calcula a lista de
// fatos que o agente pode citar e se confere a resposta. Usado no servidor e no navegador.

/** Fatos que o contexto autoriza o agente a mencionar. */
export function fatosPermitidos(tipo, ctx) {
  const f = new Set();
  const daSerie = (s) => {
    if (!s) return;
    f.add('contagem');
    if (s.termino && s.termino !== 'meta') f.add('termino');
    for (const [id, n] of Object.entries(s.erros || {})) if (n > 0) f.add(`erro:${id}`);
    if (s.fadiga && s.fadiga.nivel && s.fadiga.nivel !== 'nenhum') f.add('fadiga');
    if (s.assimetria?.excede) f.add('assimetria');
    if (s.cadencia_media && s.cadencia_planejada) f.add('cadencia');
    if (s.carga_kg > 0) f.add('carga');
  };
  if (tipo === 'entre_series') daSerie(ctx.serie);
  if (tipo === 'comando_livre') { daSerie(ctx.serie); f.add('pergunta'); }
  if (tipo === 'relatorio') {
    for (const s of ctx.treino?.series || []) daSerie(s);
    if ((ctx.treino?.eventos || []).some((e) => e.tipo === 'dor')) f.add('dor');
    if ((ctx.treino?.ajustes || []).length) f.add('ajuste');
    if (ctx.constancia) f.add('constancia');
    f.add('duracao');
  }
  return [...f];
}

/**
 * Confere a resposta do agente.
 * @returns { ok, motivo } — ok = false significa "fala sem base": deve ser descartada e contada.
 */
export function conferirResposta(tipo, ctx, resp) {
  const permitidos = new Set(fatosPermitidos(tipo, ctx));
  const base = Array.isArray(resp?.base) ? resp.base : [];
  const textos = tipo === 'relatorio' ? [resp?.resumo, ...(resp?.destaques || []), ...(resp?.atencao || []), resp?.proximo_passo] : [resp?.fala];
  const temFala = textos.some((t) => typeof t === 'string' && t.trim());
  if (!temFala) return { ok: false, motivo: 'vazia' };
  if (!base.length) return { ok: false, motivo: 'sem_base' };
  const fora = base.filter((b) => !permitidos.has(b));
  if (fora.length) return { ok: false, motivo: `base_desconhecida:${fora.join(',')}` };
  return { ok: true, motivo: null };
}
