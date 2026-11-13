// Sobreposição visual: esqueleto sobre o vídeo, verde nas articulações corretas e vermelho
// nas que têm problema (seção 3.9).

import { LIGACOES, PONTOS_CORPO } from './motor/geometria.js';

const COR = { neutro: 'rgba(255,255,255,0.75)', ok: '#34d399', erro: '#f87171', apagado: 'rgba(255,255,255,0.3)' };

/**
 * @param ctx contexto 2D do canvas
 * @param pontos 33 pontos normalizados
 * @param o { chave: índices do exercício, erro: índices com problema, visivel }
 */
export function desenharEsqueleto(ctx, pontos, { chave = [], erro = null, visivel = true } = {}) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!pontos) return;
  const esp = Math.max(3, Math.round(Math.min(w, h) / 110));
  const emChave = new Set(chave), emErro = new Set(erro || []);
  const cor = (i) => (emErro.has(i) ? COR.erro : emChave.has(i) ? (visivel ? COR.ok : COR.apagado) : COR.neutro);
  ctx.lineCap = 'round';
  for (const [a, b] of LIGACOES) {
    const pa = pontos[a], pb = pontos[b];
    if (!pa || !pb || (pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) continue;
    const destacado = (emChave.has(a) && emChave.has(b)) || (emErro.has(a) && emErro.has(b));
    ctx.strokeStyle = emErro.has(a) && emErro.has(b) ? COR.erro : destacado ? (visivel ? COR.ok : COR.apagado) : COR.neutro;
    ctx.lineWidth = destacado ? esp * 1.5 : esp;
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke();
  }
  for (const i of PONTOS_CORPO) {
    const p = pontos[i];
    if (!p || (p.visibility ?? 1) < 0.3) continue;
    ctx.fillStyle = cor(i);
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, emChave.has(i) || emErro.has(i) ? esp * 1.6 : esp, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  }
}
