// Service worker: guarda o aplicativo, as definições de exercício, o MediaPipe e os modelos
// de pose, para que contagem, avaliação e falas padronizadas funcionem sem conexão (RNF04).

const VERSAO = 'pta-v1';
const CASCA = [
  './', 'index.html', 'estilo.css', 'manifest.webmanifest', 'icons/icone.svg', 'icons/icone-192.png',
  'exercicios/indice.json',
  ...['agachamento_livre', 'rosca_direta_halteres', 'elevacao_lateral', 'flexao_de_braco', 'desenvolvimento_ombros'].map((e) => `exercicios/${e}.json`),
  'js/app.js', 'js/dados.js', 'js/voz.js', 'js/visao.js', 'js/esqueleto.js', 'js/agente.js', 'js/ui.js',
  'js/telas/inicio.js', 'js/telas/cadastro.js', 'js/telas/fichas.js', 'js/telas/treino.js', 'js/telas/relatorio.js', 'js/telas/historico.js', 'js/telas/perfil.js', 'js/telas/testes.js',
  ...['alvo', 'analisador', 'bancada', 'calibracao', 'coach', 'comandos', 'condicao', 'definicao', 'fidelidade', 'filtro', 'geometria', 'medidas', 'plano', 'relatorio', 'repeticoes', 'serie', 'sessao', 'sintetico'].map((m) => `js/motor/${m}.js`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.includes('/api/')) return; // agente: sempre pela rede
  const pesado = url.pathname.includes('/vendor/') || url.hostname === 'storage.googleapis.com' || url.hostname === 'cdn.jsdelivr.net';
  if (pesado) {
    // Arquivos grandes e imutáveis (wasm, modelos): cache primeiro.
    e.respondWith(caches.open(VERSAO).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Aplicativo: rede primeiro (para receber atualizações), cache se estiver sem conexão.
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) caches.open(VERSAO).then((c) => c.put(req, r.clone()));
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
