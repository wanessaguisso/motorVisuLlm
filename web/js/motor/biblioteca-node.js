// Carga da biblioteca de exercícios no Node (testes e bancada). No navegador, ver js/dados.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'exercicios');

export function carregarBiblioteca() {
  const ids = JSON.parse(readFileSync(path.join(dir, 'indice.json'), 'utf8'));
  const bib = {};
  for (const id of ids) bib[id] = JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  return bib;
}
