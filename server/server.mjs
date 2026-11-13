// Servidor do MVP: entrega o aplicativo web (PWA) e expõe o agente de linguagem.
// O vídeo nunca chega aqui: o motor de visão roda inteiro no navegador.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultarAgente, agenteDisponivel, statusDoErro, TIPOS } from './agente.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PORTA = Number(process.env.PORT || 8080);
const LIMITE_CORPO = 64 * 1024;       // métricas são pequenas; imagem não cabe aqui, de propósito
const LIMITE_POR_MINUTO = Number(process.env.AGENTE_LIMITE_MIN || 30);

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.map': 'application/json',
};

const CABECALHOS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
    "img-src 'self' data: blob:", "media-src 'self' blob:", "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
  ].join('; '),
};

const usos = new Map();
function dentroDoLimite(ip) {
  const agora = Date.now();
  const lista = (usos.get(ip) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= LIMITE_POR_MINUTO) { usos.set(ip, lista); return false; }
  lista.push(agora); usos.set(ip, lista);
  if (usos.size > 5000) usos.clear();
  return true;
}

function json(res, status, corpo) {
  res.writeHead(status, { ...CABECALHOS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    let estourou = false;
    req.on('data', (c) => {
      if (estourou) return;                       // descarta o resto, sem guardar
      tam += c.length;
      if (tam > LIMITE_CORPO) { estourou = true; partes.length = 0; falha(Object.assign(new Error('corpo grande demais'), { status: 413 })); return; }
      partes.push(c);
    });
    req.on('end', () => { if (estourou) return; try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { falha(Object.assign(new Error('JSON inválido'), { status: 400 })); } });
    req.on('error', falha);
  });
}

async function api(req, res, url) {
  if (url.pathname === '/api/saude' && req.method === 'GET') {
    return json(res, 200, { ok: true, agente: agenteDisponivel() });
  }
  if (url.pathname === '/api/agente' && req.method === 'POST') {
    // Só aceita chamadas do próprio aplicativo.
    const origem = req.headers.origin;
    if (origem && new URL(origem).host !== req.headers.host) return json(res, 403, { erro: 'origem não permitida' });
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { erro: 'use application/json' });
    if (!agenteDisponivel()) return json(res, 503, { erro: 'agente não configurado' });
    if (!dentroDoLimite(req.socket.remoteAddress || '?')) return json(res, 429, { erro: 'muitas chamadas' });
    try {
      const corpo = await lerCorpo(req);
      if (!TIPOS.includes(corpo.tipo)) return json(res, 400, { erro: 'tipo inválido' });
      return json(res, 200, await consultarAgente(corpo.tipo, corpo.contexto));
    } catch (e) {
      if (e.status === 413 || (e.status === 400 && e.message === 'JSON inválido')) return json(res, e.status, { erro: e.message });
      const [status, erro] = statusDoErro(e);
      if (status >= 500) console.error('[agente]', e?.name || 'Erro', e?.status || '', e?.message || '');
      return json(res, status, { erro });
    }
  }
  return json(res, 404, { erro: 'não encontrado' });
}

async function estatico(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, CABECALHOS); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400, CABECALHOS); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const arquivo = path.join(RAIZ, path.normalize(rel));
  if (arquivo !== RAIZ && !arquivo.startsWith(RAIZ + path.sep)) { res.writeHead(403, CABECALHOS); return res.end(); }
  try {
    const info = await stat(arquivo);
    if (!info.isFile()) throw new Error('não é arquivo');
    const ext = path.extname(arquivo).toLowerCase();
    const longo = rel.startsWith('/vendor/');
    res.writeHead(200, {
      ...CABECALHOS,
      'Content-Type': TIPOS_MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': longo ? 'public, max-age=604800' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    res.end(await readFile(arquivo));
  } catch {
    res.writeHead(404, { ...CABECALHOS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}

export const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const trata = url.pathname.startsWith('/api/') ? api : estatico;
  trata(req, res, url).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { erro: 'erro interno' }); });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  servidor.listen(PORTA, () => {
    console.log(`Personal trainer ativo em http://localhost:${PORTA}`);
    console.log(agenteDisponivel() ? 'Agente de linguagem: ativo.' : 'Agente de linguagem: desligado (defina ANTHROPIC_API_KEY). O treino funciona com as frases padronizadas.');
  });
}
