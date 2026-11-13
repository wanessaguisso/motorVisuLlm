// Tela de treino: câmera, esqueleto sobreposto, contador em destaque e botões grandes.
// Pensada para ser usada a cerca de dois metros, sem as mãos (seção 3.8).

import { dados, salvar, novoId } from '../dados.js';
import { Sessao } from '../motor/sessao.js';
import { PessoaSimulada } from '../motor/sintetico.js';
import { interpretarComando } from '../motor/comandos.js';
import { Voz } from '../voz.js';
import { criarDetector, abrirCamera, criarMedidorDeLuz, manterTelaLigada } from '../visao.js';
import { desenharEsqueleto } from '../esqueleto.js';
import { consultar } from '../agente.js';
import { h, trocar, anexar, ir, kg, confirmar } from '../ui.js';

const TITULO = { preparo: 'Preparação', calibracao: 'Calibração' };

export async function montar(raiz, { param, biblioteca, consulta }) {
  const d = dados();
  const ficha = d.fichas.find((f) => f.id === param);
  if (!ficha) { raiz.className = ''; anexar(raiz, h('p', {}, 'Ficha não encontrada.'), h('a', { class: 'botao', href: '#/fichas' }, 'Ver fichas')); return null; }

  let demo = d.config.fonte === 'demonstracao' || consulta.has('demo');
  const veloz = demo ? Math.min(20, Math.max(1, Number(consulta.get('veloz')) || 1)) : 1;

  // ------------------------------------------------------------ elementos
  const video = h('video', { playsinline: true, muted: true, 'aria-hidden': 'true' });
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  const progresso = h('div', { class: 'progresso' });
  const nome = h('div', { class: 'nome' }), sub = h('div', { class: 'sub' });
  const mic = h('div', { class: 'mic' });
  const grande = h('span', { class: 'grande' }), alvo = h('span', { class: 'alvo' });
  const pv = h('span', { class: 'v' }), pi = h('span', { class: 'i' });
  const contador = h('div', { class: 'contador', 'aria-live': 'off' }, h('div', {}, grande, alvo), h('div', { class: 'placar' }, pv, pi));
  const centro = h('div', { class: 'centro', hidden: true });
  const legenda = h('div', { class: 'legenda', role: 'status', 'aria-live': 'polite' });
  const bPausa = h('button', { onclick: () => cmd(sessao.estado === 'pausado' ? 'continuar' : 'pausar') }, 'Pausar');
  const bProx = h('button', { onclick: () => cmd('proximo') }, 'Próximo');
  const bDor = h('button', { class: 'perigo', onclick: () => cmd('dor') }, 'DOR');
  const bMais = h('button', { 'aria-label': 'Mais opções', style: 'flex:.6', onclick: () => abrirMenu() }, '⋯');
  const base = h('div', { class: 'base' }, bPausa, bProx, bDor, bMais);
  const tela = h('div', { class: `treino${!demo && d.config.espelhar ? ' espelho' : ''}` }, video, canvas, progresso,
    h('div', { class: 'topo' }, h('div', {}, nome, sub), mic), contador, legenda, centro, base);
  anexar(raiz, tela);

  // ------------------------------------------------------------ estado
  let sessao = null, detector = null, camera = null, soltarTela = null, quadroId = 0, ativo = true;
  let inicioReal = 0, tSim = 0, ultimoVideoT = -1, ultimoProc = 0, mediaMs = 20, luz = null, tLuz = 0;
  let fala = { texto: '', tipo: '', ate: 0 };
  let chaveCentro = '', numeroCentro = null;
  let ultimoLivre = 0, tipoDaFala = '';
  const medirLuz = criarMedidorDeLuz();
  const estat = { consultas: 0, falas: 0, sem_base: 0 };
  const pessoa = new PessoaSimulada({ erros: { rosca_direta_halteres: { 3: 'cotovelo_foge' }, agachamento_livre: { 2: 'amplitude_curta' }, elevacao_lateral: { 4: 'acima_dos_ombros' } } });

  const voz = new Voz({
    ativa: d.config.falar && veloz === 1,
    aoFalar: (texto, prioridade) => {
      if (/^\d+$/.test(texto) || texto === 'Vai!') return;   // contagem: já está no contador
      fala = { texto, tipo: tipoDaFala, ate: performance.now() + Math.min(9000, 2200 + texto.length * 55), prioridade };
    },
  });

  const agora = () => (demo ? tSim : performance.now() / 1000);
  const cmd = (tipo, valor) => sessao?.comando({ tipo, valor }, agora());

  function emitir(e) {
    if (e.tipo === 'falar') {
      tipoDaFala = ['tecnica', 'seguranca'].includes(e.categoria) ? 'correcao' : e.categoria === 'dica' ? 'dica' : '';
      voz.falar(e.texto, e.prioridade);
      tipoDaFala = '';
    } else if (e.tipo === 'serie_fim') comentarSerie(e);
    else if (e.tipo === 'treino_fim') encerrar(e.resultado);
  }

  // ------------------------------------------------------------ agente de linguagem
  async function comentarSerie(e) {
    if (!e.proximo || e.serie.total === 0) return;
    estat.consultas++;
    const r = await consultar('entre_series', {
      serie: e.serie, perfil: { nivel: d.perfil.nivel, objetivo: d.perfil.objetivo },
      restam: e.restamSeriesDoExercicio, descanso_s: e.serie.descanso_s ?? null, sugestao_do_motor: sessao.sugestao?.tipo || null,
    });
    if (!r.usado) { estat.consultas--; return; }
    if (r.semBase) estat.sem_base++;
    if (!ativo || !r.resposta || sessao.estado !== 'descanso' || (sessao.visao().restante ?? 0) < 6) return;
    estat.falas++;
    voz.falar(r.resposta.fala, 'normal');
    if (r.resposta.sugestao) sessao.sugestaoDoAgente(r.resposta.sugestao);
  }

  async function comandoLivre(texto) {
    if (performance.now() - ultimoLivre < 5000 || !sessao || sessao.estado === 'concluido') return;
    ultimoLivre = performance.now();
    const ultima = sessao.series[sessao.series.length - 1] || null;
    estat.consultas++;
    const r = await consultar('comando_livre', { texto, estado: sessao.estado, serie: ultima, perfil: { nivel: d.perfil.nivel, objetivo: d.perfil.objetivo } });
    if (!r.usado) { estat.consultas--; return; }
    if (r.semBase) estat.sem_base++;
    if (!ativo || !r.resposta) return;
    estat.falas++;
    voz.falar(r.resposta.fala, 'normal');
    if (r.resposta.acao && r.resposta.acao !== 'nenhuma') cmd(r.resposta.acao);
  }

  function ligarEscuta() {
    if (!d.consentimentos.voz || veloz !== 1) { mic.textContent = ''; return; }
    const ok = voz.escutar((texto) => {
      const c = interpretarComando(texto);
      if (c) cmd(c.tipo, c.valor);
      else if (texto.trim().split(/\s+/).length >= 2) comandoLivre(texto);
    });
    mic.textContent = ok ? '● ouvindo' : 'voz indisponível';
    mic.classList.toggle('on', ok);
  }

  // ------------------------------------------------------------ fim
  function encerrar(resultado) {
    const treino = { id: novoId(), data: Date.now(), ...resultado, agente: { ...estat }, demonstracao: demo, nota: '' };
    // Guarda só métricas: nenhum quadro de vídeo é armazenado.
    if (treino.series.some((s) => s.total > 0)) { d.historico.push(treino); salvar(); setTimeout(() => ir(`/relatorio/${treino.id}`), veloz > 1 ? 0 : 2500); }
    else setTimeout(() => ir('/inicio'), veloz > 1 ? 0 : 2000);
  }

  // ------------------------------------------------------------ menu
  function abrirMenu() {
    const p = sessao?.passo;
    const carga = h('input', { type: 'number', inputmode: 'decimal', min: 0, max: 300, step: 0.5, value: p?.carga_kg ?? 0, 'aria-label': 'Carga em quilos' });
    const fechar = () => { dlg.close(); dlg.remove(); };
    const dlg = h('dialog', {}, h('div', { class: 'pilha' },
      h('h2', { style: 'margin:0' }, 'Opções'),
      h('button', { onclick: () => { cmd('repetir'); fechar(); } }, 'Repetir a série'),
      h('div', { class: 'linha' }, h('div', { class: 'cresce' }, carga), h('button', { onclick: () => { cmd('carga', Number(carga.value)); fechar(); } }, 'Registrar carga (kg)')),
      h('button', { onclick: () => { d.config.falar = !d.config.falar; voz.ativa = d.config.falar; if (!voz.ativa) voz.calar(); salvar(); fechar(); } }, d.config.falar ? 'Desligar a voz' : 'Ligar a voz'),
      h('button', { class: 'perigo', onclick: async () => { fechar(); if (await confirmar('Terminar o treino?', 'O que você já fez fica registrado.', 'Terminar')) cmd('terminar'); } }, 'Terminar treino'),
      h('button', { class: 'fantasma', onclick: fechar }, 'Fechar')));
    dlg.addEventListener('cancel', () => dlg.remove());
    anexar(tela, dlg); dlg.showModal();
  }

  // ------------------------------------------------------------ desenho
  function painel(chave, montarPainel) {
    if (chave === chaveCentro) return;
    chaveCentro = chave; numeroCentro = null;
    trocar(centro, );
    centro.hidden = !chave;
    if (chave) montarPainel();
  }
  const seg = (s) => String(Math.ceil(s ?? 0));

  function desenhar() {
    const v = sessao.visao();
    const p = v.passo;
    progresso.style.width = `${Math.round(v.progresso * 100)}%`;
    const emSerie = p?.tipo === 'serie';
    nome.textContent = TITULO[v.estado] || p?.nome || ficha.nome;
    sub.textContent = v.estado === 'preparo' ? 'Fique de corpo inteiro na imagem' : v.estado === 'calibracao' ? 'Em pé, parada, braços ao lado do corpo' : emSerie ? `Série ${p.serie} de ${p.totalSeries} · ${p.alvo} repetições · ${kg(p.carga_kg)}` : '';

    const mostraContador = emSerie && ['aguardando_pose', 'executando'].includes(v.estado);
    contador.hidden = !mostraContador && v.estado !== 'calibracao';
    if (v.estado === 'calibracao') { grande.textContent = seg(v.restante); alvo.textContent = ''; pv.hidden = pi.hidden = true; }
    else if (mostraContador) {
      grande.textContent = v.total; alvo.textContent = ` / ${p.alvo}`;
      pv.hidden = pi.hidden = false;
      pv.textContent = `✓ ${v.validas}`; pi.textContent = `✕ ${v.invalidas}`;
    }

    bPausa.textContent = v.estado === 'pausado' ? 'Continuar' : 'Pausar';
    bPausa.classList.toggle('primario', v.estado === 'pausado');
    base.hidden = v.estado === 'concluido';

    if (v.estado === 'contagem') painel('contagem', () => { numeroCentro = h('div', { class: 'grande' }); centro.style.background = 'transparent'; anexar(centro, numeroCentro); });
    else if (v.estado === 'aquecimento') painel(`aq${sessao.idx}`, () => { numeroCentro = h('div', { class: 'grande' }); centro.style.background = ''; anexar(centro, h('div', { class: 'titulo' }, `Aquecimento: ${p.nome}`), numeroCentro, h('div', { class: 'texto' }, p.instrucao)); });
    else if (v.estado === 'descanso') painel(`desc${sessao.idx}${v.sugestao ? 's' : ''}`, () => {
      numeroCentro = h('div', { class: 'grande' }); centro.style.background = '';
      const ult = sessao.series[sessao.series.length - 1];
      anexar(centro, h('div', { class: 'titulo' }, 'Descanso'), numeroCentro,
        ult && h('div', { class: 'texto' }, `Última série: ${ult.validas} de ${ult.total} com boa técnica`),
        v.proximo && h('div', { class: 'texto' }, `Depois: ${v.proximo.nome}${v.proximo.tipo === 'serie' ? ` · série ${v.proximo.serie} de ${v.proximo.totalSeries} · ${kg(v.proximo.carga_kg)}` : ''}`),
        v.sugestao && h('div', { class: 'cartao', style: 'margin-top:16px;max-width:26em' }, h('p', {}, v.sugestao.texto.replace(' Diga sim ou não.', '')),
          h('div', { class: 'linha' }, h('button', { class: 'cresce', onclick: () => cmd('nao') }, 'Não'), h('button', { class: 'cresce primario', onclick: () => cmd('sim') }, 'Sim'))));
    });
    else if (v.estado === 'pergunta_causa') painel('causa', () => {
      centro.style.background = '';
      anexar(centro, h('div', { class: 'titulo' }, 'Você parou antes da meta'), h('div', { class: 'texto' }, 'Tudo bem. O que aconteceu?'),
        h('div', { class: 'linha', style: 'margin-top:20px;width:min(100%,26em)' },
          h('button', { class: 'cresce', style: 'min-height:72px', onclick: () => cmd('falha') }, 'Cansei'),
          h('button', { class: 'cresce perigo', style: 'min-height:72px', onclick: () => cmd('dor') }, 'Senti dor')));
    });
    else if (v.estado === 'pausado') painel(`pausa${v.motivoPausa}`, () => {
      centro.style.background = '';
      const txt = v.motivoPausa === 'dor' ? 'Dor não faz parte do treino. Se ela continuar, encerre por hoje e procure um profissional de saúde.'
        : v.motivoPausa === 'parada' ? 'Série interrompida. Se sentiu dor, toque em DOR.'
          : v.motivoPausa === 'fora_do_quadro' ? 'Volte para a frente da câmera e eu continuo.' : 'Quando quiser voltar, toque em Continuar.';
      anexar(centro, h('div', { class: 'titulo' }, v.motivoPausa === 'dor' ? 'Série interrompida' : 'Pausado'), h('div', { class: 'texto' }, txt),
        ['dor', 'parada'].includes(v.motivoPausa) && h('div', { class: 'linha', style: 'margin-top:20px;width:min(100%,26em)' },
          h('button', { class: 'cresce', style: 'min-height:72px', onclick: () => cmd('terminar') }, 'Terminar treino'),
          h('button', { class: 'cresce primario', style: 'min-height:72px', onclick: () => cmd('continuar') }, v.motivoPausa === 'dor' ? 'Próximo exercício' : 'Continuar')));
    });
    else if (v.estado === 'concluido') painel('fim', () => { centro.style.background = ''; anexar(centro, h('div', { class: 'titulo' }, 'Treino concluído'), h('div', { class: 'texto' }, 'Preparando o seu relatório…')); });
    else painel('', () => {});
    if (numeroCentro) numeroCentro.textContent = seg(v.restante);

    // Legenda: a fala do coach também aparece escrita; dicas de posicionamento em amarelo.
    const t = performance.now();
    const texto = t < fala.ate ? fala.texto : v.dica;
    const classe = t < fala.ate ? (fala.tipo || '') : 'dica';
    if (legenda.dataset.t !== (texto || '') || legenda.dataset.c !== classe) {
      legenda.dataset.t = texto || ''; legenda.dataset.c = classe;
      trocar(legenda, texto ? h('span', { class: classe }, texto) : '');
    }
    desenharEsqueleto(ctx, v.pontos, { chave: emSerie ? v.pontosChave : [], erro: v.pontosErro, visivel: v.visivel });
  }

  function ajustarCanvas(w, hh) {
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  }

  // ------------------------------------------------------------ laço principal
  function laco() {
    if (!ativo) return;
    quadroId = requestAnimationFrame(laco);
    if (demo) {
      const destino = ((performance.now() - inicioReal) / 1000) * veloz;
      let passos = 0;
      while (tSim < destino && passos++ < 40 && sessao.estado !== 'concluido') {
        tSim += 1 / 30;
        const q = pessoa.quadro(tSim, sessao.visao());
        ajustarCanvas(q.aspecto > 1 ? 960 : 540, q.aspecto > 1 ? 540 : 960);
        sessao.quadro(q);
      }
    } else {
      const t = performance.now();
      const novo = video.readyState >= 2 && video.currentTime !== ultimoVideoT;
      // Aparelho lento ou aquecendo: reduz a taxa de quadros analisados.
      const intervalo = mediaMs > 45 ? Math.min(140, mediaMs * 1.6) : 0;
      if (novo && t - ultimoProc >= intervalo) {
        ultimoVideoT = video.currentTime; ultimoProc = t;
        ajustarCanvas(video.videoWidth, video.videoHeight);
        if (t - tLuz > 1500) { tLuz = t; luz = medirLuz(video); }
        let poses = [];
        try { poses = detector.detectar(video, t); } catch (e) { console.error(e); }
        mediaMs = 0.9 * mediaMs + 0.1 * (performance.now() - t);
        sessao.quadro({ t: t / 1000, poses, aspecto: video.videoWidth / video.videoHeight, luminosidade: luz ?? undefined });
      } else sessao.tique(t / 1000);
    }
    desenhar();
  }

  async function iniciar() {
    centro.hidden = false;
    trocar(centro, h('div', { class: 'titulo' }, demo ? 'Preparando a demonstração…' : 'Preparando a câmera e o motor de visão…'), h('div', { class: 'texto' }, demo ? '' : 'Na primeira vez pode levar alguns segundos.'));
    try {
      if (!demo) {
        camera = await abrirCamera(video);
        detector = await criarDetector({ modelo: d.config.modelo, numPoses: 2 });
      }
    } catch (e) {
      console.error(e);
      camera?.fechar(); camera = null;
      trocar(centro, h('div', { class: 'titulo' }, 'Não consegui começar'),
        h('div', { class: 'texto' }, e.codigo ? e.message : 'O motor de visão não carregou. Verifique a conexão e tente de novo.'),
        h('div', { class: 'linha', style: 'margin-top:20px' },
          h('button', { onclick: () => iniciar() }, 'Tentar de novo'),
          h('button', { onclick: () => { demo = true; tela.classList.remove('espelho'); iniciar(); } }, 'Ver demonstração'),
          h('a', { class: 'botao', href: '#/inicio' }, 'Voltar')));
      return;
    }
    soltarTela = await manterTelaLigada();
    sessao = new Sessao({ ficha, biblioteca, perfil: d.perfil, config: { usar3d: d.config.usar3d }, emitir });
    chaveCentro = 'x';
    inicioReal = performance.now(); tSim = 0;
    sessao.iniciar(agora());
    ligarEscuta();
    laco();
  }

  // Primeiro toque: libera áudio e câmera (os navegadores exigem um gesto da pessoa).
  base.hidden = true; contador.hidden = true;
  if (veloz > 1) iniciar();
  else {
    centro.hidden = false;
    anexar(centro, h('div', { class: 'titulo' }, ficha.nome),
      h('div', { class: 'texto' }, demo ? 'Demonstração com uma pessoa simulada, sem câmera.' : 'Apoie o celular em pé, a uns dois metros, onde apareça o seu corpo inteiro. O vídeo é analisado só neste aparelho.'),
      h('div', { class: 'linha', style: 'margin-top:24px' },
        h('a', { class: 'botao', href: '#/inicio' }, 'Voltar'),
        h('button', { class: 'primario', style: 'min-width:12em;min-height:64px;font-size:1.2rem', onclick: () => { voz.falar(' ', 'baixa'); iniciar(); } }, 'Começar')));
  }

  const aoOcultar = () => { if (document.hidden && sessao && !['pausado', 'concluido'].includes(sessao.estado)) cmd('pausar'); };
  document.addEventListener('visibilitychange', aoOcultar);

  return () => {
    ativo = false;
    cancelAnimationFrame(quadroId);
    document.removeEventListener('visibilitychange', aoOcultar);
    voz.calar(); voz.pararEscuta();
    camera?.fechar(); detector?.fechar(); soltarTela?.();
  };
}
