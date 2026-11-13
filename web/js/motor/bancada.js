// Ambiente de testes (seção 3.11): roda o motor sobre gravações de pontos-chave rotuladas e
// calcula as métricas do Quadro 4. Usado pela ferramenta de linha de comando e pela tela de testes.
//
// Formato de uma gravação:
// { exercicio, fps, aspecto, lado?, quadros: [{ t, pontos: [{x,y,z,visibility}×33], mundo? }],
//   rotulos?: { repeticoes_reais, reps: [{ valida, erro }] } }   ← rótulos do profissional

import { analisarGravacao } from './analisador.js';

export function validarGravacao(g) {
  if (!g || typeof g !== 'object') return 'arquivo vazio';
  if (typeof g.exercicio !== 'string') return 'falta o campo "exercicio"';
  if (!Array.isArray(g.quadros) || !g.quadros.length) return 'falta a lista "quadros"';
  const q = g.quadros[0];
  if (typeof q.t !== 'number' || !Array.isArray(q.pontos) || q.pontos.length !== 33) return 'cada quadro precisa de "t" e de 33 "pontos"';
  return null;
}

/** Roda o motor sobre uma gravação e compara com os rótulos, se houver. */
export function avaliarGravacao(definicao, g, opcoes = {}) {
  const quadros = g.quadros.map((q) => ({ ...q, aspecto: q.aspecto ?? g.aspecto ?? 1 }));
  const r = analisarGravacao(definicao, quadros, { lado: g.lado || 'ambos', ...opcoes });
  const previsto = r.reps.map((x) => ({ valida: x.valida, erros: x.erros.map((e) => e.id) }));
  const saida = { exercicio: g.exercicio, contadas: previsto.length, quadros: r.quadros, quadros_sem_visao: r.quadrosSemVisao, previsto, reps: r.reps, rotulado: false };
  const rot = g.rotulos;
  if (!rot || !Array.isArray(rot.reps)) return saida;
  const reais = rot.repeticoes_reais ?? rot.reps.length;
  const pares = [];
  const n = Math.min(previsto.length, rot.reps.length);
  for (let i = 0; i < n; i++) pares.push({ real: rot.reps[i], previsto: previsto[i] });
  return {
    ...saida, rotulado: true, reais,
    erro_contagem: Math.abs(previsto.length - reais),
    pares,
    // Falso alerta: o sistema apontou erro em repetição rotulada como correta.
    falsos_alertas: pares.filter((p) => p.real.valida && !p.previsto.valida).length,
  };
}

/** Consolida várias gravações nas métricas do Quadro 4. */
export function consolidar(resultados) {
  const rot = resultados.filter((r) => r.rotulado);
  const pares = rot.flatMap((r) => r.pares);
  const acertos = pares.filter((p) => p.real.valida === p.previsto.valida).length;
  const tipos = new Set();
  for (const p of pares) { if (p.real.erro) tipos.add(p.real.erro); p.previsto.erros.forEach((e) => tipos.add(e)); }
  const por_erro = {};
  for (const t of tipos) {
    const vp = pares.filter((p) => p.real.erro === t && p.previsto.erros.includes(t)).length;
    const fp = pares.filter((p) => p.real.erro !== t && p.previsto.erros.includes(t)).length;
    const fn = pares.filter((p) => p.real.erro === t && !p.previsto.erros.includes(t)).length;
    const precisao = vp + fp ? vp / (vp + fp) : null, revocacao = vp + fn ? vp / (vp + fn) : null;
    por_erro[t] = { casos: vp + fn, precisao, revocacao, f1: precisao && revocacao ? (2 * precisao * revocacao) / (precisao + revocacao) : (vp + fn ? 0 : null) };
  }
  const r3 = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
  for (const v of Object.values(por_erro)) { v.precisao = r3(v.precisao); v.revocacao = r3(v.revocacao); v.f1 = r3(v.f1); }
  return {
    gravacoes: resultados.length,
    rotuladas: rot.length,
    repeticoes: pares.length,
    erro_contagem_maximo: rot.length ? Math.max(...rot.map((r) => r.erro_contagem)) : null,
    erro_contagem_medio: rot.length ? r3(rot.reduce((s, r) => s + r.erro_contagem, 0) / rot.length) : null,
    concordancia: pares.length ? r3(acertos / pares.length) : null,
    falsos_alertas_por_serie: rot.length ? r3(rot.reduce((s, r) => s + r.falsos_alertas, 0) / rot.length) : null,
    por_erro,
  };
}

/** Metas iniciais do Quadro 4. */
export function conferirMetas(c) {
  return {
    contagem: c.erro_contagem_maximo === null ? null : c.erro_contagem_maximo <= 1,
    concordancia: c.concordancia === null ? null : c.concordancia >= 0.8,
  };
}
