// Montador de ficha (seção 3.5): exercícios, séries, repetições, carga, cadência, descanso,
// método e lados; aquecimento e divisão (A, B, C).

import { dados, salvar, novoId, ROTULOS } from '../dados.js';
import { novoItem, validarFicha, filtrarBiblioteca, AQUECIMENTOS, montarPlano } from '../motor/plano.js';
import { h, trocar, anexar, ir, confirmar, kg } from '../ui.js';

export function montar(raiz, ctx) {
  return ctx.rota === 'ficha' ? editor(raiz, ctx) : lista(raiz, ctx);
}

function lista(raiz, { biblioteca }) {
  const d = dados();
  anexar(raiz, h('h1', {}, 'Fichas de treino'), h('p', { class: 'suave' }, 'Cada ficha é um treino. Com mais de uma, o aplicativo alterna entre elas (A, B, C).'));
  if (!d.fichas.length) anexar(raiz, h('p', {}, 'Nenhuma ficha ainda.'));
  for (const f of d.fichas) {
    anexar(raiz, h('div', { class: 'cartao' },
      h('div', { class: 'linha entre' }, h('h3', {}, f.nome), f.divisao && h('span', { class: 'etiqueta' }, `Divisão ${f.divisao}`)),
      h('ul', { class: 'limpa pequeno suave', style: 'margin:6px 0 12px' }, f.itens.map((it) => h('li', {}, `${biblioteca[it.exercicio]?.nome || it.exercicio} · ${it.series}×${it.repeticoes} · ${kg(it.carga_kg)}`))),
      h('div', { class: 'linha' },
        h('a', { class: 'botao primario cresce', href: `#/treino/${f.id}` }, 'Treinar'),
        h('a', { class: 'botao', href: `#/ficha/${f.id}` }, 'Editar'))));
  }
  anexar(raiz, h('a', { class: 'botao largo', href: '#/ficha/nova' }, 'Nova ficha'));
}

