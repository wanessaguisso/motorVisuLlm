// Gera gravações sintéticas rotuladas em dados/videos_rotulados/, para a bancada de regressão.
// São movimentos de um boneco articulado: servem para detectar regressões no motor, não para
// validar o sistema (isso exige vídeos reais rotulados por profissionais; ver docs).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarSerie, MODELOS } from '../web/js/motor/sintetico.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dados', 'videos_rotulados');
await mkdir(dir, { recursive: true });
const enxuto = (g) => ({ ...g, quadros: g.quadros.map((q) => ({ t: q.t, pontos: q.pontos.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: 0, visibility: p.visibility })) })) });

let n = 0;
for (const [id, modelo] of Object.entries(MODELOS)) {
  const erros = Object.keys(modelo.erros);
  const series = {
    corretas: Array(6).fill(null),
    mistas: [null, ...erros.flatMap((e) => [e, null])],
    ruido: [null, erros[0], null, null, erros[erros.length - 1], null],
  };
  for (const [nome, reps] of Object.entries(series)) {
    const g = gerarSerie(id, reps, { semente: 100 + n, ruido: nome === 'ruido' ? 0.003 : 0.0012, fps: nome === 'ruido' ? 20 : 30 });
    await writeFile(path.join(dir, `sintetico-${id}-${nome}.json`), JSON.stringify(enxuto(g)));
    n++;
  }
}
console.log(`${n} gravações sintéticas em ${path.relative(process.cwd(), dir)}`);
