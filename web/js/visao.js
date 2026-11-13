// Motor de visão no navegador: câmera + BlazePose (MediaPipe Pose Landmarker).
// O vídeo é processado no aparelho e nunca é enviado nem gravado.

const LOCAL = { pacote: './vendor/mediapipe/vision_bundle.mjs', wasm: 'vendor/mediapipe/wasm', modelo: (n) => `vendor/modelos/pose_landmarker_${n}.task` };
const REMOTO = {
  pacote: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
  modelo: (n) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${n}/float16/latest/pose_landmarker_${n}.task`,
};

/** Versão mais leve ou mais precisa do modelo, conforme o aparelho. */
export function escolherModelo(preferencia = 'auto') {
  if (preferencia === 'lite' || preferencia === 'full') return preferencia;
  const nucleos = navigator.hardwareConcurrency || 4, memoria = navigator.deviceMemory || 4;
  const celular = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return !celular && nucleos >= 8 && memoria >= 8 ? 'full' : 'lite';
}

async function existe(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

export async function criarDetector({ modelo = 'auto', numPoses = 2 } = {}) {
  const nome = escolherModelo(modelo);
  const local = await existe(LOCAL.pacote.replace('./', ''));
  const origem = local ? LOCAL : REMOTO;
  const { FilesetResolver, PoseLandmarker } = await import(local ? `../vendor/mediapipe/vision_bundle.mjs` : REMOTO.pacote);
  const arquivos = await FilesetResolver.forVisionTasks(origem.wasm);
  const caminhoModelo = (await existe(LOCAL.modelo(nome))) ? LOCAL.modelo(nome) : REMOTO.modelo(nome);
  const criar = (delegate) => PoseLandmarker.createFromOptions(arquivos, {
    baseOptions: { modelAssetPath: caminhoModelo, delegate },
    runningMode: 'VIDEO', numPoses,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let detector, delegate = 'GPU';
  try { detector = await criar('GPU'); } catch { delegate = 'CPU'; detector = await criar('CPU'); }
  let ultimo = -1;
  return {
    modelo: nome, delegate,
    /** @returns lista de poses { pontos, mundo } */
    detectar(video, tMs) {
      const t = Math.max(ultimo + 1, Math.round(tMs)); ultimo = t;
      const r = detector.detectForVideo(video, t);
      return (r.landmarks || []).map((pontos, i) => ({ pontos, mundo: r.worldLandmarks?.[i] }));
    },
    fechar() { try { detector.close(); } catch { /* nada */ } },
  };
}

export async function abrirCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Este navegador não dá acesso à câmera.'), { codigo: 'sem_suporte' });
  let fluxo;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  } catch (e) {
    const negada = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    throw Object.assign(new Error(negada ? 'Permita o uso da câmera para o aplicativo acompanhar o seu movimento.' : 'Não encontrei uma câmera neste aparelho.'), { codigo: negada ? 'negada' : 'sem_camera' });
  }
  video.srcObject = fluxo;
  video.playsInline = true; video.muted = true;
  await video.play();
  return { fluxo, fechar: () => { fluxo.getTracks().forEach((t) => t.stop()); video.srcObject = null; } };
}

/** Brilho médio do quadro (0 a 255), para avisar quando o ambiente está escuro. */
export function criarMedidorDeLuz() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return (video) => {
    try {
      ctx.drawImage(video, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    } catch { return null; }
  };
}

/** Mantém a tela ligada durante o treino. */
export async function manterTelaLigada() {
  let trava = null;
  const pedir = async () => { try { trava = await navigator.wakeLock?.request('screen'); } catch { trava = null; } };
  await pedir();
  const aoVoltar = () => { if (document.visibilityState === 'visible') pedir(); };
  document.addEventListener('visibilitychange', aoVoltar);
  return () => { document.removeEventListener('visibilitychange', aoVoltar); trava?.release?.().catch(() => {}); };
}
