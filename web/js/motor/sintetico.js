// Gerador de sequências sintéticas de pontos-chave: um boneco articulado que executa os
// exercícios, com ou sem erros. Serve aos testes automatizados, à bancada de regressão e ao
// modo demonstração da interface. NÃO substitui a validação com vídeos reais rotulados por
// profissionais (seção 3.11): só garante que o motor faz o que as regras dizem.

const G = Math.PI / 180;
const C = { canela: 0.2, coxa: 0.2, tronco: 0.24, braco: 0.13, antebraco: 0.12 };

// Gerador pseudoaleatório determinístico (testes reprodutíveis).
function semente(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function vazio() { return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 })); }
const por = (pts, i, p, v = 0.97) => { pts[i] = { x: p[0], y: p[1], z: 0, visibility: v }; };

function rosto(pts, nariz) {
  por(pts, 0, nariz);
  for (let i = 1; i <= 10; i++) por(pts, i, [nariz[0] + (i % 2 ? 0.01 : -0.01), nariz[1] - 0.01]);
}
function maosEPes(pts, vis) {
  for (const [punho, a, b, c] of [[15, 17, 19, 21], [16, 18, 20, 22]]) for (const i of [a, b, c]) por(pts, i, [pts[punho].x, pts[punho].y + 0.02], vis(punho));
  for (const [tor, calc, pe] of [[27, 29, 31], [28, 30, 32]]) {
    por(pts, calc, [pts[tor].x - 0.01, pts[tor].y + 0.02], vis(tor));
    por(pts, pe, [pts[tor].x + 0.04, pts[tor].y + 0.03], vis(tor));
  }
}

/** Em pé, de lado para a câmera (unidades: altura da imagem). */
function poseLateral({ cotovelo = 172, ombroFlex = 0, joelho = 178, troncoExtra = 0, perto = 'dir', cx = 0.28 }) {
  const pts = vazio();
  const f = 180 - joelho, a = 0.45 * f * G;
  const tornozelo = [cx, 0.92];
  const jo = [tornozelo[0] + C.canela * Math.sin(a), tornozelo[1] - C.canela * Math.cos(a)];
  const ang = a - f * G;
  const quadril = [jo[0] + C.coxa * Math.sin(ang), jo[1] - C.coxa * Math.cos(ang)];
  const tau = (0.4 * f + troncoExtra) * G;
  const ombro = [quadril[0] + C.tronco * Math.sin(tau), quadril[1] - C.tronco * Math.cos(tau)];
  const phi = ombroFlex * G;
  const cot = [ombro[0] + C.braco * Math.sin(phi), ombro[1] + C.braco * Math.cos(phi)];
  const psi = phi + (180 - cotovelo) * G;
  const punho = [cot[0] + C.antebraco * Math.sin(psi), cot[1] + C.antebraco * Math.cos(psi)];
  const impar = perto === 'esq';
  const vis = (i) => ((i % 2 === 1) === impar ? 0.97 : ([11, 12, 23, 24].includes(i) ? 0.6 : 0.3));
  const d = (p, i) => [(p[0] + ((i % 2 === 1) === impar ? 0 : 0.006)), p[1]];
  for (const [par, p] of [[[11, 12], ombro], [[13, 14], cot], [[15, 16], punho], [[23, 24], quadril], [[25, 26], jo], [[27, 28], tornozelo]]) {
    for (const i of par) por(pts, i, d(p, i), vis(i));
  }
  rosto(pts, [ombro[0] + 0.03, ombro[1] - 0.1]);
  maosEPes(pts, vis);
  return pts;
}

