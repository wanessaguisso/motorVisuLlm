# Ambiente de testes e novos exercícios

## Formato de uma gravação de pontos-chave

O motor recebe apenas sequências de pontos-chave, então o mesmo código roda ao vivo e sobre
gravações. Cada gravação é um arquivo JSON:

```json
{
  "exercicio": "rosca_direta_halteres",
  "fps": 30,
  "aspecto": 0.5625,
  "lado": "ambos",
  "quadros": [
    { "t": 0.0, "pontos": [ { "x": 0.51, "y": 0.22, "z": 0, "visibility": 0.98 } ] }
  ],
  "rotulos": {
    "repeticoes_reais": 3,
    "reps": [
      { "valida": true, "erro": null },
      { "valida": false, "erro": "amplitude_curta" },
      { "valida": true, "erro": null }
    ]
  }
}
```

- `t`: tempo em segundos. `pontos`: os 33 pontos do BlazePose, com `x` e `y` normalizados
  (0 a 1) e `visibility`. `aspecto`: largura dividida pela altura do vídeo.
- `mundo` (opcional, por quadro): coordenadas 3D do MediaPipe, para testar o modo 3D.
- `rotulos` (opcional): avaliação do profissional. `erro` usa o `id` da regra na definição
  do exercício. Sem rótulos, a bancada só mostra o que o motor contou.

## Como obter uma gravação a partir de um vídeo

No aplicativo: *Perfil → Ambiente de testes → Extrair pontos-chave de um vídeo*. O vídeo é
processado no aparelho e o resultado é um JSON só com coordenadas do esqueleto, sem imagem.
Acrescente o campo `rotulos` e salve o arquivo em `dados/videos_rotulados/`.

Os vídeos originais de voluntários não entram no repositório (o `.gitignore` os exclui) e devem
seguir o que o Termo de Consentimento estabelecer.

## Bancada de regressão

```bash
npm run bancada
```

Mede, por exercício: erro de contagem máximo por série (meta inicial: até 1), concordância
válida/inválida (meta inicial: 80%), precisão, revocação e F1 por tipo de erro e falsos alertas
por série. Em seguida compara com `dados/baseline.json`. Se a concordância cair, o erro de
contagem subir ou o F1 de algum erro piorar, o comando termina com falha: a alteração não deve
ser incorporada.

Depois de uma mudança intencional e conferida, atualize a linha de base:

```bash
npm run bancada:baseline
```

As gravações `sintetico-*.json` são geradas por `npm run bancada:gerar` (um boneco articulado,
determinístico). Elas detectam regressões no motor; não substituem as gravações reais.

## Incluir um exercício (procedimento de nove etapas)

1. Definir o exercício.
2. Definir as segmentações do corpo de interesse.
3. Definir os pontos-chave, nomeando as partes do corpo.
4. Localizar os pontos na arquitetura do BlazePose (11/12 ombros, 13/14 cotovelos, 15/16
   punhos, 23/24 quadris, 25/26 joelhos, 27/28 tornozelos; ímpar = lado esquerdo).
5. Definir as angulações mínima e máxima corretas, com base em bibliografia consolidada.
6. Codificar em `web/exercicios/<id>.json` e acrescentar o `id` em `web/exercicios/indice.json`.
7. Incorporar o feedback: `fala` de cada regra, `severidade` (`seguranca` ou `tecnica`),
   `pontos` a pintar de vermelho e `dicas_inicio`.
8. Gravar execuções corretas e incorretas e rotulá-las com um profissional de educação física.
9. Medir na bancada e ajustar as regras antes de liberar.

Campos da definição:

| Campo | Significado |
|---|---|
| `vista_camera` | `frontal` ou `lateral` |
| `articulacoes_chave` | nome → três pontos (A, B, C); o ângulo é medido em B. Sufixos `_dir` e `_esq` indicam o lado |
| `angulo_principal` | articulação que define as fases |
| `medidas` | `inclinacao` (de → para, em relação à vertical) ou `deslocamento` (ponto em relação a uma referência, em comprimentos de tronco) |
| `fases` / `ciclo` | faixas de ângulo e a sequência que a repetição deve percorrer |
| `fase_concentrica` | `ida` ou `volta` (define o que é subida e descida para a cadência e a fadiga) |
| `regras_erro` | `id`, `condicao`, `severidade`, `fala`, `pontos` |
| `limites` | constantes usadas nas condições |
| `condicao_pose_inicial` | condição extra, além de estar na primeira fase, para começar a série |

A definição é validada ao carregar (`validarDefinicao`): variável desconhecida em uma condição,
fase inexistente no ciclo ou faixa inválida impedem o uso do exercício. `npm test` também exige
que todo erro previsto nas regras tenha um movimento sintético que o exercite.
