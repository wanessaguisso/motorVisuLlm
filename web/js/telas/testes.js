// Ambiente de testes (seção 3.11) dentro do aplicativo: roda o motor sobre gravações de
// pontos-chave, extrai pontos-chave de um vídeo e confere o motor com movimentos sintéticos.

import { avaliarGravacao, consolidar, conferirMetas, validarGravacao } from '../motor/bancada.js';
import { gerarSerie, MODELOS } from '../motor/sintetico.js';
import { criarDetector } from '../visao.js';
import { dados } from '../dados.js';
import { h, trocar, anexar, baixar } from '../ui.js';

const pc = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);

function quadroResumo(c) {
  const m = conferirMetas(c);
  const selo = (ok) => (ok === null ? h('span', { class: 'etiqueta' }, 'sem rótulos') : h('span', { class: `etiqueta ${ok ? 'ok' : 'erro'}` }, ok ? 'meta atingida' : 'abaixo da meta'));
  return h('div', { class: 'rolavel' },
    h('table', {}, h('tbody', {},
      h('tr', {}, h('td', {}, 'Gravações (rotuladas)'), h('td', { class: 'n' }, `${c.gravacoes} (${c.rotuladas})`), h('td', {})),
      h('tr', {}, h('td', {}, 'Erro de contagem máximo por série'), h('td', { class: 'n' }, c.erro_contagem_maximo ?? '–'), h('td', {}, selo(m.contagem))),
      h('tr', {}, h('td', {}, 'Concordância válida/inválida'), h('td', { class: 'n' }, pc(c.concordancia)), h('td', {}, selo(m.concordancia))),
      h('tr', {}, h('td', {}, 'Falsos alertas por série'), h('td', { class: 'n' }, c.falsos_alertas_por_serie ?? '–'), h('td', {})))),
    Object.keys(c.por_erro).length > 0 && h('table', { style: 'margin-top:12px' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tipo de erro'), h('th', { class: 'n' }, 'Casos'), h('th', { class: 'n' }, 'Precisão'), h('th', { class: 'n' }, 'Revocação'), h('th', { class: 'n' }, 'F1'))),
      h('tbody', {}, Object.entries(c.por_erro).map(([id, v]) => h('tr', {}, h('td', {}, id), h('td', { class: 'n' }, v.casos), h('td', { class: 'n' }, pc(v.precisao)), h('td', { class: 'n' }, pc(v.revocacao)), h('td', { class: 'n' }, pc(v.f1)))))));
}

export function montar(raiz, { biblioteca }) {
  let detector = null;
  anexar(raiz, h('h1', {}, 'Ambiente de testes'),
    h('p', { class: 'suave' }, 'O motor de análise recebe apenas sequências de pontos-chave. Por isso o mesmo código roda ao vivo e sobre gravações, e pode ser medido contra os rótulos de profissionais de educação física.'));

  // 1. Verificação sintética
  const saida1 = h('div', { 'aria-live': 'polite' });
  anexar(raiz, h('h2', {}, '1. Verificação com movimentos sintéticos'),
    h('div', { class: 'cartao' }, h('p', { class: 'pequeno suave' }, 'Um boneco articulado executa cada exercício com e sem cada erro previsto nas regras. Garante que o motor faz o que as regras dizem; não substitui a validação com vídeos reais.'),
      h('button', { id: 'rodar-sintetico', onclick: () => {
        const res = [];
        for (const [id, def] of Object.entries(biblioteca)) {
          const erros = Object.keys(MODELOS[id]?.erros || {});
          for (let s = 1; s <= 3; s++) res.push(avaliarGravacao(def, gerarSerie(id, [null, null, ...erros.flatMap((e) => [e, null])], { semente: s * 17 })));
        }
        trocar(saida1, quadroResumo(consolidar(res)));
      } }, 'Rodar verificação'), saida1));

  // 2. Gravações de pontos-chave
  const saida2 = h('div', { 'aria-live': 'polite' });
  const arq = h('input', { type: 'file', accept: '.json,application/json', multiple: true, 'aria-label': 'Arquivos de pontos-chave', onchange: async () => {
    const res = [], problemas = [];
    for (const f of arq.files) {
      try {
        const g = JSON.parse(await f.text());
        const p = validarGravacao(g) || (!biblioteca[g.exercicio] && `exercício desconhecido: ${g.exercicio}`);
        if (p) { problemas.push(`${f.name}: ${p}`); continue; }
        res.push({ nome: f.name, ...avaliarGravacao(biblioteca[g.exercicio], g) });
      } catch { problemas.push(`${f.name}: não é um JSON válido`); }
    }
    trocar(saida2, 
      problemas.length > 0 && h('div', { class: 'aviso erro' }, problemas.map((p) => h('div', {}, p))),
      res.length > 0 && h('div', {}, quadroResumo(consolidar(res)), h('table', { style: 'margin-top:12px' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Arquivo'), h('th', { class: 'n' }, 'Contadas'), h('th', { class: 'n' }, 'Reais'), h('th', {}, 'Repetições (motor)'))),
        h('tbody', {}, res.map((r) => h('tr', {}, h('td', {}, r.nome), h('td', { class: 'n' }, r.contadas), h('td', { class: 'n' }, r.rotulado ? r.reais : '–'), h('td', { class: 'pequeno' }, r.previsto.map((p) => (p.valida ? 'ok' : p.erros.join('+'))).join(', ') || 'nenhuma')))))));
  } });
  anexar(raiz, h('h2', {}, '2. Gravações de pontos-chave'),
    h('div', { class: 'cartao' }, h('p', { class: 'pequeno suave' }, 'Arquivos JSON com os quadros de pontos-chave e, se houver, os rótulos de cada repetição. O formato está descrito em docs/ambiente-de-testes.md.'), arq, saida2));

  // 3. Extração de pontos-chave de um vídeo
  const saida3 = h('div', { 'aria-live': 'polite' });
  const exSel = h('select', { 'aria-label': 'Exercício do vídeo' }, Object.values(biblioteca).map((def) => h('option', { value: def.id }, def.nome)));
  const vid = h('input', { type: 'file', accept: 'video/*', 'aria-label': 'Vídeo do exercício', onchange: async () => {
    const f = vid.files[0];
    if (!f) return;
    trocar(saida3, h('p', {}, 'Carregando o motor de visão…'));
    const video = h('video', { muted: true, playsinline: true, style: 'width:100%;max-height:40vh;border-radius:10px' });
    const url = URL.createObjectURL(f);
    try {
      detector ||= await criarDetector({ modelo: dados().config.modelo === 'lite' ? 'lite' : 'full', numPoses: 1 });
      video.src = url;
      await new Promise((ok, falha) => { video.onloadeddata = ok; video.onerror = () => falha(new Error('vídeo ilegível')); });
      const quadros = [];
      const status = h('p', {}, 'Extraindo pontos-chave…');
      trocar(saida3, video, status);
      const passo = 1 / 30;
      // Avança quadro a quadro pelo tempo do vídeo: resultado reprodutível, independente da velocidade do aparelho.
      for (let t = 0; t < video.duration; t += passo) {
        video.currentTime = t;
        await new Promise((ok) => { video.onseeked = ok; });
        const [pose] = detector.detectar(video, t * 1000 + 1);
        if (pose) quadros.push({ t: Math.round(t * 1000) / 1000, pontos: pose.pontos.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4), visibility: +(p.visibility ?? 0).toFixed(3) })) });
        if (quadros.length % 30 === 0) status.textContent = `Extraindo pontos-chave… ${Math.round((t / video.duration) * 100)}%`;
      }
      const g = { exercicio: exSel.value, fps: 30, aspecto: video.videoWidth / video.videoHeight, origem: f.name, quadros, rotulos: null };
      const r = avaliarGravacao(biblioteca[exSel.value], g);
      trocar(saida3, 
        h('p', {}, `${quadros.length} quadros com pessoa detectada. O motor contou ${r.contadas} repetições: ${r.previsto.map((p) => (p.valida ? 'ok' : p.erros.join('+'))).join(', ') || 'nenhuma'}.`),
        h('button', { onclick: () => baixar(`${f.name.replace(/\.[^.]+$/, '')}.pontos.json`, JSON.stringify(g)) }, 'Baixar pontos-chave (JSON)'),
        h('p', { class: 'pequeno suave', style: 'margin-top:8px' }, 'O arquivo contém só coordenadas do esqueleto, sem imagem. Acrescente o campo "rotulos" com a avaliação do profissional para medir a concordância.'));
    } catch (e) {
      console.error(e);
      trocar(saida3, h('div', { class: 'aviso erro' }, 'Não foi possível analisar este vídeo. Verifique o formato e a conexão (o motor de visão precisa estar carregado).'));
    } finally { URL.revokeObjectURL(url); }
  } });
  anexar(raiz, h('h2', {}, '3. Extrair pontos-chave de um vídeo'),
    h('div', { class: 'cartao' }, h('p', { class: 'pequeno suave' }, 'O vídeo é processado neste aparelho e não é enviado. O resultado é um arquivo só com os pontos-chave, que pode ser rotulado e reutilizado nos testes de regressão.'),
      h('label', {}, 'Exercício', exSel), h('label', {}, 'Vídeo', vid), saida3));

  return () => { detector?.fechar(); };
}