/** Em pé, de frente para a câmera. O lado direito da pessoa aparece à esquerda da imagem. */
function poseFrontal({ abdDir = 8, abdEsq = 8, cotDir = 172, cotEsq = 172, troncoLat = 0, cx = 0.28 }) {
  const pts = vazio();
  const quadrilY = 0.54;
  const t = troncoLat * G;
  const meioOmbro = [cx + C.tronco * Math.sin(t), quadrilY - C.tronco * Math.cos(t)];
  for (const [sinal, om, co, pu, qu, jo, to, abd, cot] of [[-1, 12, 14, 16, 24, 26, 28, abdDir, cotDir], [1, 11, 13, 15, 23, 25, 27, abdEsq, cotEsq]]) {
    const ombro = [meioOmbro[0] + sinal * 0.09, meioOmbro[1]];
    const A = abd * G;
    const cotv = [ombro[0] + sinal * C.braco * Math.sin(A), ombro[1] + C.braco * Math.cos(A)];
    const psi = A + (180 - cot) * G;
    const punho = [cotv[0] + sinal * C.antebraco * Math.sin(psi), cotv[1] + C.antebraco * Math.cos(psi)];
    por(pts, om, ombro); por(pts, co, cotv); por(pts, pu, punho);
    por(pts, qu, [cx + sinal * 0.08, quadrilY]); por(pts, jo, [cx + sinal * 0.08, 0.73]); por(pts, to, [cx + sinal * 0.08, 0.92]);
  }
  rosto(pts, [meioOmbro[0], meioOmbro[1] - 0.1]);
  maosEPes(pts, () => 0.97);
  return pts;
}

/** Em prancha, de lado para a câmera (imagem na horizontal). */
function poseFlexao({ cotovelo = 172, desvioQuadril = 0, perto = 'dir' }) {
  const pts = vazio();
  const chao = 0.88;
  const E = cotovelo * G;
  const d = Math.sqrt(C.braco ** 2 + C.antebraco ** 2 - 2 * C.braco * C.antebraco * Math.cos(E));
  const punho = [0.5, chao];
  const ombro = [0.5, chao - d];
  const h = (C.antebraco ** 2 - C.braco ** 2 + d * d) / (2 * d);
  const fora = Math.sqrt(Math.max(0, C.antebraco ** 2 - h * h));
  const cot = [0.5 + fora, chao - h];
  const tornozelo = [1.12, chao - 0.03];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const quadril = mix(ombro, tornozelo, 0.44); quadril[1] += desvioQuadril;
  const jo = mix(quadril, tornozelo, 0.5);
  const impar = perto === 'esq';
  const vis = (i) => ((i % 2 === 1) === impar ? 0.97 : ([11, 12, 23, 24].includes(i) ? 0.6 : 0.3));
  for (const [par, p] of [[[11, 12], ombro], [[13, 14], cot], [[15, 16], punho], [[23, 24], quadril], [[25, 26], jo], [[27, 28], tornozelo]]) {
    for (const i of par) por(pts, i, [p[0], p[1] + ((i % 2 === 1) === impar ? 0 : 0.004)], vis(i));
  }
  rosto(pts, [ombro[0] - 0.09, ombro[1] + 0.01]);
  maosEPes(pts, vis);
  return pts;
}