function editor(raiz, { param, biblioteca }) {
  const d = dados();
  const existente = d.fichas.find((f) => f.id === param);
  const ficha = existente ? structuredClone(existente) : { id: novoId(), nome: '', divisao: String.fromCharCode(65 + Math.min(d.fichas.length, 5)), aquecimento: ['marcha_parada'], itens: [] };
  const disponiveis = filtrarBiblioteca(biblioteca, d.perfil);
  const erro = h('div', { class: 'aviso erro', role: 'alert', hidden: true });

  const nome = h('input', { type: 'text', value: ficha.nome, maxlength: 60, placeholder: 'Ex.: Treino A – Membros superiores', oninput: (e) => { ficha.nome = e.target.value; } });
  const divisao = h('select', { onchange: (e) => { ficha.divisao = e.target.value; } }, ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => h('option', { value: x, selected: ficha.divisao === x }, x)));
  const itens = h('div');
  const resumo = h('p', { class: 'pequeno suave' });

  const num = (rot, obj, chave, o = {}) => h('label', { class: 'pequeno', style: 'margin:0' }, rot,
    h('input', { type: 'number', inputmode: 'decimal', min: o.min ?? 0, max: o.max ?? 999, step: o.passo ?? 1, value: obj[chave] ?? 0, oninput: (e) => { obj[chave] = Number(e.target.value); atualizarResumo(); } }));
  const sel = (rot, obj, chave, mapa) => h('label', { class: 'pequeno', style: 'margin:0' }, rot,
    h('select', { onchange: (e) => { obj[chave] = e.target.value; atualizarResumo(); } }, Object.entries(mapa).map(([v, t]) => h('option', { value: v, selected: obj[chave] === v }, t))));

  function atualizarResumo() {
    const p = montarPlano(ficha, biblioteca).filter((x) => x.tipo === 'serie');
    const seg = p.reduce((s, x) => s + x.alvo * 4 + x.descanso_s, 0) + (ficha.aquecimento || []).reduce((s, id) => s + (AQUECIMENTOS[id]?.duracao_s || 0), 0);
    resumo.textContent = p.length ? `${p.length} séries no total · cerca de ${Math.max(1, Math.round(seg / 60))} min` : '';
  }

  function desenharItens() {
    trocar(itens, ...ficha.itens.map((it, i) => {
      const def = biblioteca[it.exercicio];
      const alerta = disponiveis.find((x) => x.def.id === it.exercicio)?.alerta || [];
      it.cadencia_s ||= { subida: 1, pausa_topo: 1, descida: 2 };
      const mover = (delta) => { const j = i + delta; if (j < 0 || j >= ficha.itens.length) return; [ficha.itens[i], ficha.itens[j]] = [ficha.itens[j], ficha.itens[i]]; desenharItens(); };
      return h('div', { class: 'cartao' },
        h('div', { class: 'linha entre' }, h('h3', {}, `${i + 1}. ${def?.nome || it.exercicio}`),
          h('div', { class: 'linha' },
            h('button', { class: 'fantasma', 'aria-label': 'Mover para cima', disabled: i === 0, onclick: () => mover(-1) }, '↑'),
            h('button', { class: 'fantasma', 'aria-label': 'Mover para baixo', disabled: i === ficha.itens.length - 1, onclick: () => mover(1) }, '↓'),
            h('button', { class: 'fantasma', 'aria-label': `Remover ${def?.nome}`, onclick: () => { ficha.itens.splice(i, 1); desenharItens(); } }, '✕'))),
        alerta.length > 0 && h('div', { class: 'aviso pequeno' }, `Atenção: este exercício exige ${alerta.map((a) => ROTULOS.lesoes[a].toLowerCase()).join(' e ')}, região em que você informou lesão ou dor.`),
        h('p', { class: 'pequeno suave', style: 'margin:4px 0 10px' }, `Câmera ${def?.vista_camera === 'lateral' ? 'de lado' : 'de frente'}${def?.equipamento?.length ? ` · ${def.equipamento.map((e) => ROTULOS.equipamento[e] || e).join(', ')}` : ' · peso do corpo'}`),
        h('div', { class: 'grade' },
          num('Séries', it, 'series', { min: 1, max: 10 }),
          num('Repetições', it, 'repeticoes', { min: 1, max: 50 }),
          num('Carga (kg)', it, 'carga_kg', { passo: 0.5, max: 300 }),
          num('Descanso (s)', it, 'descanso_s', { passo: 5, max: 600 })),
        h('details', { style: 'margin-top:12px' }, h('summary', { class: 'pequeno' }, 'Cadência, método e lados'),
          h('div', { class: 'grade', style: 'margin-top:10px' },
            num('Subida (s)', it.cadencia_s, 'subida', { passo: 0.5, max: 10 }),
            num('Pausa no topo (s)', it.cadencia_s, 'pausa_topo', { passo: 0.5, max: 10 }),
            num('Descida (s)', it.cadencia_s, 'descida', { passo: 0.5, max: 10 }),
            sel('Método', it, 'metodo', ROTULOS.metodo),
            sel('Lados', it, 'lados', ROTULOS.lados)),
          h('p', { class: 'pequeno suave', style: 'margin-top:8px' }, 'A cadência planejada é comparada com o tempo real de cada fase. Bi-set junta este exercício com o próximo, sem descanso entre eles. Drop set acrescenta uma série final com carga 20% menor.')));
    }));
    atualizarResumo();
  }

  const adicionar = h('select', { 'aria-label': 'Adicionar exercício', onchange: (e) => {
    if (!e.target.value) return;
    ficha.itens.push(novoItem(e.target.value, d.perfil.nivel));
    e.target.value = '';
    desenharItens();
  } }, h('option', { value: '' }, 'Adicionar exercício…'), disponiveis.map(({ def, alerta }) => h('option', { value: def.id }, def.nome + (alerta.length ? ' (atenção: lesão informada)' : ''))));

  const ocultos = Object.values(biblioteca).length - disponiveis.length;
  const aquec = h('div', { class: 'opcoes' }, Object.entries(AQUECIMENTOS).map(([id, a]) => h('label', { class: 'opcao' },
    h('input', { type: 'checkbox', checked: (ficha.aquecimento || []).includes(id), onchange: (e) => {
      ficha.aquecimento = (ficha.aquecimento || []).filter((x) => x !== id);
      if (e.target.checked) ficha.aquecimento.push(id);
      atualizarResumo();
    } }), h('span', {}, a.nome))));

  anexar(raiz, 
    h('h1', {}, existente ? 'Editar ficha' : 'Nova ficha'),
    h('label', {}, 'Nome da ficha', nome),
    h('label', {}, 'Divisão', divisao),
    h('h2', {}, 'Aquecimento'), aquec,
    h('h2', {}, 'Exercícios'), itens, adicionar,
    ocultos > 0 && h('p', { class: 'pequeno suave', style: 'margin-top:8px' }, `${ocultos} ${ocultos === 1 ? 'exercício não aparece' : 'exercícios não aparecem'} porque pedem equipamento que você não informou. Atualize em Perfil.`),
    resumo, erro,
    h('div', { class: 'linha', style: 'margin-top:16px' },
      h('a', { class: 'botao fantasma', href: '#/fichas' }, 'Cancelar'),
      h('button', { class: 'primario cresce', onclick: () => {
        const p = validarFicha(ficha, biblioteca);
        if (p.length) { trocar(erro, ...p.map((x) => h('div', {}, x))); erro.hidden = false; return; }
        ficha.nome = ficha.nome.trim();
        const i = d.fichas.findIndex((f) => f.id === ficha.id);
        if (i >= 0) d.fichas[i] = ficha; else d.fichas.push(ficha);
        salvar(); ir('/fichas');
      } }, 'Salvar ficha')),
    existente && h('button', { class: 'fantasma largo', style: 'margin-top:12px;color:var(--erro)', onclick: async () => {
      if (!(await confirmar('Excluir ficha?', `"${existente.nome}" será apagada. O histórico de treinos continua guardado.`, 'Excluir', true))) return;
      d.fichas = d.fichas.filter((f) => f.id !== ficha.id); salvar(); ir('/fichas');
    } }, 'Excluir ficha'));
  desenharItens();
}
