// Agente de modelo de linguagem (seção 3.9). Conduz a conversa: prioriza e reformula as falas,
// sugere ajustes conservadores na ficha e escreve o relatório. Recebe APENAS resultados
// estruturados do motor de visão (nunca imagens) e não pode alterar as regras dos exercícios.

import Anthropic from '@anthropic-ai/sdk';
import { carregarBiblioteca } from '../web/js/motor/biblioteca-node.js';
import { fatosPermitidos, conferirResposta } from '../web/js/motor/fidelidade.js';

const MODELO = process.env.AGENTE_MODELO || 'claude-opus-5-5';
const biblioteca = carregarBiblioteca();
let cliente = null;

export const TIPOS = ['entre_series', 'relatorio', 'comando_livre'];

export function agenteDisponivel() {
  if (process.env.AGENTE_SIMULADO === '1') return true;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// ------------------------------------------------------------------ saneamento da entrada

const num = (v, min = 0, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : null);
const id = (v) => (typeof v === 'string' && /^[a-z0-9_-]{1,60}$/.test(v) ? v : null);
const enumerado = (v, lista) => (lista.includes(v) ? v : null);
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max).trim() : '');

function serieLimpa(s) {
  if (!s || typeof s !== 'object') return null;
  const def = biblioteca[id(s.exercicioId)];
  if (!def) return null;
  const regras = new Set(['ciclo_incompleto', ...def.regras_erro.map((r) => r.id)]);
  const erros = {};
  for (const [k, v] of Object.entries(s.erros || {})) if (regras.has(k) && num(v) > 0) erros[k] = num(v, 0, 100);
  const detalhes = [];
  for (const r of Array.isArray(s.reps) ? s.reps.slice(0, 60) : []) {
    for (const e of Array.isArray(r?.erros) ? r.erros : []) {
      if (regras.has(e?.id) && !detalhes.some((d) => d.erro === e.id)) detalhes.push({ erro: e.id, repeticao: num(r.n, 0, 100), medido: num(e.medido, -1e4, 1e4), configurado: num(e.configurado, -1e4, 1e4) });
    }
  }
  return {
    exercicioId: def.id, exercicio: def.nome,
    serie: num(s.serie, 1, 20), total_series: num(s.totalSeries, 1, 20),
    alvo: num(s.alvo, 0, 100), total: num(s.total, 0, 100), validas: num(s.validas, 0, 100), invalidas: num(s.invalidas, 0, 100),
    carga_kg: num(s.carga_kg, 0, 300),
    termino: enumerado(s.termino, ['meta', 'falha', 'dor', 'parada', 'pulou', 'nao_informado']),
    erros, detalhes,
    fadiga: s.fadiga ? { perda_velocidade_pct: num(s.fadiga.perda_velocidade_pct, 0, 100), queda_rom_pct: num(s.fadiga.queda_rom_pct, 0, 100), nivel: enumerado(s.fadiga.nivel, ['nenhum', 'aviso', 'encerrar']) } : null,
    assimetria: s.assimetria ? { amplitude_pct: num(s.assimetria.amplitude_pct, 0, 100), lado_menor: enumerado(s.assimetria.lado_menor, ['direito', 'esquerdo']), excede: s.assimetria.excede === true } : null,
    cadencia_media: s.cadencia_media ? { concentrica: num(s.cadencia_media.concentrica, 0, 60), excentrica: num(s.cadencia_media.excentrica, 0, 60) } : null,
    cadencia_planejada: s.cadencia_planejada ? { subida: num(s.cadencia_planejada.subida, 0, 60), descida: num(s.cadencia_planejada.descida, 0, 60) } : null,
  };
}

function perfilLimpo(p) {
  return {
    nivel: enumerado(p?.nivel, ['iniciante', 'intermediario', 'avancado']),
    objetivo: enumerado(p?.objetivo, ['hipertrofia', 'emagrecimento', 'condicionamento']),
  };
}

