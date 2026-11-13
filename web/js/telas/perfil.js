// Perfil, configurações e privacidade (exportar e apagar os dados: LGPD, art. 18).

import { dados, salvar, apagarTudo, exportar, ROTULOS } from '../dados.js';
import { esquecerDisponibilidade } from '../agente.js';
import { escutaDisponivel } from '../voz.js';
import { h, trocar, anexar, confirmar, baixar } from '../ui.js';

export function montar(raiz) {
  const d = dados();
  const p = d.perfil;
  const alternar = (rotulo, detalhe, obj, chave, { desabilitado = false, aoMudar } = {}) => h('label', { class: 'marcar' },
    h('input', { type: 'checkbox', checked: !!obj[chave], disabled: desabilitado, onchange: (e) => { obj[chave] = e.target.checked; salvar(); aoMudar?.(); } }),
    h('span', {}, h('strong', {}, rotulo), detalhe && h('span', { class: 'suave pequeno', style: 'display:block' }, detalhe)));
  const escolha = (rotulo, obj, chave, mapa) => h('label', {}, rotulo, h('select', { onchange: (e) => { obj[chave] = e.target.value; salvar(); } }, Object.entries(mapa).map(([v, t]) => h('option', { value: v, selected: obj[chave] === v }, t))));

  anexar(raiz, 
    h('h1', {}, 'Perfil'),
    h('div', { class: 'cartao' },
      h('ul', { class: 'limpa' },
        h('li', {}, h('span', { class: 'suave' }, 'Objetivo: '), ROTULOS.objetivo[p.objetivo]),
        h('li', {}, h('span', { class: 'suave' }, 'Nível: '), ROTULOS.nivel[p.nivel]),
        h('li', {}, h('span', { class: 'suave' }, 'Equipamento: '), ['Peso do corpo', ...p.equipamento.map((e) => ROTULOS.equipamento[e])].join(', ')),
        h('li', {}, h('span', { class: 'suave' }, 'Lesões ou dores: '), p.lesoes.length ? p.lesoes.map((l) => ROTULOS.lesoes[l]).join(', ') : 'nenhuma informada'),
        h('li', {}, h('span', { class: 'suave' }, 'Triagem (PAR-Q): '), p.parq?.risco ? 'indicou buscar liberação médica' : 'sem respostas de risco')),
      h('a', { class: 'botao largo', href: '#/cadastro', style: 'margin-top:8px' }, 'Atualizar perfil e triagem')),

    h('h2', {}, 'Treino'),
    h('div', { class: 'cartao' },
      alternar('Voz do coach', 'Correções e contagem faladas em voz alta.', d.config, 'falar'),
      alternar('Comandos de voz', escutaDisponivel() ? 'Em alguns navegadores, o áudio do microfone é enviado ao serviço de reconhecimento de fala do próprio navegador.' : 'Este navegador não oferece reconhecimento de fala. Use os botões da tela de treino.', d.consentimentos, 'voz', { desabilitado: !escutaDisponivel() }),
      alternar('Coach com inteligência artificial', 'Envia a um serviço de IA só os números do treino (nunca imagens) para comentar as séries e escrever o relatório. Precisa de conexão.', d.consentimentos, 'agente', { aoMudar: esquecerDisponibilidade }),
      alternar('Espelhar a imagem', 'Mostra o vídeo como um espelho.', d.config, 'espelhar'),
      escolha('Precisão do modelo de pose', d.config, 'modelo', { auto: 'Automático, conforme o aparelho', lite: 'Leve (mais rápido)', full: 'Completo (mais preciso)' }),
      alternar('Ângulos em três dimensões (experimental)', 'Usa as coordenadas 3D estimadas pelo modelo, menos sensíveis à posição da câmera.', d.config, 'usar3d'),
      escolha('Fonte do movimento', d.config, 'fonte', { camera: 'Câmera', demonstracao: 'Demonstração (pessoa simulada, sem câmera)' })),

    h('h2', {}, 'Seus dados'),
    h('div', { class: 'cartao' },
      h('p', { class: 'pequeno suave' }, 'Perfil, fichas e histórico ficam guardados só neste aparelho. O vídeo nunca é gravado.'),
      h('div', { class: 'linha' },
        h('button', { class: 'cresce', onclick: () => baixar(`meus-dados-treino-${new Date().toISOString().slice(0, 10)}.json`, exportar()) }, 'Exportar meus dados'),
        h('button', { class: 'cresce', style: 'color:var(--erro)', onclick: async () => {
          if (!(await confirmar('Apagar todos os dados?', 'Perfil, fichas e histórico de treinos serão apagados deste aparelho. Não dá para desfazer.', 'Apagar tudo', true))) return;
          apagarTudo(); location.hash = '#/cadastro';
        } }, 'Apagar tudo'))),

    h('h2', {}, 'Pesquisa'),
    h('a', { class: 'botao largo', href: '#/testes' }, 'Ambiente de testes do motor'),
    h('p', { class: 'pequeno suave', style: 'margin-top:16px' }, 'Este aplicativo avalia a técnica de execução. Não substitui profissional de saúde ou de educação física e não prescreve treino para condições clínicas.'));
}
