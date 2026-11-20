# Testes do TourUFC

Os quatro scripts dirigem o Chromium pelo Chrome DevTools Protocol: navegam,
esperam em tempo real, disparam cliques e leem o DOM (e, no caso do mapa, o
estado da câmera). Servem de evidência para a Seção 8 do plano e de regressão
para os bugs já corrigidos (Seção 9.1).

**Pré-requisitos:** `chromium-browser`, Python 3 com o pacote `websockets`.

## Rodar

```bash
# 1. servidor estático na raiz do projeto (outro terminal)
python3 -m http.server 8000

# 2. suíte de interações (40 verificações: lista, pins, busca, filtros,
#    ficha, novidades, zoom, bússola, troca de área e fechamento)
python3 testes/suite_interacoes.py                     # porta 8000

# 3. física de navegação do mapa (52 verificações: arraste livre, limites
#    de 25%, inclinação da vista, mola elástica, cancelamento, rotação,
#    inclinação limitada, orbita com Ctrl, gestos de dois dedos e UI)
python3 testes/suite_mapa.py                           # porta 8000

# 4. caminho de erro: sem WebGL só a mensagem aparece, e o Three.js
#    nem chega a ser baixado
python3 testes/sem_webgl.py http://localhost:8000/ sem_webgl.png 6

# 5. utilitário: screenshot + estado da página de qualquer URL
python3 testes/cdp.py http://localhost:8000/ captura.png 12
```

Os scripts esperam o app terminar de subir (polling de pins posicionados) —
com renderização por software o WebGL pode levar alguns segundos.

## O que cada um cobre

| Arquivo | Função |
| --- | --- |
| `suite_interacoes.py` | 40 verificações da experiência-alvo: seleção sincronizada lista ⇄ pin ⇄ ficha, busca sem caixa/acento, chips, "Nenhum resultado encontrado", sino de novidades, limites de zoom, recentralização, troca de área (área sem textura mantém a atual e avisa) e fechamento da ficha. |
| `suite_mapa.py` | 59 verificações da navegação: arraste livre desde o primeiro gesto (exato em X e no Z, que é projetado pelo cosseno da inclinação da vista), zoom ancorado no cursor, clique que não arrasta, limites de arraste exatos mantendo 25% do conteúdo visível (inclusive com a vista girada 45°), mola de retorno (chega ao centro exato sem oscilar, desacelera, dura o previsto contando da soltura — a física é em tempo de relógio, não por quadro — e pins voltam) e cancelamento por reagarrar ou centralizar. Cobre também os controles estilo Google Maps: rotação em torno do foco sem tirar o ponto do centro do quadro, arraste que troca de eixo ao girar 90°, inclinação limitada a 0..45°, reset da bússola (norte + 25° + enquadramento), Ctrl+arrastar e botão direito (orbita), twist e arraste paralelo de dois dedos (com gate de pinça), pinça, ponteiro da bússola, painel deslizante de ângulo/rotação, **inclinar sem mexer no zoom** (sem zoom "sozinho"), **conteúdo inteiro no quadro a 45°** (projeção NDC das malhas) e piso de zoom mais afastado que o enquadramento cheio. Dispara gestos reais via `Input.dispatchMouseEvent` / `Input.dispatchTouchEvent` e lê o estado pelo gancho `window.__tour`. |
| `sem_webgl.py` | Desliga WebGL e confere a mensagem "Seu navegador não é compatível com o Tour UFC", ausência de pins e lista, e que nenhum recurso de mapa é requisitado. |
| `cdp.py` | Ferramenta: screenshot via CDP (quadro composto, diferente do modo headless simples) e leitura de estado. Aceita uma expressão JS opcional como quarto argumento, executada antes da captura. |

## Regressões já registradas aqui

- **Pin sem posição:** `paraTela()` lia uma propriedade inexistente do
  renderer, devolvia `NaN` e o navegador descartava o `transform` inválido —
  os pins ficavam fora da tela. Verificação: "pin do NUCLIC posicionado no
  carregamento".
- **Mapa que não aparecia no print:** a renderização em demanda descartava o
  quadro antes da composição (`preserveDrawingBuffer`). Verificação:
  "canvas cobre a área do mapa" + leitura do pixel central.
- **Selecionado fora do centro:** abrir a ficha estreita a área do mapa e o
  pin parava fora do centro. Verificação: "pin centralizado no mapa (com
  ficha aberta)".