// Para cada exercício: valor inicial e de ápice do ângulo principal, pose e erros simuláveis.
// Em cada erro: `apice` e `retorno` alteram a trajetória; `extra` altera parâmetros da pose
// em proporção ao avanço do movimento (0 no início, 1 no ápice).
export const MODELOS = {
  rosca_direta_halteres: {
    aspecto: 9 / 16, inicio: 170, apice: 40,
    pose: (v, x) => poseLateral({ cotovelo: v, ombroFlex: x.ombro || 0, troncoExtra: x.tronco || 0 }),
    erros: {
      amplitude_curta: { apice: 85 },
      sem_extensao: { retorno: 128 },
      balanco_tronco: { extra: { tronco: 15 } },
      cotovelo_foge: { extra: { ombro: 34 } },
    },
  },
  agachamento_livre: {
    aspecto: 9 / 16, inicio: 174, apice: 88,
    pose: (v, x) => poseLateral({ joelho: v, troncoExtra: x.tronco || 0 }),
    erros: {
      amplitude_curta: { apice: 125 },
      sem_extensao: { retorno: 138 },
      tronco_inclinado: { extra: { tronco: 30 } },
    },
  },
  elevacao_lateral: {
    aspecto: 9 / 16, inicio: 8, apice: 90,
    pose: (v, x) => poseFrontal({ abdDir: v, abdEsq: v - (x.assim || 0), cotDir: x.cot ?? 165, cotEsq: x.cot ?? 165, troncoLat: x.tronco || 0 }),
    erros: {
      amplitude_curta: { apice: 55 },
      acima_dos_ombros: { apice: 128 },
      sem_descida: { retorno: 45 },
      cotovelo_dobrado: { extra: { cot: -65 }, base: { cot: 165 } },
      balanco_tronco: { extra: { tronco: 12 } },
    },
  },
  flexao_de_braco: {
    aspecto: 16 / 9, inicio: 170, apice: 80,
    pose: (v, x) => poseFlexao({ cotovelo: v, desvioQuadril: x.quadril || 0 }),
    erros: {
      amplitude_curta: { apice: 122 },
      sem_extensao: { retorno: 132 },
      quadril_desalinhado: { extra: { quadril: 0.075 } },
    },
  },
  desenvolvimento_ombros: {
    aspecto: 9 / 16, inicio: 80, apice: 170,
    pose: (v, x) => {
      const k = Math.max(0, Math.min(1, (v - 80) / 90));
      const abd = 82 + k * 80;
      return poseFrontal({ abdDir: abd, abdEsq: abd, cotDir: v, cotEsq: v - (x.assim || 0), troncoLat: x.tronco || 0 });
    },
    erros: {
      amplitude_curta: { apice: 132 },
      descida_curta: { retorno: 122 },
      tronco_arqueado: { extra: { tronco: 12 } },
    },
  },
};

const suave = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, k)));

function quadroDe(modelo, valor, extras, t, rng, ruido) {
  const pts = modelo.pose(valor, extras);
  const a = modelo.aspecto;
  const pontos = pts.map((p) => ({
    x: p.x / a + (rng() - 0.5) * 2 * ruido,
    y: p.y + (rng() - 0.5) * 2 * ruido,
    z: 0, visibility: p.visibility,
  }));
  return { t: Math.round(t * 1000) / 1000, pontos, aspecto: a };
}

function extrasDe(modelo, erro, valor) {
  const cfg = erro ? modelo.erros[erro] : null;
  if (!cfg?.extra) return {};
  const k = Math.max(0, Math.min(1, Math.abs(valor - modelo.inicio) / Math.abs(modelo.apice - modelo.inicio)));
  const x = {};
  for (const [nome, amp] of Object.entries(cfg.extra)) x[nome] = (cfg.base?.[nome] ?? 0) + amp * k;
  return x;
}

/**
 * Gera uma série sintética.
 * @param exercicioId id do exercício
 * @param reps lista de repetições: null (correta), 'id_do_erro' ou { erro, assim }
 * @param o { fps, tIda, tPausa, tVolta, tEntre, ruido, fadiga, semente }
 * @returns { exercicio, fps, aspecto, quadros, rotulos }
 */
