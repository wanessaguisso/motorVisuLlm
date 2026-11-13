// Cliente do agente de linguagem. Só métricas estruturadas saem do aparelho, e só com o
// consentimento específico da pessoa. Sem conexão ou sem agente, o aplicativo segue com as
// frases padronizadas (RNF04).

import { dados } from './dados.js';
import { conferirResposta } from './motor/fidelidade.js';

let disponivel = null;

export async function agenteAtivo() {
  if (!dados().consentimentos.agente || !navigator.onLine) return false;
  if (disponivel === null) {
    try { disponivel = (await (await fetch('api/saude', { cache: 'no-store' })).json()).agente === true; } catch { disponivel = false; }
  }
  return disponivel;
}

export function esquecerDisponibilidade() { disponivel = null; }

/**
 * @returns { resposta, semBase } — resposta nula quando o agente falhou ou falou sem base.
 */
export async function consultar(tipo, contexto, { tempoLimite = 15000 } = {}) {
  if (!(await agenteAtivo())) return { resposta: null, semBase: false, usado: false };
  try {
    const r = await fetch('api/agente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, contexto }), signal: AbortSignal.timeout(tempoLimite),
    });
    if (!r.ok) return { resposta: null, semBase: false, usado: true };
    const corpo = await r.json();
    if (corpo.sem_base || !corpo.resposta) return { resposta: null, semBase: corpo.sem_base === true, usado: true };
    // Segunda conferência, no aparelho: fala sem base é descartada.
    if (!conferirResposta(tipo, contextoParaConferir(tipo, contexto), corpo.resposta).ok) return { resposta: null, semBase: true, usado: true };
    return { resposta: corpo.resposta, semBase: false, usado: true };
  } catch { return { resposta: null, semBase: false, usado: true }; }
}

function contextoParaConferir(tipo, c) {
  if (tipo === 'relatorio') return { treino: c.treino, constancia: c.constancia };
  return { serie: c.serie };
}
