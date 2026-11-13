# Personal Trainer Ativo — MVP

Plataforma web (PWA) para treino de musculação em casa em que a visão computacional atua como
personal trainer ativo: anuncia o exercício, conta as repetições, classifica cada uma como
válida ou inválida com o motivo, corrige por voz e por esqueleto colorido, percebe fadiga e
assimetria e gera o relatório do treino.

Este repositório implementa o MVP do projeto de pesquisa *Personal trainer ativo com visão
computacional* (FAESA, Ciência da Computação). São dois motores, com papéis separados:

| Motor | Onde roda | O que faz |
|---|---|---|
| **Motor de visão** | No navegador, no aparelho da pessoa | BlazePose (MediaPipe), ângulos, máquina de estados das fases, regras de erro, contagem, fadiga, assimetria, falas padronizadas. Funciona sem conexão. |
| **Agente de linguagem** | No servidor (API da Anthropic) | Comenta as séries, responde a comandos de voz livres, sugere ajustes conservadores na ficha e escreve o relatório. Recebe só métricas, nunca imagens, e não altera as regras dos exercícios. |

O vídeo é processado no aparelho e **nunca é gravado nem enviado**.

## Como rodar

Requer Node.js 20 ou mais recente.

```bash
npm install
```

```bash
npm start
```

Abra `http://localhost:8080`. O `npm install` copia o MediaPipe para `web/vendor/` e baixa os
modelos de pose; se o download falhar, o aplicativo usa os endereços públicos na primeira vez.

Para ligar o agente de linguagem, defina a chave antes de iniciar (sem ela, o treino funciona
igual, com as frases padronizadas):

```bash
ANTHROPIC_API_KEY=sua-chave npm start
```

Variáveis opcionais: `PORT` (padrão 8080), `AGENTE_MODELO` (padrão `claude-opus-5-5`),
`AGENTE_LIMITE_MIN` (chamadas por minuto por IP, padrão 30) e `AGENTE_SIMULADO=1` (respostas
fixas, para testes sem chave).

**Câmera no celular:** os navegadores só liberam a câmera em `https://` ou em `localhost`.
Para testar no celular, publique o servidor atrás de HTTPS (ou use um túnel HTTPS).

**Sem câmera:** em *Perfil → Fonte do movimento → Demonstração*, uma pessoa simulada executa o
treino. Também funciona acrescentando `?demo=1` ao endereço da tela de treino.

## Jornada de uso

1. **Perfil e triagem** (uma vez): consentimento, objetivo, nível, lesões, equipamento, PAR-Q e aviso de escopo.
2. **Ficha**: uma ficha inicial simples é criada conforme o perfil; o montador permite editar tudo.
3. **Preparação**: o aplicativo orienta o enquadramento (corpo inteiro, distância, iluminação).
4. **Calibração**: pose neutra por 3 segundos; fixa a pessoa-alvo e mede a extensão natural das articulações.
5. **Treino guiado**: início automático pela pose inicial, contagem, correção e fim automático da série.
6. **Descanso**: temporizador, prévia do próximo exercício e, se for o caso, sugestão de ajuste.
7. **Relatório**: válidas e inválidas, erros frequentes, simetria, queda de desempenho, constância e progressão.

Comandos de voz: "próximo", "pausar", "continuar", "repetir", "terminar treino", "carga 10",
"dor" e "parar". Todos têm botão equivalente na tela; o botão **DOR** está sempre visível.

## Requisitos atendidos

| Código | Requisito | Onde |
|---|---|---|
| RF01 | Perfil e triagem de saúde (PAR-Q) | `web/js/telas/cadastro.js` |
| RF02 | Ficha: séries, repetições, carga, cadência, descanso, método, lados, aquecimento, divisão | `web/js/telas/fichas.js`, `web/js/motor/plano.js` |
| RF03 | Biblioteca filtrada pelo equipamento; lesão informada sinalizada | `plano.js` (`filtrarBiblioteca`) |
| RF04 | Posicionamento guiado da câmera e calibração | `web/js/motor/calibracao.js` |
| RF05 | Estimativa de pose e contagem | `web/js/visao.js`, `web/js/motor/repeticoes.js` |
| RF06 | Repetição válida ou inválida, com o motivo (medido × configurado) | `repeticoes.js`, `condicao.js` |
| RF07 | Voz e esqueleto verde/vermelho em tempo real | `coach.js`, `web/js/voz.js`, `web/js/esqueleto.js` |
| RF08 | Sessão sem as mãos: voz, início e fim automáticos | `sessao.js`, `comandos.js` |
| RF09 | Fadiga (perda de velocidade) e assimetria entre lados | `serie.js` |
| RF10 | Relatório pós-treino, histórico, constância e progressão de carga | `relatorio.js`, telas `relatorio` e `historico` |
| RF11 | Agente de linguagem que não altera as regras | `server/agente.mjs`, `fidelidade.js` |
| RF12 | Portal da academia | Fase posterior (fora do MVP). A biblioteca já é declarativa: `web/exercicios/*.json` |
| RNF01 | Navegador de celular e computador, sem instalação | PWA (`manifest.webmanifest`) |
| RNF02 | Vídeo processado no aparelho | `visao.js`; o servidor recusa corpos maiores que 64 KB |
| RNF03 | Latência | Correções saem do motor local; redução automática de quadros em aparelho lento. Meta numérica a definir nos testes |
| RNF04 | Contagem, avaliação e falas padronizadas sem conexão | `web/sw.js` |
| RNF05 | LGPD | Consentimento específico, dados só no aparelho, exportar e apagar em Perfil |
| RNF06 | Legível a dois metros | Tela de treino (`estilo.css`, classe `.treino`) |

