// Copia o MediaPipe (BlazePose) para dentro do aplicativo e baixa os modelos de pose,
// para que o motor de visão rode sem depender de rede. Se o download falhar, o aplicativo
// usa os endereços públicos e o service worker guarda os arquivos no primeiro uso.

import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const origem = path.join(raiz, 'node_modules', '@mediapipe', 'tasks-vision');
const destino = path.join(raiz, 'web', 'vendor');
const MODELOS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
};
const existe = (p) => access(p).then(() => true, () => false);

try {
  if (!(await existe(origem))) throw new Error('pacote @mediapipe/tasks-vision ausente (rode npm install)');
  await mkdir(path.join(destino, 'mediapipe'), { recursive: true });
  await cp(path.join(origem, 'vision_bundle.mjs'), path.join(destino, 'mediapipe', 'vision_bundle.mjs'));
  await cp(path.join(origem, 'wasm'), path.join(destino, 'mediapipe', 'wasm'), { recursive: true });
  console.log('MediaPipe copiado para web/vendor/mediapipe.');
} catch (e) {
  console.warn(`Aviso: não foi possível copiar o MediaPipe (${e.message}). O aplicativo usará a CDN.`);
}

await mkdir(path.join(destino, 'modelos'), { recursive: true });
for (const [nome, url] of Object.entries(MODELOS)) {
  const arq = path.join(destino, 'modelos', `pose_landmarker_${nome}.task`);
  if (await existe(arq)) continue;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(arq, Buffer.from(await r.arrayBuffer()));
    console.log(`Modelo ${nome} baixado.`);
  } catch (e) {
    console.warn(`Aviso: modelo ${nome} não baixado (${e.message}). O aplicativo usará o endereço público.`);
  }
}
