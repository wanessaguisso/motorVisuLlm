// Dados locais do aplicativo. Tudo fica no aparelho (localStorage): perfil, fichas, histórico
// e configurações. Só métricas são guardadas; vídeo nunca é gravado nem enviado (RNF02, LGPD).

import { novoItem, filtrarBiblioteca } from './motor/plano.js';

const CHAVE = 'pta:v1';

const PADRAO = () => ({
  versao: 1,
  perfil: null,
  consentimentos: { saude: null, agente: false, voz: false },
  fichas: [],
  historico: [],
  config: { modelo: 'auto', usar3d: false, fonte: 'camera', falar: true, espelhar: true },
});

let estado = null;
let biblioteca = null;

export function dados() {
  if (estado) return estado;
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    estado = bruto ? { ...PADRAO(), ...bruto, config: { ...PADRAO().config, ...bruto.config }, consentimentos: { ...PADRAO().consentimentos, ...bruto.consentimentos } } : PADRAO();
  } catch { estado = PADRAO(); }
  return estado;
}

export function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); return true; } catch { return false; }
}

/** Direito de eliminação (LGPD, art. 18): apaga tudo o que o aplicativo guardou. */
export function apagarTudo() {
  localStorage.removeItem(CHAVE);
  estado = PADRAO();
}

/** Direito de portabilidade: todos os dados em um arquivo JSON. */
export function exportar() {
  return JSON.stringify({ exportado_em: new Date().toISOString(), ...dados() }, null, 2);
}

export async function carregarBiblioteca() {
  if (biblioteca) return biblioteca;
  const ids = await (await fetch('exercicios/indice.json')).json();
  const defs = await Promise.all(ids.map(async (id) => (await fetch(`exercicios/${id}.json`)).json()));
  biblioteca = Object.fromEntries(defs.map((d) => [d.id, d]));
  return biblioteca;
}

export const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const CARGA_INICIAL = { rosca_direta_halteres: 3, elevacao_lateral: 2, desenvolvimento_ombros: 3 };

/** Ficha simples de início rápido, com o que a pessoa pode fazer (baixa barreira de entrada). */
export function fichaInicial(perfil, bib) {
  const ok = filtrarBiblioteca(bib, perfil).filter((x) => !x.alerta.length).map((x) => x.def.id);
  const ordem = ['agachamento_livre', 'rosca_direta_halteres', 'elevacao_lateral', 'desenvolvimento_ombros', 'flexao_de_braco'];
  const mult = perfil.nivel === 'iniciante' ? 1 : perfil.nivel === 'intermediario' ? 2 : 3;
  const itens = ordem.filter((id) => ok.includes(id)).slice(0, perfil.nivel === 'iniciante' ? 4 : 5).map((id) => {
    const it = novoItem(id, perfil.nivel);
    it.carga_kg = (CARGA_INICIAL[id] || 0) * mult;
    if (id === 'flexao_de_braco' && perfil.nivel === 'iniciante') it.repeticoes = 6;
    return it;
  });
  return { id: novoId(), nome: 'Treino A – Corpo inteiro', divisao: 'A', aquecimento: ['marcha_parada', 'rotacao_ombros'], itens };
}

export const ROTULOS = {
  objetivo: { hipertrofia: 'Ganhar massa muscular', emagrecimento: 'Emagrecer', condicionamento: 'Melhorar o condicionamento' },
  nivel: { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' },
  equipamento: { halteres: 'Halteres', faixa_elastica: 'Faixa elástica', banco: 'Banco', barra: 'Barra' },
  lesoes: { ombro: 'Ombro', cotovelo: 'Cotovelo', punho: 'Punho', coluna: 'Coluna / lombar', quadril: 'Quadril', joelho: 'Joelho', tornozelo: 'Tornozelo' },
  termino: { meta: 'Meta atingida', falha: 'Parou por cansaço', dor: 'Interrompida por dor', parada: 'Interrompida', pulou: 'Pulada', nao_informado: 'Parou antes da meta' },
  metodo: { normal: 'Normal', 'bi-set': 'Bi-set (com o próximo)', 'drop-set': 'Drop set' },
  lados: { ambos: 'Os dois lados', direito: 'Só o direito', esquerdo: 'Só o esquerdo' },
};

export const PARQ = [
  'Algum médico já disse que você tem um problema de coração e que só deveria fazer atividade física com supervisão?',
  'Você sente dor no peito quando pratica atividade física?',
  'No último mês, você sentiu dor no peito sem estar fazendo atividade física?',
  'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  'Você tem algum problema ósseo ou articular que poderia piorar com atividade física?',
  'Você toma remédio para pressão arterial ou para o coração?',
  'Você sabe de alguma outra razão pela qual não deveria praticar atividade física?',
];