/** Reconstrói o contexto só com campos conhecidos: nada além de métricas sai do aparelho. */
export function sanear(tipo, c) {
  if (!TIPOS.includes(tipo) || !c || typeof c !== 'object') return null;
  if (tipo === 'entre_series') {
    const serie = serieLimpa(c.serie);
    if (!serie) return null;
    return { serie, perfil: perfilLimpo(c.perfil), restam_series_do_exercicio: c.restam === true, descanso_s: num(c.descanso_s, 0, 600), sugestao_do_motor: enumerado(c.sugestao_do_motor, ['reduzir_carga', 'aumentar_descanso']) };
  }
  if (tipo === 'comando_livre') {
    const t = texto(c.texto, 200);
    if (!t) return null;
    return { texto: t, estado: enumerado(c.estado, ['preparo', 'calibracao', 'aquecimento', 'aguardando_pose', 'contagem', 'executando', 'pergunta_causa', 'descanso', 'pausado']), serie: serieLimpa(c.serie), perfil: perfilLimpo(c.perfil) };
  }
  const tr = c.treino || {};
  const series = (Array.isArray(tr.series) ? tr.series.slice(0, 60) : []).map(serieLimpa).filter(Boolean);
  if (!series.length) return null;
  const k = c.constancia || {};
  return {
    treino: {
      duracao_min: num(tr.duracao_s / 60, 0, 600), completo: tr.completo === true, series,
      eventos: (Array.isArray(tr.eventos) ? tr.eventos.slice(0, 20) : []).map((e) => ({ tipo: enumerado(e?.tipo, ['dor', 'parada']), exercicio: biblioteca[id(e?.exercicioId)]?.nome || null })).filter((e) => e.tipo),
      ajustes: (Array.isArray(tr.ajustes) ? tr.ajustes.slice(0, 20) : []).map((a) => ({ tipo: enumerado(a?.tipo, ['reduzir_carga', 'aumentar_descanso', 'encerrar_exercicio']), valor: num(a?.valor, 0, 600) })).filter((a) => a.tipo),
    },
    constancia: { treinos_na_semana: num(k.treinos_na_semana, 0, 50), treinos_em_30_dias: num(k.treinos_em_30_dias, 0, 200), semanas_seguidas: num(k.semanas_seguidas, 0, 500) },
    perfil: perfilLimpo(c.perfil),
  };
}

// ------------------------------------------------------------------ instruções e formatos

const SISTEMA = `Você é a voz do coach de uma plataforma de treino de musculação em casa, usada em português do Brasil. A pessoa treina sozinha, com o celular apoiado a uns dois metros, e ouve suas falas por síntese de voz, muitas vezes com halteres nas mãos.

Como o sistema funciona, e por que isso limita o que você diz:
- Um motor de visão computacional, no aparelho da pessoa, acompanha o esqueleto e aplica regras fixas de cada exercício. Ele conta as repetições e classifica cada uma como válida ou inválida, com o motivo. Essas regras são a única fonte de verdade sobre a execução.
- Você não vê a pessoa nem o vídeo. Recebe só o resumo estruturado que o motor produziu. Por isso, fale apenas do que está nesse resumo. Não deduza erros que o motor não detectou, não invente correções e não mude critérios de execução: se uma repetição foi marcada como válida, ela é válida. Uma correção inventada pode ensinar o movimento errado e destrói a confiança da pessoa.
- Quando citar um erro, use o sentido da frase de correção cadastrada para ele (campo "fala" das regras). Você pode reformular com suas palavras, mas sem acrescentar instrução técnica nova.

Tom: acolhedor e encorajador. Muitas pessoas que usam a plataforma são sedentárias, começaram agora e não se sentem à vontade em academia. Reconheça primeiro o que foi bem feito, depois aponte no máximo um ponto de atenção, o mais importante (segurança antes de técnica, técnica antes de cadência). Nada de cobrança, culpa ou comparação. Constância importa mais que desempenho.

Forma: frases curtas, naturais para serem ouvidas, sem listas, sem emojis, sem símbolos e sem números com casas decimais. Trate a pessoa por "você".

Saúde: você não é profissional de saúde. Não dê diagnóstico nem prescrição. Se houver registro de dor, recomende parar aquele exercício e procurar um profissional de saúde se a dor continuar, sem alarmar.

No campo "base", liste os fatos do resumo em que sua fala se apoia, escolhendo somente entre os identificadores fornecidos em "fatos_permitidos". Uma fala sem base é descartada pelo sistema.`;

const POR_TIPO = {
  entre_series: `A pessoa acabou de terminar uma série e está descansando. Escreva em "fala" um comentário de uma a três frases curtas sobre essa série. O sistema já anunciou a contagem; não repita os números, a menos que ajudem.
Em "sugestao", proponha um ajuste só se os dados mostrarem dificuldade real (muitas repetições inválidas seguidas, fadiga em nível "encerrar", ou série interrompida por falha) e se ainda restarem séries desse exercício. Ajustes possíveis: "reduzir_carga" (valor = nova carga em kg, entre 70% e 100% da atual), "aumentar_descanso" (valor = segundos a mais, de 15 a 60) ou "encerrar_exercicio" (valor = 0). Caso contrário use "nenhuma" com valor 0. Você nunca aumenta carga durante a sessão. A pessoa confirma por voz antes de qualquer ajuste ser aplicado.`,
  relatorio: `O treino terminou. Escreva o relatório para ser lido na tela: "resumo" (duas a quatro frases, começando pelo que foi bem e valorizando a constância), "destaques" (até três pontos positivos apoiados nos dados), "atencao" (até dois pontos de atenção, só se os dados mostrarem; lista vazia se não houver) e "proximo_passo" (uma frase prática e pequena para o próximo treino).`,
  comando_livre: `Durante o treino, a pessoa disse algo que não é um comando conhecido; o texto veio do reconhecimento de voz e pode ter erros. Responda em "fala" com uma ou duas frases curtas. Se ela claramente quis um dos comandos do sistema, indique em "acao": "pausar", "continuar", "proximo", "repetir", "terminar", "dor" (qualquer menção a dor ou mal-estar) ou "nenhuma". Na dúvida, use "nenhuma" e diga quais comandos existem. Se a pergunta for sobre a execução, responda só com o que está no resumo da série; se não houver dado, diga que o sistema ainda não mediu isso. Para perguntas fora do treino, diga gentilmente que você só ajuda com o treino. Use o fato "pergunta" como base quando a resposta não depender de dados da série.`,
};

