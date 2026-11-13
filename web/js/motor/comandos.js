// Comandos de voz da sessão sem as mãos (seção 3.8). O texto vem do reconhecimento de fala
// do navegador; aqui ele é só interpretado. O que não for reconhecido pode seguir para o
// agente de linguagem como comando livre.

const NUMEROS = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
};

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normalizar(texto) {
  return semAcento(String(texto || '').toLowerCase()).replace(/[^a-z0-9,.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function numeroFalado(txt) {
  const m = /(\d+(?:[.,]\d+)?)/.exec(txt);
  if (m) return Number(m[1].replace(',', '.'));
  let total = null, meio = false;
  for (const p of txt.split(' ')) {
    if (p in NUMEROS) total = (total ?? 0) + NUMEROS[p];
    if (p === 'meio' || p === 'meia') meio = true;
  }
  if (total === null) return null;
  return total + (meio ? 0.5 : 0);
}

// A ordem importa: segurança primeiro.
const PADROES = [
  ['dor', /\b(dor|doendo|doeu|machuquei|machucou)\b/],
  ['parar', /\b(parar|pare|chega)\b/],
  ['terminar', /\b(terminar|encerrar|finalizar) (o )?treino\b/],
  ['pausar', /\b(pausar|pausa|pause)\b/],
  ['continuar', /\b(continuar|continua|continue|retomar|voltar)\b/],
  ['proximo', /\b(proximo|proxima|pular|avancar)\b/],
  ['repetir', /\b(repetir|repete|de novo|refazer)\b/],
  ['falha', /\b(falha|falhei|cansaco|cansei|cansada|cansado|nao aguento)\b/],
  ['sim', /^(sim|pode|pode sim|quero|isso|claro|ok)$/],
  ['nao', /^(nao|nao quero|deixa|negativo)$/],
];

/** @returns { tipo, valor? } ou null se o texto não for um comando conhecido */
export function interpretarComando(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const carga = /\b(carga|peso)\b(.*)/.exec(t);
  if (carga) {
    const n = numeroFalado(carga[2]);
    if (n !== null && n >= 0 && n <= 300) return { tipo: 'carga', valor: n };
  }
  for (const [tipo, re] of PADROES) if (re.test(t)) return { tipo };
  return null;
}

export const COMANDOS_ACEITOS = ['proximo', 'pausar', 'continuar', 'repetir', 'terminar', 'carga', 'dor', 'parar', 'falha', 'sim', 'nao'];
