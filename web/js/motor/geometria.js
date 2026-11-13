// Geometria sobre os 33 pontos-chave do BlazePose. Sem dependência de DOM:
// o mesmo código roda no navegador e no Node (ambiente de testes).

export const P = {
  nariz: 0,
  ombro_esq: 11, ombro_dir: 12,
  cotovelo_esq: 13, cotovelo_dir: 14,
  punho_esq: 15, punho_dir: 16,
  quadril_esq: 23, quadril_dir: 24,
  joelho_esq: 25, joelho_dir: 26,
  tornozelo_esq: 27, tornozelo_dir: 28,
  calcanhar_esq: 29, calcanhar_dir: 30,
  pe_esq: 31, pe_dir: 32,
};

// Ligações desenhadas no esqueleto sobreposto ao vídeo.
export const LIGACOES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

export const PONTOS_CORPO = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

const RAD = 180 / Math.PI;

/** Ângulo articular em B (graus), pelo produto escalar dos vetores BA e BC. */
export function angulo(a, b, c) {
  const ax = a.x - b.x, ay = a.y - b.y, az = (a.z ?? 0) - (b.z ?? 0);
  const cx = c.x - b.x, cy = c.y - b.y, cz = (c.z ?? 0) - (b.z ?? 0);
  const na = Math.hypot(ax, ay, az), nc = Math.hypot(cx, cy, cz);
  if (na < 1e-9 || nc < 1e-9) return NaN;
  const cos = (ax * cx + ay * cy + az * cz) / (na * nc);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * RAD;
}

export function meio(a, b) {
  return {
    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    v: Math.min(a.v ?? 1, b.v ?? 1),
  };
}

export function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Inclinação (graus) do segmento de→para em relação à vertical. 0 = em pé. */
export function inclinacaoVertical(de, para) {
  const dx = para.x - de.x, dy = para.y - de.y, dz = (para.z ?? 0) - (de.z ?? 0);
  const n = Math.hypot(dx, dy, dz);
  if (n < 1e-9) return NaN;
  // y cresce para baixo na imagem (e no espaço "mundo" do MediaPipe).
  return Math.acos(Math.max(-1, Math.min(1, -dy / n))) * RAD;
}

/**
 * Converte um quadro bruto em pontos métricos {x,y,z,v}.
 * Em 2D, x é multiplicado pela proporção da imagem para não distorcer ângulos.
 * Em 3D, usa as coordenadas "mundo" (metros, origem no quadril).
 */
export function pontosDoQuadro(quadro, usar3d = false) {
  const origem = usar3d && quadro.mundo ? quadro.mundo : quadro.pontos;
  const aspecto = usar3d && quadro.mundo ? 1 : (quadro.aspecto || 1);
  const tresD = usar3d && !!quadro.mundo;
  return origem.map((p, i) => ({
    x: p.x * aspecto,
    y: p.y,
    z: tresD ? (p.z ?? 0) : 0,
    v: quadro.pontos[i]?.visibility ?? p.visibility ?? 1,
  }));
}

/** Comprimento do tronco (meio dos ombros ao meio dos quadris): unidade de normalização. */
export function comprimentoTronco(pts) {
  return distancia(meio(pts[11], pts[12]), meio(pts[23], pts[24]));
}

/** Caixa envolvente do corpo em coordenadas normalizadas da imagem. */
export function caixa(pontos) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
  for (const i of PONTOS_CORPO) {
    const p = pontos[i];
    if (!p) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    n++;
  }
  if (!n) return null;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, l: x1 - x0, a: y1 - y0 };
}

/** Classifica a vista da câmera pela razão largura dos ombros / tronco (imagem 2D). */
export function vistaDaCamera(quadro) {
  const a = quadro.aspecto || 1;
  const p = quadro.pontos;
  const larg = Math.abs(p[11].x - p[12].x) * a;
  const tronco = Math.hypot(((p[11].x + p[12].x) / 2 - (p[23].x + p[24].x) / 2) * a,
    (p[11].y + p[12].y) / 2 - (p[23].y + p[24].y) / 2);
  if (tronco < 1e-6) return 'indefinida';
  const r = larg / tronco;
  if (r >= 0.5) return 'frontal';
  if (r <= 0.32) return 'lateral';
  return 'diagonal';
}