export function gerarSerie(exercicioId, reps, o = {}) {
  const modelo = MODELOS[exercicioId];
  if (!modelo) throw new Error(`Sem modelo sintético para ${exercicioId}`);
  const { fps = 30, tIda = 1.0, tPausa = 0.3, tVolta = 1.4, tEntre = 0.5, ruido = 0.0012, fadiga = 0, t0 = 0 } = o;
  const rng = semente(o.semente ?? 7);
  const dt = 1 / fps;
  const quadros = [];
  let t = t0, v = modelo.inicio;
  const empurrar = (valor, extras) => { quadros.push(quadroDe(modelo, valor, extras, t, rng, ruido)); t += dt; };
  const parado = (seg, valor, extras = {}) => { for (let i = 0; i < Math.round(seg * fps); i++) empurrar(valor, extras); };

  parado(o.tInicio ?? 0.8, v);
  const rotulos = [];
  reps.forEach((r, i) => {
    const spec = typeof r === 'string' ? { erro: r } : (r || {});
    const cfg = spec.erro ? modelo.erros[spec.erro] : null;
    if (spec.erro && !cfg) throw new Error(`Erro "${spec.erro}" não modelado para ${exercicioId}`);
    const apice = cfg?.apice ?? modelo.apice;
    const retorno = cfg?.retorno ?? modelo.inicio;
    const lento = 1 + fadiga * i;
    const extras = (valor) => ({ ...extrasDe(modelo, spec.erro, valor), ...(spec.assim ? { assim: spec.assim * Math.abs(valor - modelo.inicio) / Math.abs(modelo.apice - modelo.inicio) } : {}) });
    const mover = (de, para, seg) => {
      const n = Math.max(2, Math.round(seg * fps));
      for (let k = 1; k <= n; k++) { const val = de + (para - de) * suave(k / n); empurrar(val, extras(val)); }
    };
    const idaConc = !['agachamento_livre', 'flexao_de_braco'].includes(exercicioId);
    mover(v, apice, (spec.tIda ?? tIda) * (idaConc ? lento : 1));
    parado(spec.tPausa ?? tPausa, apice, extras(apice));
    mover(apice, retorno, (spec.tVolta ?? tVolta) * (idaConc ? 1 : lento));
    v = retorno;
    parado(tEntre, v, extras(v));
    rotulos.push({ valida: !spec.erro, erro: spec.erro || null });
  });
  parado(o.tFim ?? 0.6, v);
  return { exercicio: exercicioId, fps, aspecto: modelo.aspecto, sintetico: true, quadros, rotulos: { repeticoes_reais: reps.length, reps: rotulos } };
}

/** Quadro de uma pessoa parada em pé, de frente (preparo e calibração). */
export function quadroNeutro(t, { aspecto = 9 / 16, rng = Math.random, ruido = 0.001 } = {}) {
  return quadroDe({ pose: () => poseFrontal({}), aspecto }, 0, {}, t, rng, ruido);
}

/**
 * Pessoa simulada que reage ao estado da sessão: fica parada no preparo, assume a pose
 * inicial quando o exercício é anunciado e executa as repetições (com alguns erros).
 * Usada no modo demonstração e nos testes da sessão completa.
 */
export class PessoaSimulada {
  constructor({ erros = {}, semente: s = 11, fps = 30, parar = {} } = {}) {
    this.erros = erros;   // { exercicioId: { numeroDaRep: 'id_do_erro' } }
    this.parar = parar;   // { exercicioId: n } para de repetir após n repetições
    this.rng = semente(s);
    this.fps = fps;
    this.chave = null;
    this.fila = [];
  }

  /** @returns quadro no formato da sessão: { t, poses, aspecto } */
  quadro(t, visao) {
    const p = visao.passo;
    const emSerie = p?.tipo === 'serie' && ['aguardando_pose', 'contagem', 'executando', 'pergunta_causa'].includes(visao.estado);
    if (!emSerie) { this.chave = null; this.fila = []; return this.#embrulhar(quadroNeutro(t, { rng: this.rng })); }
    const modelo = MODELOS[p.exercicioId];
    if (visao.estado !== 'executando') {
      this.chave = null; this.fila = [];
      return this.#embrulhar(quadroDe(modelo, modelo.inicio, {}, t, this.rng, 0.001));
    }
    const chave = `${p.exercicioId}#${p.serie}#${p.itemIdx}`;
    if (this.chave !== chave) {
      this.chave = chave;
      const mapa = this.erros[p.exercicioId] || {};
      const limite = this.parar[p.exercicioId] ?? p.alvo;
      const reps = Array.from({ length: Math.min(p.alvo, limite) }, (_, i) => mapa[i + 1] || null);
      this.fila = gerarSerie(p.exercicioId, reps, { fps: this.fps, tInicio: 0.3, tFim: 30, semente: 1 + Math.floor(this.rng() * 1e6) }).quadros;
      this.i = 0;
    }
    const q = this.fila[Math.min(this.i++, this.fila.length - 1)];
    return this.#embrulhar({ ...q, t });
  }

  #embrulhar(q) { return { t: q.t, aspecto: q.aspecto, poses: [{ pontos: q.pontos }] }; }
}
