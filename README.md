# TourUFC — mapa interativo do campus de Sobral

Guia digital do campus da **Universidade Federal do Ceará (UFC) em Sobral** na
forma de mapa navegável, para que calouros, estudantes, servidores e visitantes
encontrem departamentos, laboratórios, serviços, bolsas e áreas de lazer sem se
deslocar e sem caçar informação espalhada.

> *Explore. Descubra. Conecte-se.*

---

## O que é

Aplicação **web 100% front-end**, sem backend nem banco de dados. O servidor só
entrega arquivos estáticos; tudo o mais (renderização, navegação, busca,
filtros, ficha) roda no navegador.

O mapa não é uma imagem estática: é o **modelo 3D do campus (`UFC.obj`) renderizado
ao vivo** numa câmera ortográfica vista de cima, com iluminação e sombra
direcional — o relevo dos prédios e das árvores salta do terreno como num mapa
de satélite. A interface inteira (barra lateral, pins, ficha) é HTML/CSS por
cima do canvas.

### Três zonas

| Zona | Conteúdo |
| --- | --- |
| **Esquerda — barra lateral** | Logo, busca em tempo real, chips de categoria e lista rolável de locais |
| **Centro — mapa** | Modelo do campus em 3D visto de cima, pins com badge de novidade, sino, zoom `+`/`−`, bússola e seletor de área |
| **Direita — ficha** | Foto, endereço, contatos, links externos, bolsas e novidades do órgão selecionado |

Clicar num pin, num item da lista ou num resultado de busca mantém os três em
sincronia: **lista ⇄ pin ⇄ ficha**.

---

## Como rodar

O `fetch` do JSON não funciona em `file://`, então é preciso um servidor
estático qualquer na raiz do projeto:

```bash
./servidor.sh            # sobe em http://localhost:8000/
./servidor.sh 8080       # ou noutra porta
```

Depois abra `http://localhost:8000/`. O script roda em primeiro plano de
propósito: fechar o terminal (ou `Ctrl+C`) encerra o processo junto, sem deixar
servidor órfão.

Requer um navegador com **WebGL**. Sem suporte, o app exibe "Seu navegador não é
compatível com o Tour UFC" e não carrega nada além disso.

---

## Estrutura

```text
tourufc/
├── index.html        as três zonas (barra, mapa, ficha) + gaveta e aviso de WebGL
├── servidor.sh       sobe o servidor estático para desenvolvimento
├── UFC.obj           modelo 3D do campus (renderizado ao vivo no navegador)
├── css/
│   └── style.css     paleta e layout
├── js/
│   ├── main.js       inicialização, estado, seleção e hooks de pós-evento
│   ├── map.js        cena 3D, câmera ortográfica, iluminação, sombras e limites
│   ├── obj.js        parser do arquivo .obj (geometria indexada, normais)
│   ├── camera.js     arraste, zoom por roda/pinça e a mola de retorno ao centro
│   ├── hotspots.js   projeção dos pins e sincronismo com a lista
│   ├── ui.js         barra lateral, ficha, sino, gaveta e avisos
│   ├── search.js     busca e filtros normalizados (sem caixa, sem acento)
│   ├── data.js       carga e validação do JSON
│   ├── registry.js   registrarControle() / registrarSecaoFicha() — ponto de extensão
│   └── modulos/      botões do mapa e seções da ficha registrados
├── data/
│   └── locais.json   fonte única de conteúdo: locais, áreas e categorias
├── assets/           logo, texturas de mapa, miniaturas e fotos
├── vendor/           three.js r166 (local, sem CDN)
└── testes/           scripts CDP: suíte de interações, caminho sem WebGL, captura
```

### Conteúdo é dado, não código

Todo texto institucional vive em `data/locais.json` — nome, endereço, contatos,
fotos, eventos, bolsas, links e coordenadas. Atualizar um órgão é editar dados,
não programar. O mesmo arquivo carrega as `categorias` (chips) e as `areas` do
seletor.

Hoje são **8 locais** e **2 áreas** (Engenharias, com o modelo 3D; e FAMED, ainda
sem conteúdo exportado).

---

## Mapa 3D

- `js/obj.js` lê o `UFC.obj` direto no navegador (132 mil vértices, 46 objetos)
  numa geometria indexada, com duas passadas no arquivo — o modelo traz as
  referências de face antes das posições de vértice.
- Os objetos são classificados pelo prefixo do nome no Blender e recebem cor por
  categoria: chão, construção e vegetação.
- A câmera é ortográfica olhando de cima (`js/map.js`), então a leitura é a de
  um mapa 2D — mas com sombra projetada, que dá o relevo.
- **Navegação:** arraste com mouse ou dedo, zoom por rola/pinça e pelos botões.
  O arraste é livre desde o primeiro gesto, sempre mantendo ao menos 25% do
  conteúdo no quadro. Ao soltar encostado no limite, o mapa volta ao centro
  com um puxão elástico (mola amortecida, sem oscilar).

---

## Conteúdo de referência

Área das Engenharias: Bloco das Engenharias (agrupador), Coordenação da
Engenharia de Computação, Coordenação da Engenharia Elétrica, Laboratório de
Simulações Numéricas, Recepção do bloco, PET da Engenharia de Computação e
NUCLIC. Endereço de referência: R. Cel. Estanislau Frota, 563 — Centro, Sobral
- CE, 62010-560.

---

## Testes

Os scripts em `testes/` rodam à mão, sem infraestrutura, e cobrem regressão de
comportamento:

- `suite_interacoes.py` — suíte de interações via Chrome DevTools Protocol
  (lista ⇄ pin ⇄ ficha, busca, chips, sino, zoom, bússola, troca de área)
- `sem_webgl.py` — caminho de falha: sem WebGL a mensagem aparece e o Three.js
  nem é baixado
- `cdp.py` — utilitário comum de captura via CDP

Eles exigem um `chromium-browser` disponível no `PATH` e o servidor de pé. Não
substituem a verificação manual dos requisitos.

---

## Regras do projeto

1. **Mapa em Three.js**, câmera ortográfica; interface em HTML/CSS por cima.
2. **Pins são HTML sobre o canvas**, posicionados por projeção e reposicionados
   a cada pan/zoom. Sem raycasting.
3. **Todo conteúdo vive no JSON.** Nenhum texto institucional no código.
4. **Pan e zoom sempre limitados** à área exibida.
5. **Sem backend.** Links externos abrem em nova aba.
6. **Responsivo, mouse e toque.**
7. **Falha vira mensagem**, nunca tela quebrada.

---

## Equipe

João Pedro Batista Barbosa, Davi da Silva Ximenes e Luiz Gutemberg dos Santos
Sousa.
