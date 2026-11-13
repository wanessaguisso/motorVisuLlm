// Bancada de testes do motor (seção 3.11, etapa A): roda o motor sobre todas as gravações de
// pontos-chave rotuladas, mede as métricas do Quadro 4 e compara com a linha de base.
// Uma alteração de regra ou de limiar que piore o desempenho faz o comando falhar.
//
// Uso:  npm run bancada [-- pasta]          mede e compara com dados/baseline.json
//       npm run bancada:baseline            grava a linha de base atual

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarBiblioteca } from '../web/js/motor/biblioteca-node.js';
import { avaliarGravacao, consolidar, conferirMetas, validarGravacao } from '../web/js/motor/bancada.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gravar = args.includes('--gravar-baseline');
const pasta = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(raiz, 'dados', 'videos_rotulados'));
const arqBase = path.join(raiz, 'dados', 'baseline.json');
const bib = carregarBiblioteca();
const pc = (x) => (x === null || x === undefined ? '  –  ' : `${(x * 100).toFixed(1)}%`);

let arquivos = [];
try { arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.json')).sort(); } catch { /* pasta ausente */ }
if (!arquivos.length) { console.error(`Nenhuma gravação em ${pasta}. Rode "npm run bancada:gerar" ou adicione gravações rotuladas.`); process.exit(2); }

const porExercicio = {};
for (const f of arquivos) {
  const g = JSON.parse(await readFile(path.join(pasta, f), 'utf8'));
  const problema = validarGravacao(g) || (!bib[g.exercicio] && `exercício desconhecido: ${g.exercicio}`);
  if (problema) { console.warn(`  ignorado ${f}: ${problema}`); continue; }
  (porExercicio[g.exercicio] ||= []).push({ arquivo: f, ...avaliarGravacao(bib[g.exercicio], g) });
}

const medidas = {};
let falhou = false;
for (const [id, res] of Object.entries(porExercicio)) {
  const c = consolidar(res), m = conferirMetas(c);
  medidas[id] = { concordancia: c.concordancia, erro_contagem_maximo: c.erro_contagem_maximo, falsos_alertas_por_serie: c.falsos_alertas_por_serie, por_erro: Object.fromEntries(Object.entries(c.por_erro).map(([k, v]) => [k, v.f1])) };
  console.log(`\n${bib[id].nome}  (${c.rotuladas} gravações rotuladas, ${c.repeticoes} repetições)`);
  console.log(`  erro de contagem máx.: ${c.erro_contagem_maximo}  ${m.contagem === false ? '✗ acima da meta (1)' : ''}`);
  console.log(`  concordância:          ${pc(c.concordancia)}  ${m.concordancia === false ? '✗ abaixo da meta (80%)' : ''}`);
  console.log(`  falsos alertas/série:  ${c.falsos_alertas_por_serie}`);
  for (const [e, v] of Object.entries(c.por_erro)) console.log(`    ${e.padEnd(22)} casos ${String(v.casos).padStart(3)}  precisão ${pc(v.precisao)}  revocação ${pc(v.revocacao)}  F1 ${pc(v.f1)}`);
  for (const r of res.filter((x) => x.rotulado && (x.erro_contagem > 0 || x.pares.some((p) => p.real.valida !== p.previsto.valida)))) console.log(`    divergência em ${r.arquivo}: contadas ${r.contadas}, reais ${r.reais}`);
}

if (gravar) {
  await writeFile(arqBase, `${JSON.stringify(medidas, null, 2)}\n`);
  console.log(`\nLinha de base gravada em ${path.relative(process.cwd(), arqBase)}.`);
  process.exit(0);
}

let base = null;
try { base = JSON.parse(await readFile(arqBase, 'utf8')); } catch { console.log('\nSem linha de base (rode "npm run bancada:baseline").'); }
if (base) {
  const eps = 1e-6;
  for (const [id, antes] of Object.entries(base)) {
    const agora = medidas[id];
    if (!agora) { console.log(`\n✗ ${id}: sem gravações nesta rodada`); falhou = true; continue; }
    const piorou = [];
    if ((agora.concordancia ?? 0) < (antes.concordancia ?? 0) - eps) piorou.push(`concordância ${pc(antes.concordancia)} → ${pc(agora.concordancia)}`);
    if ((agora.erro_contagem_maximo ?? 0) > (antes.erro_contagem_maximo ?? 0)) piorou.push(`erro de contagem ${antes.erro_contagem_maximo} → ${agora.erro_contagem_maximo}`);
    for (const [e, f1] of Object.entries(antes.por_erro || {})) if ((agora.por_erro?.[e] ?? 0) < (f1 ?? 0) - eps) piorou.push(`F1 de ${e} ${pc(f1)} → ${pc(agora.por_erro?.[e])}`);
    if (piorou.length) { falhou = true; console.log(`\n✗ REGRESSÃO em ${id}: ${piorou.join('; ')}`); }
  }
  console.log(falhou ? '\nA alteração piorou o desempenho e não deve ser incorporada.' : '\nSem regressão em relação à linha de base.');
}
process.exit(falhou ? 1 : 0);
