// Avaliador das condições declarativas das regras de erro (ex.: "min_angulo_cotovelo > 60").
// Gramática mínima, sem eval:
//   expr  := termo ( "ou" termo )*
//   termo := comp  ( "e" comp )*
//   comp  := valor OP valor | "(" expr ")"
//   valor := número | identificador
// Operadores: > >= < <= == !=

const OPS = {
  '>': (a, b) => a > b, '>=': (a, b) => a >= b,
  '<': (a, b) => a < b, '<=': (a, b) => a <= b,
  '==': (a, b) => a === b, '!=': (a, b) => a !== b,
};

function tokenizar(txt) {
  const re = /\s*(>=|<=|==|!=|>|<|\(|\)|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/y;
  const out = [];
  let pos = 0;
  while (pos < txt.length) {
    if (/^\s*$/.test(txt.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(txt);
    if (!m) throw new Error(`Condição inválida perto de "${txt.slice(pos, pos + 12)}"`);
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

export function compilar(txt) {
  const tk = tokenizar(String(txt));
  let i = 0;
  const idents = new Set();
  const comparacoes = [];

  const valor = () => {
    const t = tk[i++];
    if (t === undefined) throw new Error('Condição incompleta');
    if (/^-?\d/.test(t)) return { num: Number(t) };
    if (/^[A-Za-z_]/.test(t) && t !== 'e' && t !== 'ou') { idents.add(t); return { id: t }; }
    throw new Error(`Valor inesperado: ${t}`);
  };
  const comp = () => {
    if (tk[i] === '(') { i++; const e = expr(); if (tk[i++] !== ')') throw new Error('Falta ")"'); return e; }
    const a = valor(); const op = tk[i++]; const b = valor();
    if (!OPS[op]) throw new Error(`Operador inválido: ${op}`);
    const no = { tipo: 'comp', a, op, b };
    comparacoes.push(no);
    return no;
  };
  const termo = () => { let n = comp(); while (tk[i] === 'e') { i++; n = { tipo: 'e', a: n, b: comp() }; } return n; };
  const expr = () => { let n = termo(); while (tk[i] === 'ou') { i++; n = { tipo: 'ou', a: n, b: termo() }; } return n; };

  const arvore = expr();
  if (i < tk.length) throw new Error(`Sobrou "${tk[i]}" na condição`);

  const ler = (v, vars) => (v.num !== undefined ? v.num : vars[v.id]);
  const rodar = (n, vars) => {
    if (n.tipo === 'e') return rodar(n.a, vars) && rodar(n.b, vars);
    if (n.tipo === 'ou') return rodar(n.a, vars) || rodar(n.b, vars);
    const a = ler(n.a, vars), b = ler(n.b, vars);
    // Variável ausente ou não numérica: a regra não dispara (nunca julgar com dado ruim).
    if (typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b)) return false;
    return OPS[n.op](a, b);
  };

  return {
    texto: txt,
    identificadores: [...idents],
    avaliar: (vars) => rodar(arvore, vars),
    /** Primeira comparação: valor medido x valor configurado, para explicar o erro. */
    explicar: (vars) => {
      const c = comparacoes[0];
      if (!c) return null;
      const lado = c.a.id ? [c.a, c.b] : [c.b, c.a];
      const medido = ler(lado[0], vars), configurado = ler(lado[1], vars);
      return {
        variavel: lado[0].id ?? null,
        medido: typeof medido === 'number' ? Math.round(medido * 100) / 100 : null,
        configurado: typeof configurado === 'number' ? configurado : null,
      };
    },
  };
}