const lista = (itens) => ({ type: 'array', items: itens });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const FORMATOS = {
  entre_series: obj({
    fala: { type: 'string' },
    base: lista({ type: 'string' }),
    sugestao: obj({ tipo: { type: 'string', enum: ['nenhuma', 'reduzir_carga', 'aumentar_descanso', 'encerrar_exercicio'] }, valor: { type: 'number' } }),
  }),
  relatorio: obj({
    resumo: { type: 'string' }, destaques: lista({ type: 'string' }), atencao: lista({ type: 'string' }),
    proximo_passo: { type: 'string' }, base: lista({ type: 'string' }),
  }),
  comando_livre: obj({
    fala: { type: 'string' }, base: lista({ type: 'string' }),
    acao: { type: 'string', enum: ['nenhuma', 'pausar', 'continuar', 'proximo', 'repetir', 'terminar', 'dor'] },
  }),
};

function regrasDe(ctx) {
  const ids = new Set();
  if (ctx.serie) ids.add(ctx.serie.exercicioId);
  for (const s of ctx.treino?.series || []) ids.add(s.exercicioId);
  const out = {};
  for (const i of ids) out[biblioteca[i].nome] = biblioteca[i].regras_erro.map((r) => ({ id: r.id, severidade: r.severidade, fala: r.fala }));
  return out;
}

// ------------------------------------------------------------------ chamada

function simulada(tipo, ctx, fatos) {
  const base = fatos.includes('contagem') ? ['contagem'] : fatos.slice(0, 1);
  if (tipo === 'entre_series') return { fala: `Boa série de ${ctx.serie.exercicio.toLowerCase()}. Respire e siga no seu ritmo.`, base, sugestao: { tipo: 'nenhuma', valor: 0 } };
  if (tipo === 'comando_livre') return { fala: 'Posso pausar, continuar, ir para o próximo, repetir a série ou terminar o treino.', base: ['pergunta'], acao: 'nenhuma' };
  return { resumo: 'Treino registrado. Você apareceu e fez a sua parte, e é isso que constrói o hábito.', destaques: ['Você concluiu as séries previstas.'], atencao: [], proximo_passo: 'Repita este treino no próximo dia combinado.', base };
}

/**
 * @returns { resposta, sem_base, motivo, modelo } — `sem_base: true` quando a resposta não passou
 *          na conferência de fidelidade (o cliente usa então as frases padronizadas).
 */
export async function consultarAgente(tipo, contextoBruto) {
  const ctx = sanear(tipo, contextoBruto);
  if (!ctx) { const e = new Error('contexto inválido'); e.status = 400; throw e; }
  const fatos = fatosPermitidos(tipo, ctx);

  let resposta;
  let modelo = 'simulado';
  if (process.env.AGENTE_SIMULADO === '1') {
    resposta = simulada(tipo, ctx, fatos);
  } else {
    cliente ??= new Anthropic();
    const entrada = { tipo, fatos_permitidos: fatos, regras_dos_exercicios: regrasDe(ctx), resumo_do_motor: ctx };
    const r = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      // Se o modelo principal recusar por política, a API tenta o modelo de reserva na mesma chamada.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FORMATOS[tipo] } },
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${POR_TIPO[tipo]}\n\nDados do motor de visão (JSON):\n${JSON.stringify(entrada)}` }],
    }, { timeout: 20_000, maxRetries: 1 });
    modelo = r.model;
    if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') {
      return { resposta: null, sem_base: false, motivo: `interrompido:${r.stop_reason}`, modelo };
    }
    const bloco = r.content.find((b) => b.type === 'text');
    try { resposta = JSON.parse(bloco?.text ?? ''); } catch { return { resposta: null, sem_base: false, motivo: 'formato', modelo }; }
  }

  const conf = conferirResposta(tipo, ctx, resposta);
  if (!conf.ok) return { resposta: null, sem_base: true, motivo: conf.motivo, modelo };
  if (resposta.sugestao && (resposta.sugestao.tipo === 'nenhuma' || !ctx.restam_series_do_exercicio)) resposta.sugestao = null;
  return { resposta, sem_base: false, motivo: null, modelo };
}

/** Converte erros do SDK em uma resposta HTTP sem vazar detalhes internos. */
export function statusDoErro(e) {
  if (e?.status === 400 && !(e instanceof Anthropic.APIError)) return [400, 'contexto inválido'];
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return [503, 'agente não configurado'];
  if (e instanceof Anthropic.RateLimitError) return [429, 'agente ocupado'];
  if (e instanceof Anthropic.APIConnectionError) return [504, 'agente inacessível'];
  if (e instanceof Anthropic.APIError) return [502, 'agente indisponível'];
  return [500, 'erro interno'];
}
