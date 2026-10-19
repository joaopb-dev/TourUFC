# Testes do TourUFC

Os três scripts dirigem o Chromium pelo Chrome DevTools Protocol: navegam,
esperam em tempo real, disparam cliques e leem o DOM. Servem de evidência para
a Seção 8 do plano e de regressão para os bugs já corrigidos (Seção 9.1).

**Pré-requisitos:** `chromium-browser`, Python 3 com o pacote `websockets`.

## Rodar

```bash
# 1. servidor estático na raiz do projeto (outro terminal)
python3 -m http.server 8000

# 2. suíte de interações (40 verificações: lista, pins, busca, filtros,
#    ficha, novidades, zoom, bússola, troca de área e fechamento)
python3 testes/suite_interacoes.py                     # porta 8000

# 3. caminho de erro: sem WebGL só a mensagem aparece, e o Three.js
#    nem chega a ser baixado
python3 testes/sem_webgl.py http://localhost:8000/ sem_webgl.png 6

# 4. utilitário: screenshot + estado da página de qualquer URL
python3 testes/cdp.py http://localhost:8000/ captura.png 12
```

Os scripts esperam o app terminar de subir (polling de pins posicionados) —
com renderização por software o WebGL pode levar alguns segundos.

## O que cada um cobre

| Arquivo | Função |
| --- | --- |
| `suite_interacoes.py` | 40 verificações da experiência-alvo: seleção sincronizada lista ⇄ pin ⇄ ficha, busca sem caixa/acento, chips, "Nenhum resultado encontrado", sino de novidades, limites de zoom, recentralização, troca de área (área sem textura mantém a atual e avisa) e fechamento da ficha. |
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
