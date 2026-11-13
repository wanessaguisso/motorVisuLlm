import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AGENTE_SIMULADO = '1';
const { servidor } = await import('../server/server.mjs');
const { sanear, consultarAgente } = await import('../server/agente.mjs');
const { fatosPermitidos, conferirResposta } = await import('../web/js/motor/fidelidade.js');

let base;
before(async () => { await new Promise((ok) => servidor.listen(0, ok)); base = `http://127.0.0.1:${servidor.address().port}`; });
after(() => servidor.close());

const serie = {
  exercicioId: 'rosca_direta_halteres', serie: 1, totalSeries: 3, alvo: 12, total: 12, validas: 10, invalidas: 2, carga_kg: 8, termino: 'meta',
  erros: { amplitude_curta: 2, regra_inventada: 5 },
  reps: [{ n: 8, erros: [{ id: 'amplitude_curta', medido: 62, configurado: 55 }] }],
  fadiga: { perda_velocidade_pct: 12, nivel: 'nenhum' }, assimetria: null,
  nome_da_pessoa: 'Fulana', imagem: 'data:image/png;base64,AAAA',
};
const post = (corpo, cab = {}) => fetch(`${base}/api/agente`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

test('saneamento: só métricas conhecidas saem do aparelho', () => {
  const c = sanear('entre_series', { serie, perfil: { nivel: 'iniciante', objetivo: 'x', email: 'a@b.c' }, restam: true });
  const txt = JSON.stringify(c);
  assert.ok(!txt.includes('Fulana') && !txt.includes('base64') && !txt.includes('a@b.c'));
  assert.deepEqual(c.serie.erros, { amplitude_curta: 2 }, 'erro que não existe nas regras é descartado');
  assert.deepEqual(c.serie.detalhes, [{ erro: 'amplitude_curta', repeticao: 8, medido: 62, configurado: 55 }]);
  assert.equal(c.perfil.objetivo, null);
  assert.equal(sanear('entre_series', { serie: { ...serie, exercicioId: 'inexistente' } }), null);
  assert.equal(sanear('outro_tipo', { serie }), null);
});

test('fidelidade: fala sem base ou com base não detectada é recusada', () => {
  const ctx = sanear('entre_series', { serie, restam: true });
  assert.deepEqual(fatosPermitidos('entre_series', ctx).sort(), ['carga', 'contagem', 'erro:amplitude_curta']);
  assert.equal(conferirResposta('entre_series', ctx, { fala: 'Boa série.', base: ['contagem'] }).ok, true);
  assert.equal(conferirResposta('entre_series', ctx, { fala: 'Seu joelho entrou.', base: [] }).ok, false);
  assert.equal(conferirResposta('entre_series', ctx, { fala: 'Cotovelo fugiu.', base: ['erro:cotovelo_foge'] }).ok, false, 'erro que o motor não detectou');
  assert.equal(conferirResposta('entre_series', ctx, { fala: 'Cansou?', base: ['fadiga'] }).ok, false, 'fadiga em nível "nenhum" não é fato');
});

test('agente (simulado): resposta conferida; sugestão só quando restam séries', async () => {
  const r = await consultarAgente('entre_series', { serie, restam: false });
  assert.equal(r.sem_base, false);
  assert.ok(r.resposta.fala.length > 0);
  assert.equal(r.resposta.sugestao, null);
  await assert.rejects(() => consultarAgente('entre_series', { serie: null }), /contexto inválido/);
});

test('HTTP: saúde, agente e validações de entrada', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/saude`)).json(), { ok: true, agente: true });
  const ok = await post({ tipo: 'entre_series', contexto: { serie, restam: true } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).sem_base, false);
  assert.equal((await post({ tipo: 'apagar_tudo', contexto: {} })).status, 400);
  assert.equal((await post({ tipo: 'entre_series', contexto: { serie: {} } })).status, 400);
  assert.equal((await post('{nao é json')).status, 400);
  assert.equal((await post({ tipo: 'entre_series', contexto: { serie, lixo: 'x'.repeat(70000) } })).status, 413, 'corpo grande (ex.: imagem) é recusado');
  assert.equal((await post({ tipo: 'entre_series', contexto: { serie } }, { Origin: 'https://outro.site' })).status, 403);
  assert.equal((await fetch(`${base}/api/agente`)).status, 404);
});

test('HTTP: arquivos estáticos, cabeçalhos e travessia de diretório', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/);
  assert.equal((await fetch(`${base}/exercicios/indice.json`)).status, 200);
  assert.equal((await fetch(`${base}/manifest.webmanifest`)).headers.get('content-type'), 'application/manifest+json; charset=utf-8');
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/server/agente.mjs', '/../package.json']) {
    assert.ok([403, 404].includes((await fetch(`${base}${p}`)).status), p);
  }
});