## Como o motor decide

- **Definição declarativa** (`web/exercicios/*.json`): articulações (pontos do BlazePose), fases
  com faixa de ângulo, ciclo, regras de erro (condição, severidade, fala), pose inicial e dicas.
  Incluir um exercício não exige mexer no código do motor.
- **Máquina de estados das fases**: a repetição só é completa se percorrer o ciclo inteiro, com
  histerese e tempo mínimo. Quem volta antes do ápice, ou não termina a volta, gera uma repetição
  inválida com o motivo.
- **Condições das regras**: expressões como `min_angulo_cotovelo > 55` ou
  `deslocamento_cotovelo_x > limite`, avaliadas por um interpretador próprio (sem `eval`).
  Prefixos disponíveis: `min_`, `max_`, `variacao_`, `media_`, `volta_min_`, `volta_max_`.
- **Confiança**: com ponto-chave pouco visível, o motor suspende a avaliação e pede ajuste da
  câmera, em vez de julgar.
- **Coach**: segurança antes de técnica, técnica antes de cadência; uma correção por repetição;
  intervalo mínimo entre falas; o mesmo aviso não se repete mais de duas vezes seguidas; três
  inválidas seguidas levam à sugestão de reduzir a carga ou pausar.
- **Fidelidade do agente**: cada resposta declara em que fatos se apoia. Se citar algo que o
  motor não detectou, é descartada (no servidor e de novo no aparelho) e contada no relatório.
  Ajustes de ficha propostos pelo agente só reduzem esforço, dentro de limites, e dependem do
  "sim" da pessoa.

Os valores de ângulo e os limiares nas definições são **ilustrativos**: devem ser definidos com
base na literatura e revisados por profissional de educação física (etapas 5, 8 e 9 do
procedimento de mapeamento).

## Testes e ambiente de testes

```bash
npm test
```

```bash
npm run bancada
```

`npm test` roda 41 testes: geometria, condições, as cinco definições, classificação de cada erro
previsto, fadiga, assimetria, cadência, coach, comandos, pessoa-alvo, ficha, a sessão completa
com uma pessoa simulada, o saneamento e a fidelidade do agente e o servidor HTTP.

`npm run bancada` roda o motor sobre as gravações de `dados/videos_rotulados/`, mede as métricas
do Quadro 4 (erro de contagem, concordância, precisão, revocação e F1 por tipo de erro, falsos
alertas) e compara com `dados/baseline.json`; se uma alteração piorar o resultado, o comando
falha. Detalhes e formato dos arquivos em [`docs/ambiente-de-testes.md`](docs/ambiente-de-testes.md).

## O que este MVP ainda não comprova

- **Acerto com pessoas reais.** Os testes usam movimentos sintéticos (um boneco articulado).
  Eles garantem que o motor aplica as regras como escritas, mas não medem o desempenho do
  BlazePose com pessoas, roupas, luz e câmeras reais. Isso é o objeto da validação com vídeos
  rotulados por profissionais (seção 3.11 do projeto), após aprovação do Comitê de Ética.
- **Agente com o modelo real.** A integração foi testada com respostas simuladas; a chamada à
  API precisa de uma chave e não foi exercitada neste ambiente.
- **Reconhecimento de fala.** Depende do navegador; em alguns, o áudio é enviado ao serviço de
  fala do próprio navegador. Por isso é opcional e vem desligado.
- **Flexão de braço** pede o celular na horizontal ou mais distante, para o corpo caber deitado.

Ficam para depois, como no projeto: conta de usuário e sincronização, portal da academia,
integração com relógio inteligente, mais exercícios e o modo para o educador físico.

## Estrutura

```
web/                 aplicativo (PWA), servido como arquivos estáticos
  exercicios/        definições declarativas dos cinco exercícios
  js/motor/          motor de análise, sem DOM: roda no navegador e no Node
  js/telas/          cadastro, início, fichas, treino, relatório, evolução, perfil, testes
server/              servidor HTTP e agente de linguagem
ferramentas/         bancada de regressão e gerador de gravações sintéticas
tests/               testes automatizados (node:test)
dados/               linha de base da bancada e gravações rotuladas
docs/                formato das gravações e procedimento para novos exercícios
```

## Aviso

O aplicativo avalia a técnica de execução. Não substitui profissional de saúde ou de educação
física, não verifica se a carga é adequada e não prescreve treino para condições clínicas.
