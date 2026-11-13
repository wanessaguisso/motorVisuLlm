// Utilidades de interface: criação de elementos sem innerHTML (texto do usuário nunca vira HTML).

export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export const ir = (rota) => { location.hash = rota; };

export function opcoes(nome, mapa, valor, { multiplo = false } = {}) {
  const sel = new Set(multiplo ? valor || [] : [valor]);
  return h('div', { class: 'opcoes' }, Object.entries(mapa).map(([v, rot]) => h('label', { class: 'opcao' },
    h('input', { type: multiplo ? 'checkbox' : 'radio', name: nome, value: v, checked: sel.has(v) }),
    h('span', {}, rot))));
}

export function lerOpcoes(form, nome, multiplo = false) {
  const marcados = [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map((i) => i.value);
  return multiplo ? marcados : marcados[0] ?? null;
}

export function campoNumero(rotulo, valor, { min = 0, max = 999, passo = 1, sufixo = '' } = {}) {
  const input = h('input', { type: 'number', inputmode: 'decimal', min, max, step: passo, value: valor });
  return { el: h('label', {}, rotulo + (sufixo ? ` (${sufixo})` : ''), input), input, valor: () => Number(input.value) };
}

export function dataCurta(ms) {
  return new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function duracao(s) {
  const m = Math.round(s / 60);
  return m < 1 ? 'menos de 1 min' : `${m} min`;
}

export function kg(n, curto = false) { return n > 0 ? `${String(n).replace('.', ',')} kg` : (curto ? 'corpo' : 'peso do corpo'); }

export const dec = (n) => String(n).replace('.', ',');

export function confirmar(titulo, texto, rotuloSim = 'Confirmar', perigo = false) {
  return new Promise((resolver) => {
    const d = h('dialog', {},
      h('h2', { style: 'margin-top:0' }, titulo), h('p', {}, texto),
      h('div', { class: 'linha' },
        h('button', { class: 'cresce', onclick: () => { d.close(); d.remove(); resolver(false); } }, 'Cancelar'),
        h('button', { class: `cresce ${perigo ? 'perigo' : 'primario'}`, onclick: () => { d.close(); d.remove(); resolver(true); } }, rotuloSim)));
    d.addEventListener('cancel', () => { d.remove(); resolver(false); });
    document.body.append(d);
    d.showModal();
  });
}

export function baixar(nome, texto, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = h('a', { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const validos = (filhos) => filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false);
/** Como append/replaceChildren, mas ignora null, undefined e false (permite `cond && elemento`). */
export function anexar(el, ...filhos) { el.append(...validos(filhos)); return el; }
export function trocar(el, ...filhos) { el.replaceChildren(...validos(filhos)); return el; }
