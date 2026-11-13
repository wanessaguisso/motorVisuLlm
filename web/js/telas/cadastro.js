// Perfil e triagem de saúde (seção 3.4), feitos uma vez: consentimento (LGPD), perfil,
// questionário PAR-Q e aviso de escopo.

import { dados, salvar, fichaInicial, ROTULOS, PARQ } from '../dados.js';
import { h, trocar, anexar, opcoes, lerOpcoes, ir } from '../ui.js';

export function montar(raiz, { biblioteca }) {
  const d = dados();
  const rasc = { perfil: d.perfil ? { ...d.perfil } : { objetivo: 'condicionamento', nivel: 'iniciante', lesoes: [], lado_dominante: 'direito', equipamento: [] }, parq: d.perfil?.parq?.respostas || PARQ.map(() => null) };
  let passo = 0;

  const erro = h('div', { class: 'aviso erro', role: 'alert', hidden: true });
  const falhar = (msg) => { erro.textContent = msg; erro.hidden = false; erro.scrollIntoView({ block: 'center' }); };

  const passos = [
    () => h('form', {},
      h('h1', {}, 'Seu treino em casa, com alguém de olho na sua técnica'),
      h('p', { class: 'suave' }, 'A câmera do celular acompanha o seu movimento, conta as repetições e avisa por voz quando algo pode melhorar. Sem academia, sem ninguém te olhando.'),
      h('div', { class: 'cartao' },
        h('h2', { style: 'margin-top:0' }, 'Privacidade'),
        h('ul', {},
          h('li', {}, 'O vídeo é analisado só neste aparelho. Ele não é gravado nem enviado para lugar nenhum.'),
          h('li', {}, 'Ficam guardados, também só neste aparelho, o seu perfil, as respostas de saúde e os números dos treinos.'),
          h('li', {}, 'Você pode exportar ou apagar tudo quando quiser, em Perfil.')),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'maior', checked: !!d.perfil }), h('span', {}, 'Tenho 18 anos ou mais.')),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'saude', checked: !!d.consentimentos.saude }), h('span', {}, 'Autorizo o aplicativo a guardar neste aparelho meus dados de saúde (lesões e respostas da triagem) e as métricas dos meus treinos, para adaptar e acompanhar o treino.'))),
      h('div', { class: 'cartao' },
        h('h2', { style: 'margin-top:0' }, 'Opcional'),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'agente', checked: d.consentimentos.agente }), h('span', {}, h('strong', {}, 'Coach com inteligência artificial. '), 'Para comentar as séries e escrever o relatório, o aplicativo envia a um serviço de IA apenas os números do treino (repetições, erros detectados, carga). Nunca imagens, nunca seu nome.')),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'voz', checked: d.consentimentos.voz }), h('span', {}, h('strong', {}, 'Comandos de voz. '), 'Dizer "próximo", "pausar" ou "dor" sem tocar na tela. Em alguns navegadores, o reconhecimento de fala envia o áudio do microfone ao serviço do próprio navegador.')),
        h('p', { class: 'pequeno suave' }, 'Os dois podem ser ligados ou desligados depois. Sem eles o treino funciona igual, com botões grandes e frases padronizadas.'))),

    () => h('form', {},
      h('h1', {}, 'Sobre você'),
      h('p', { class: 'suave' }, 'Leva um minuto e serve para montar um treino do seu tamanho.'),
      h('fieldset', {}, h('legend', {}, 'Qual é o seu objetivo?'), opcoes('objetivo', ROTULOS.objetivo, rasc.perfil.objetivo)),
      h('fieldset', {}, h('legend', {}, 'Como você se vê hoje?'), opcoes('nivel', { iniciante: 'Iniciante ou parada há tempos', intermediario: 'Treino às vezes', avancado: 'Treino com regularidade' }, rasc.perfil.nivel)),
      h('fieldset', {}, h('legend', {}, 'O que você tem em casa? (além do peso do corpo)'), opcoes('equipamento', ROTULOS.equipamento, rasc.perfil.equipamento, { multiplo: true })),
      h('fieldset', {}, h('legend', {}, 'Tem lesão ou dor atual em alguma região?'), opcoes('lesoes', ROTULOS.lesoes, rasc.perfil.lesoes, { multiplo: true }),
        h('p', { class: 'pequeno suave', style: 'margin-top:8px' }, 'Exercícios que exigem essa região ficam sinalizados e fora da ficha inicial.')),
      h('fieldset', {}, h('legend', {}, 'Lado dominante'), opcoes('lado_dominante', { direito: 'Direito', esquerdo: 'Esquerdo' }, rasc.perfil.lado_dominante))),

    () => h('form', {},
      h('h1', {}, 'Triagem de saúde'),
      h('p', { class: 'suave' }, 'Sete perguntas do questionário PAR-Q, usado antes de começar a praticar atividade física. Responda com sinceridade.'),
      PARQ.map((p, i) => h('fieldset', { class: 'cartao' }, h('legend', { style: 'float:left;width:100%;font-weight:400' }, `${i + 1}. ${p}`),
        h('div', { style: 'clear:both;padding-top:8px' }, opcoes(`parq${i}`, { nao: 'Não', sim: 'Sim' }, rasc.parq[i] === true ? 'sim' : rasc.parq[i] === false ? 'nao' : null))))),

    () => {
      const risco = rasc.parq.some((r) => r === true);
      return h('form', {},
        h('h1', {}, 'Antes de começar'),
        risco && h('div', { class: 'aviso' }, h('strong', {}, 'Converse com um médico antes de treinar. '), 'Pelo menos uma resposta da triagem indica que você deve ter liberação médica antes de começar um programa de exercícios.',
          h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'liberacao' }), h('span', {}, 'Já tenho liberação médica para praticar exercícios, ou vou consegui-la antes de treinar.'))),
        h('div', { class: 'cartao' },
          h('p', {}, 'Este aplicativo ', h('strong', {}, 'avalia a técnica de execução'), ' dos exercícios. Ele:'),
          h('ul', {},
            h('li', {}, 'não substitui um profissional de saúde nem um profissional de educação física;'),
            h('li', {}, 'não prescreve treino para doenças ou condições clínicas;'),
            h('li', {}, 'não sabe se a carga é adequada para você: comece leve e suba aos poucos.')),
          h('p', {}, 'Se sentir dor, tontura ou mal-estar, pare. Durante o treino há sempre um botão ', h('strong', {}, 'DOR'), ' na tela.'),
          h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'aviso' }), h('span', {}, 'Li e aceito este aviso.'))));
    },
  ];

  const validar = [
    (f) => {
      if (!f.maior.checked) return 'Esta primeira versão é restrita a maiores de 18 anos.';
      if (!f.saude.checked) return 'Sem essa autorização o aplicativo não tem como guardar seu perfil e seus treinos.';
      rasc.consent = { saude: new Date().toISOString(), agente: f.agente.checked, voz: f.voz.checked };
      return null;
    },
    (f) => {
      rasc.perfil = { ...rasc.perfil, objetivo: lerOpcoes(f, 'objetivo'), nivel: lerOpcoes(f, 'nivel'), equipamento: lerOpcoes(f, 'equipamento', true), lesoes: lerOpcoes(f, 'lesoes', true), lado_dominante: lerOpcoes(f, 'lado_dominante') };
      return rasc.perfil.objetivo && rasc.perfil.nivel ? null : 'Escolha o objetivo e o nível.';
    },
    (f) => {
      rasc.parq = PARQ.map((_, i) => { const v = lerOpcoes(f, `parq${i}`); return v === 'sim' ? true : v === 'nao' ? false : null; });
      return rasc.parq.includes(null) ? 'Responda às sete perguntas.' : null;
    },
    (f) => {
      if (f.liberacao && !f.liberacao.checked) return 'Confirme a liberação médica para continuar.';
      return f.aviso.checked ? null : 'É preciso aceitar o aviso para usar o aplicativo.';
    },
  ];

  const corpo = h('div');
  const avancar = h('button', { class: 'primario cresce', onclick: () => {
    erro.hidden = true;
    const msg = validar[passo](corpo.querySelector('form'));
    if (msg) return falhar(msg);
    if (passo < passos.length - 1) { passo++; return desenhar(); }
    const risco = rasc.parq.some((r) => r === true);
    const novo = !d.perfil;
    d.perfil = { ...rasc.perfil, maior_de_idade: true, parq: { respostas: rasc.parq, risco, data: new Date().toISOString() }, aviso_aceito_em: new Date().toISOString(), liberacao_medica_declarada: risco };
    d.consentimentos = rasc.consent;
    if (novo || !d.fichas.length) d.fichas.push(fichaInicial(d.perfil, biblioteca));
    salvar();
    ir('/inicio');
  } });
  const voltar = h('button', { class: 'fantasma', onclick: () => { erro.hidden = true; if (passo > 0) { passo--; desenhar(); } else if (d.perfil) ir('/perfil'); } }, 'Voltar');
  const indicador = h('p', { class: 'pequeno suave', 'aria-live': 'polite' });

  function desenhar() {
    trocar(corpo, passos[passo]());
    corpo.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    indicador.textContent = `Passo ${passo + 1} de ${passos.length}`;
    avancar.textContent = passo === passos.length - 1 ? 'Concluir' : 'Continuar';
    voltar.hidden = passo === 0 && !d.perfil;
    window.scrollTo(0, 0);
  }
  anexar(raiz, indicador, corpo, erro, h('div', { class: 'linha', style: 'margin-top:20px' }, voltar, avancar));
  desenhar();
}
