// Voz do coach (síntese de fala do navegador, pt-BR) e comandos de voz (reconhecimento de fala).

const sintese = typeof window !== 'undefined' ? window.speechSynthesis : null;
const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const vozDisponivel = () => Boolean(sintese);
export const escutaDisponivel = () => Boolean(Reconhecimento);

export class Voz {
  constructor({ ativa = true, aoFalar = () => {} } = {}) {
    this.ativa = ativa;
    this.aoFalar = aoFalar;   // legenda na tela: a fala também é mostrada por escrito
    this.fila = [];
    this.falando = null;
    this.voz = null;
    this.rec = null;
    this.escutando = false;
    this.silencioAte = 0;
    if (sintese) {
      const escolher = () => {
        const vs = sintese.getVoices().filter((v) => /^pt[-_]BR/i.test(v.lang));
        this.voz = vs.find((v) => v.localService) || vs[0] || sintese.getVoices().find((v) => /^pt/i.test(v.lang)) || null;
      };
      escolher();
      sintese.addEventListener?.('voiceschanged', escolher);
    }
  }

  /** prioridade: 'alta' interrompe o que estiver sendo dito; 'baixa' é descartada se houver fala em curso. */
  falar(texto, prioridade = 'normal') {
    if (!texto) return;
    this.aoFalar(texto, prioridade);
    if (!this.ativa || !sintese) return;
    if (prioridade === 'alta') { this.fila = []; sintese.cancel(); this.falando = null; }
    else if (prioridade === 'baixa' && (this.falando || this.fila.length)) return;
    else if (this.fila.length >= 3) this.fila.shift();
    this.fila.push(texto);
    this.#proxima();
  }

  #proxima() {
    if (this.falando || !this.fila.length) return;
    const texto = this.fila.shift();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.rate = 1.05; u.pitch = 1;
    if (this.voz) u.voice = this.voz;
    const fim = () => { if (this.falando === u) { this.falando = null; this.silencioAte = performance.now() + 500; this.#proxima(); } };
    u.onend = fim; u.onerror = fim;
    this.falando = u;
    this.textoAtual = texto;
    sintese.speak(u);
    // Alguns navegadores não disparam "onend": libera a fila por tempo.
    setTimeout(fim, 1500 + texto.length * 90);
  }

  calar() { this.fila = []; this.falando = null; sintese?.cancel(); }

  /**
   * Liga os comandos de voz. No Chrome, o reconhecimento de fala envia o áudio do microfone
   * a um serviço do navegador; por isso é opcional e só liga com consentimento.
   */
  escutar(aoOuvir) {
    if (!Reconhecimento || this.escutando) return false;
    const rec = new Reconhecimento();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 2;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue;
        const texto = ev.results[i][0].transcript.trim();
        // Enquanto o coach fala, o microfone capta a própria voz dele: ignora (eco).
        const eco = this.falando || performance.now() < this.silencioAte;
        if (eco && !(/\b(dor|parar)\b/i.test(texto) && !/\b(dor|parar)\b/i.test(this.textoAtual || ''))) continue;
        aoOuvir(texto);
      }
    };
    rec.onend = () => { if (this.escutando) { try { rec.start(); } catch { /* já reiniciando */ } } };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.escutando = false; };
    try { rec.start(); } catch { return false; }
    this.rec = rec; this.escutando = true;
    return true;
  }

  pararEscuta() { this.escutando = false; try { this.rec?.stop(); } catch { /* nada */ } this.rec = null; }
}
