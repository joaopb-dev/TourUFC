# TourUFC — Plano do Projeto

> Documento-mestre do projeto. Qualquer pessoa (humana ou IA) deve conseguir
> ler este arquivo e retomar de onde o trabalho parou.
>
> **Base:** `Documento_de_requisitos_TourUFC_v1.1` (09/09/2026), slides e o
> design no Figma (Seção 3).
> **Equipe:** João Pedro Batista Barbosa, Davi da Silva Ximenes e
> Luiz Gutemberg dos Santos Sousa.
>
> **Regra:** este é o único registro de andamento. Atualize-o ao fim de cada
> sessão, a cada marco fechado e a cada mudança de decisão — nunca deixe para
> depois.

## Protocolo de retomada

1. Leia `11. Estado atual` e `12. Diário de progresso`.
2. Execute a `Próxima ação imediata` indicada em `Estado atual`.
3. Ao terminar: marque `[X]`, atualize `Estado atual` e acrescente no diário.
   Só então inicie a próxima tarefa.

**Convenções:** `[ ]` pendente · `[~]` em andamento · `[X]` concluído e
validado. Tarefa só vira `[X]` com evidência (comando + saída, ou teste
citado).

---

## 1. Objetivo

Entregar um **guia digital do campus da UFC em Sobral** na forma de mapa
interativo, para que calouros, estudantes, servidores e visitantes encontrem
departamentos, laboratórios, serviços e áreas de lazer sem se deslocar e sem
caçar informação espalhada em canais institucionais.

Lema do produto: *Explore. Descubra. Conecte-se.*

---

## 2. Produto

Aplicação **web interativa, 100% front-end**, em três zonas: barra lateral de
busca e listagem, mapa 2D navegável com pins, e ficha do órgão aberta à
direita.

### 2.1 Regras de implementação

Valem para o projeto inteiro. Cada uma aparece uma vez aqui, não nas seções
de interface, arquitetura ou requisitos.

1. **Mapa 2D em Three.js.** Uma única textura da área num plano, dentro de
   uma `Scene` com `OrthographicCamera` e `Renderer`. Nada de cena 3D com
   câmera em perspectiva, luzes ou objetos modelados. Efeitos 2.5D (camadas,
   parallax) são possibilidade futura, ainda não decidida.
2. **Hotspots são HTML/CSS sobre o canvas.** Cada pin é posicionado a partir
   de coordenadas do mundo convertidas para tela (`Vector3.project()` ou
   cálculo equivalente) e reposicionado a cada pan ou zoom. O clique usa
   eventos nativos do DOM. Raycasting do Three.js é proibido aqui.
3. **Todo conteúdo vive em JSON.** Nome, endereço, contatos, fotos, eventos,
   bolsas, links e coordenadas ficam na base de conteúdo (Seção 6.4). Nenhum
   texto institucional é escrito no código — atualizar um órgão é editar
   dados, não programar.
4. **Pan e zoom sempre limitados.** O pan não deixa o usuário sair da área
   ilustrada; o zoom respeita um mínimo (área completa visível) e um máximo
   (definido na implementação). O excedente do gesto é descartado.
5. **Sem backend.** A hospedagem serve apenas arquivos estáticos. Não há
   integração com PRAE, SIGAA ou qualquer sistema institucional. Os links
   externos são `HTTP/HTTPS` que abrem em **nova aba**.
6. **Responsivo, mouse e toque.** Desktop: arrastar, scroll e cliques. Mobile:
   arrastar e pinça (*pinch-to-zoom*). Zoom inicial, área de renderização e
   controles se adaptam ao dispositivo.
7. **Falha vira mensagem, nunca tela quebrada.** Sem WebGL: exibir "Seu
   navegador não é compatível com o Tour UFC" e não carregar mapa nem pins.
   Textura com falha: mensagem de erro genérica com opção de recarregar.

### 2.2 Experiência-alvo

1. O usuário acessa a URL e o sistema verifica o suporte a WebGL.
2. O mapa carrega centralizado, com zoom inicial que enquadra a ilustração.
3. Na barra esquerda, a lista mostra os locais da área; o usuário filtra por
   "Bolsas" e digita "restaur" na busca.
4. Escolher um resultado — ou clicar no pin — centraliza o mapa, marca o item
   da lista e abre a ficha do órgão à direita, com foto, endereço, contatos,
   links e novidades.
5. O botão de área troca a textura do mapa para outra região do campus; o
   "+", o "−" e a bússola ajustam e recentralizam a vista.

### 2.3 Escopo

Fase inicial restrita a **uma área por vez, do campus de Sobral**, com a
estrutura de dados já preparada para mais de uma área (Seção 2.1, regra 3)
e para crescer em número de órgãos sem mexer no código.

---

## 3. Interface — leitura do Figma

**Design:** https://www.figma.com/site/2A6sisyjal1IGiZqXEEo2R/TourUFC

> **Alcance desta leitura:** o arquivo foi lido pela API com um token guardado
> fora do projeto (`~/.config/tourufc/figma.token`, nunca exibido). Só
> respondem os endpoints de imagens; a renderização da tela principal veio em
> 4096×2488 e está salva em `docs/figma/`. **O arquivo não contém telas
> mobile nem estados vazios** — varrido por `ids`, ele traz uma única tela
> (duas cópias idênticas e uma em 1920×1080). Layout pequeno, estados de
> busca sem resultado e ficha sem foto são, portanto, decisão nossa: itens 1 e
> 2 da Seção 10.

### 3.1 Layout — três zonas

| Zona | Conteúdo |
| --- | --- |
| **Esquerda — barra lateral** | Logo `tourUFC`; campo "Pesquisar local..."; chips de categoria: **Todos** (ativo), **Serviços**, **Bolsas** e um botão `›` para ver mais; lista rolável de locais. |
| **Centro — mapa** | Ilustração 2D; pin com badge de novidade; sino de notificações com contador; seletor de área (miniatura com etiqueta, ex.: **FAMED**); zoom `+` / `−`; bússola de recentralização. |
| **Direita — ficha do órgão** | Foto principal com faixa verde de destaque; **Endereço**; **Contatos**; faixa **Novidades** com período de datas. |

### 3.2 Barra lateral

- **Busca** "Pesquisar local..." — filtro em tempo real sobre a lista e os pins.
- **Chips de categoria** — `Todos` / `Serviços` / `Bolsas` + `›` para revelar
  as demais. Filtram ao mesmo tempo a lista e os pins do mapa.
- **Lista de locais** — cada item traz **nome**, **endereço resumido** ("Rua
  Estanislau Frota...") e um chevron `›`. O item selecionado aparece em verde.
  Na tela lida: Bloco das Engenharias (selecionado), Coord. da Engenharia de
  Computação, Coord. da Engenharia Elétrica, Laboratório de Simulações
  Numéricas, Recepção do bloco das Engenharias, PET da Engenharia de
  Computação e NUCLIC.
- **Sincronismo:** item da lista ⇄ pin do mapa ⇄ ficha aberta. Clicar em um
  deve refletir nos outros dois.

### 3.3 Mapa e controles

- **Pin** verde com badge numérico vermelho — o número sinaliza novidades
  pendentes naquele ponto.
- **Sino** (canto superior) com contador — atalho para as novidades.
- **Seletor de área** — miniatura com etiqueta ("FAMED") no canto inferior
  esquerdo; troca a ilustração carregada. É o que o usuário chama de escolha
  de campus/área.
- **Zoom** `+` e `−` em pílula vertical, e **bússola** abaixo — recentraliza a
  vista.

### 3.4 Ficha do órgão (abre ao clicar no pin ou na lista)

1. **Foto** principal, com faixa verde de destaque — no design, "Em Breve:
   Encontros Universitários 2026".
2. **Endereço** — rua, número, bairro, cidade, CEP.
3. **Contatos** — agrupados por órgão, cada um com **e-mail**, **site** e
   **telefone**. No design, a ficha do Bloco das Engenharias lista
   simultaneamente as duas Coordenações: blocos funcionam como **agrupadores**
   de unidades.
4. **Novidades** — faixa verde com título e período (ex.: "Encontros
   Universitários 2026 · 04/11/2026 a 05/11/2026").
5. Também previstos no pedido do projeto: **links externos**, **bolsas** e
   **oportunidades** — a existência do chip `Bolsas` na barra lateral confirma
   que essa categoria é de primeira classe, não um texto solto na ficha.

---

## 4. Atores

1. **Visitante / Calouro** — acessa sem cadastro nem vínculo prévio; explora
   o mapa, localiza prédios e se orienta no primeiro contato.
2. **Estudante da UFC** — usa no dia a dia: auxílios e bolsas, laboratórios,
   grupos como NUCLIC e PET, RU; segue os links externos (ex.: PRAE).
3. **Administrador de conteúdo** — equipe do projeto, servidor ou setor
   designado. Insere, edita e remove órgãos no JSON e mantém fotos, contatos
   e novidades corretos.
4. **Navegador web (sistema)** — interpreta HTML5, CSS3, JavaScript e WebGL e
   repassa os eventos de clique, toque e arraste.

---

## 5. Requisitos funcionais

Padrão "Como `<ATOR>`, quero `<AÇÃO>` para `<OBJETIVO>`". Prioridade:
**Essencial**, **Importante** ou **Desejável**.

| ID | Requisito | Prioridade |
| --- | --- | --- |
| `PRJ-WEB-001` | Visualizar o mapa da área | Essencial |
| `PRJ-WEB-002` | Navegar com pan e zoom | Essencial |
| `PRJ-WEB-003` | Abrir o mapa a partir de um pin | Essencial |
| `PRJ-WEB-004` | Buscar órgão ou serviço | Importante |
| `PRJ-WEB-005` | Filtrar por categoria | Importante |
| `PRJ-WEB-006` | Navegar pela lista lateral sincronizada | Importante |
| `PRJ-WEB-007` | Ler a ficha completa do órgão | Essencial |
| `PRJ-WEB-008` | Trocar de área/campus | Importante |
| `PRJ-WEB-009` | Acompanhar novidades e eventos | Desejável |

**`PRJ-WEB-001` — Visualizar o mapa da área.**
Como Visitante/Calouro, quero ver o mapa da área para me orientar entre os
pontos de interesse.
*Principal:* verificar WebGL → carregar textura → montar `Scene`, câmera e
`Renderer` → exibir mapa com zoom inicial → criar um pin por local.
*Exceções:* navegador sem WebGL; falha ao carregar a textura.

**`PRJ-WEB-002` — Navegar com pan e zoom.**
Como Visitante/Calouro, quero navegar pelo mapa para explorar livremente.
*Principal:* arrastar com mouse ou dedo; zoom por scroll, pinça ou pelos
botões `+`/`−`; bússola recentraliza a vista.
*Exceções:* limite de deslocamento atingido; limite de zoom atingido.

**`PRJ-WEB-003` — Abrir o mapa a partir de um pin.**
Como Visitante/Calouro, quero clicar num pin para ver onde o órgão fica e
abrir a sua ficha. O item correspondente da lista lateral fica selecionado.
*Principal:* clique no pin → destacar na lista → abrir ficha → centralizar se
o pin estiver fora de vista.
*Exceções:* pin sem ficha completa exibe só o que existe (regra 7 da Seção
2.1).

**`PRJ-WEB-004` — Buscar órgão ou serviço.**
Como Estudante da UFC, quero buscar um órgão ou serviço para localizá-lo
rápido. Busca em tempo real no campo da barra lateral, sem distinção de caixa
nem de acentos, cobrindo nome, endereço e palavras-chave do JSON. Escolher um
resultado centraliza, aplica zoom de destaque e abre a ficha.
*Exceção:* sem resultado, exibir "Nenhum resultado encontrado".

**`PRJ-WEB-005` — Filtrar por categoria.**
Como Estudante da UFC, quero filtrar por categorias (Todos, Serviços, Bolsas
e as demais reveladas pelo `›`) para enxergar só o que me interessa. O filtro
atua ao mesmo tempo na lista lateral e nos pins do mapa.
*Exceção:* combinação de filtro e busca sem resultado mostra lista vazia com
mensagem, sem apagar o mapa.

**`PRJ-WEB-006` — Navegar pela lista lateral sincronizada.**
Como Visitante/Calouro, quero percorrer a lista de locais na barra lateral
para achar um órgão sem precisar mirar no mapa. Ao clicar no item: o mapa
centraliza, o item fica destacado e a ficha abre. No sentido inverso, clicar
num pin marca o item na lista e leva o scroll até ele.

**`PRJ-WEB-007` — Ler a ficha completa do órgão.**
Como Estudante da UFC, quero abrir a ficha de um órgão para ver, num só lugar:
foto (com legenda/destaque), endereço, contatos (e-mail, site e telefone por
unidade), links externos em nova aba, novidades/eventos com período, e bolsas
e oportunidades com prazo e link.
*Principal:* clique no pin ou no item da lista → renderizar só as seções com
conteúdo.
*Exceções:* órgão sem foto ocupa o espaço da legenda; seção vazia não é
exibida; bloco agrupa as unidades e os seus contatos (padrão do design).

**`PRJ-WEB-008` — Trocar de área/campus.**
Como Visitante/Calouro, quero trocar a área exibida (botão com a miniatura e
a etiqueta) para navegar em outra região do campus.
*Principal:* trocar textura e conjunto de pontos, mantendo pan e zoom
restringidos à nova área e reaplicando filtro e busca ativos.
*Exceção:* área sem textura carregada mantém a atual e avisa.

**`PRJ-WEB-009` — Acompanhar novidades e eventos.**
Como Estudante da UFC, quero ver um contador de novidades (sino no topo, badge
nos pins) para não perder eventos e prazos. Sem backend, o contador é calculado
no carregamento a partir das datas futuras do JSON.

### 5.1 Conteúdo de referência

**Dos slides:** NUCLIC (robótica, competições, apoio a disciplinas, espaço
colaborativo); PET (aprofundamento acadêmico, projetos, liderança, impacto na
comunidade); Auxílio Estudantil da PRAE (Moradia, BIA, Emergencial, Creche,
Transporte e RU), com botão "Acessar página".

**Do Figma (área das Engenharias):** Bloco das Engenharias (agrupador),
Coordenação da Engenharia de Computação, Coordenação da Engenharia Elétrica,
Laboratório de Simulações Numéricas, Recepção do bloco, PET da Engenharia de
Computação, NUCLIC. Endereço de referência: R. Cel. Estanislau Frota, 563 —
Centro, Sobral - CE, 62010-560. Contatos das Coordenações, como no design:
e-mails `ec@sobral.ufc.br` e `coord.engeletrica@sobral.ufc.br`, telefones
`(88) 3695-4608` e `(88) 3695-4610`. Evento de referência: Encontros
Universitários 2026, de 04/11/2026 a 05/11/2026. Área secundária citada:
FAMED. Os textos vêm do design em resolução alta, não da thumbnail — é o que
corrigiu número de endereço, datas e telefones lidos antes.

---

## 6. Arquitetura

Aplicação 100% front-end: o servidor só entrega arquivos estáticos e todo o
resto (renderização, navegação, busca, filtros, ficha) roda no navegador. O
Three.js desenha **apenas o mapa**; toda a interface é HTML/CSS por cima.

```text
+------------------------------------------------------------------+
|   Hospedagem estática (HTML, CSS, JS, JSON, texturas, fotos)      |
+------------------------------------------------------------------+
                                | download único
                                v
+------------------------------------------------------------------+
| Navegador do usuário (tudo roda aqui)                             |
| +--------------------------------------------------------------+ |
| | Camada DOM (HTML e CSS)                                      | |
| | Barra lateral          Ficha do órgão       Controles        | |
| | busca · chips · lista  foto, contatos,      zoom, bússola,   | |
| |                        novidades, links     sino, seletor    | |
| +--------------------------------------------------------------+ |
|        ^ lista ⇄ pin ⇄ ficha                 ^ abertura          |
| +--------------------------------------------------------------+ |
| | Lógica em JavaScript                                         | |
| | Navegação          Projeção           Dados (JSON)           | |
| | pan, zoom, limites Vector3.project()  órgãos, áreas, fotos   | |
| | Filtros e busca (nome, categoria, texto normalizado)         | |
| +--------------------------------------------------------------+ |
|        v pan/zoom move a câmera                                  |
| +--------------------------------------------------------------+ |
| | Canvas WebGL (Three.js)                                      | |
| | OrthographicCamera  Scene  textura da área  Renderer         | |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### 6.1 Camadas

1. **Canvas WebGL** — o plano com a textura, visto de frente pela câmera
   ortográfica. Pan e zoom são movimentos dessa câmera.
2. **Lógica JavaScript** — a cola: `Navegação` captura mouse, toque, pinça e
   botões, aplica os limites e move a câmera; `Projeção` converte a posição
   de cada órgão em pixel de tela; `Dados` carrega e valida o JSON; `Filtros`
   aplica chips e busca sobre a mesma lista que alimenta lista e pins.
3. **Camada DOM** — barra lateral, ficha, controles e pins em `absolute`
   sobre o canvas, com clique por eventos nativos.
4. **Ponto de extensão** — acrescentar botão de setor ou bloco de informação
   não mexe no núcleo: um módulo chama `registrarControle()` (botões do mapa)
   ou `registrarSecaoFicha()` (blocos da ficha) e entra em `js/modulos/`
   com uma linha em `js/modulos/index.js`. Locais, áreas e categorias entram
   só pelo JSON (Seção 6.4), sem tocar em código.

### 6.2 Fluxo de execução

1. **Ao abrir:** verificar WebGL → só então importar o mapa (e o Three.js junto;
   sem WebGL nada disso é baixado) → baixar textura e `locais.json` → montar
   `Scene`, câmera e `Renderer` → criar um pin por órgão → renderizar lista e
   contador de novidades.
2. **A cada pan ou zoom:** a câmera se move, a projeção recalcula e os pins
   são reposicionados.
3. **Clique no pin ou na lista:** o DOM captura o evento, o item é buscado no
   JSON e a ficha é renderizada; lista, pin e ficha assumem o mesmo estado.
4. **Busca e chips:** o termo é normalizado (sem acento, sem caixa) e filtrado
   sobre o JSON; lista e pins são reexibidos juntos.
5. **Troca de área:** trocar textura e conjunto de pontos, reaplicar filtro e
   busca e reenquadrar a câmera.

### 6.3 Estrutura de pastas (como ficou)

```text
tourufc/
+-- index.html        três zonas (barra, mapa, ficha) + gaveta e erro de WebGL
+-- css/
|   +-- style.css     paleta e layout lidos do design
+-- js/
|   +-- main.js       inicialização, estado, seleção e hooks de pós-evento
|   +-- map.js        Scene, OrthographicCamera, Renderer, textura, limites
|   +-- camera.js     pan, zoom por roda/pinça, limites de deslocamento
|   +-- hotspots.js   projeção (paraTela), criação e atualização dos pins
|   +-- ui.js         barra lateral, ficha, sino, gaveta e avisos
|   +-- search.js     busca e filtros normalizados (sem caixa, sem acento)
|   +-- data.js       carga e validação do JSON
|   +-- registry.js   registrarControle() / registrarSecaoFicha() — extensão
|   +-- modulos/
|       +-- index.js          1 linha por módulo
|       +-- controles-mapa.js zoom, bússola, sino, seletor de área
|       +-- secoes-ficha.js   nome, foto, endereço, contatos, bolsas,
|                            novidades e links
+-- data/
|   +-- locais.json   locais, áreas e categorias (única fonte de conteúdo)
+-- assets/
|   +-- mapa-campus.webp   textura em execução (104 KB)
|   +-- mapa-campus.png    master editável (1,3 MB, sem sobreposições)
|   +-- logo.png  mapas/*.png (miniaturas)  fotos/*.webp
+-- vendor/           three.module.js + three.core.js (r171, sem CDN)
+-- docs/figma/       render da tela do design para conferência
+-- testes/           scripts CDP: suíte de interações, sem WebGL, screenshot
+-- PLANO.md
```

### 6.4 Modelo de conteúdo (JSON)

Estrutura mínima de cada órgão — tudo aqui é dado, nada disso é escrito no
JavaScript:

```json
{
  "id": "bloco-engenharias",
  "nome": "Bloco das Engenharias",
  "tipo": "bloco",
  "area": "engenharias",
  "categorias": ["servicos", "ensino", "bolsas"],
  "coordenada": { "x": 0.618, "y": 0.435 },
  "resumo": "Rua Estanislau Frota...",
  "endereco": "R. Cel. Estanislau Frota, 563 — Centro, Sobral - CE, 62010-560",
  "palavrasChave": "engenharias bloco computação elétrica auxílio bolsa evento",
  "unidades": ["coord-eng-computacao", "coord-eng-eletrica", "nulic"],
  "fotos": [{ "src": "assets/fotos/bloco-engenharias.webp",
              "legenda": "Em Breve: Encontros Universitários 2026" }],
  "contatos": [{ "orgao": "Coordenação da Engenharia de Computação",
                 "email": "ec@sobral.ufc.br", "site": "https://ec.ufc.br",
                 "telefone": "(88) 3695-4608" }],
  "eventos": [{ "titulo": "Encontros Universitários 2026",
                "inicio": "2026-11-04", "fim": "2026-11-05",
                "url": "https://www.ufc.br/sobral" }],
  "bolsas": [{ "nome": "Auxílio Moradia",
               "descricao": "Apoio a estudantes de fora da cidade",
               "url": "https://prae.ufc.br" }],
  "links": [{ "rotulo": "Saiba mais", "url": "https://..." }]
}
```

`coordenada` é relativa à textura da área, não à tela (item 3 da Seção 6.5) e
**é provisória** — recalibrar quando a ilustração final entrar. `tipo`
distingue agrupador (`bloco`) de unidade — é o padrão que o design usa ao
mostrar duas Coordenações na mesma ficha. Ao lado dos locais, o mesmo arquivo
carrega `categorias` (chips) e `areas`, onde `textura: null` significa área
ainda não exportada: clicar avisa e mantém a área atual, sem fingir mapa.
Nenhum texto institucional vive no JavaScript — só aqui.

### 6.5 Pontos de atenção

1. **Reprojeção a cada frame pesa em celulares fracos.** Atualizar os pins
   só durante o movimento e usar `transform` em vez de `top` e `left`.
2. **JSON malformado derruba a exibição.** Validar ao carregar e ignorar
   entradas inválidas em vez de quebrar a página.
3. **Trocar a ilustração por outra com proporção diferente exige recalibrar
   os pontos.**
4. **Fotos pesam.** Comprimir em WebP, carregar sob demanda e reservar o
   espaço para não empilhar layout.

---

## 7. Restrições e dependências

1. **Somente front-end:** HTML5, CSS3 e JavaScript, com Three.js como motor
   gráfico. Backend proibido nesta fase.
2. **WebGL é obrigatório.** Dispositivos sem suporte ficam de fora e recebem
   mensagem explicativa.
3. **A precisão dos hotspots depende da ilustração** — a qualidade e a escala
   da textura da área determinam o posicionamento correto dos pins.
4. **Conteúdo atualizado à mão.** Mudanças em órgãos, bolsas, eventos e links
   exigem edição manual do JSON; fotos exigem troca de arquivo.
5. **Links externos (PRAE etc.) estão fora do nosso controle** e podem mudar
   ou cair.
6. **Hardware limitado pode degradar o desempenho** da renderização WebGL,
   sobretudo com várias fotos na ficha.

---

## 8. Verificação

1. **Testes manuais pela própria equipe,** comparando o comportamento
   observado com os fluxos principal e de exceção de cada requisito da Seção
   5 — incluindo o tríptico lista ⇄ pin ⇄ ficha e a troca de área.
2. **Itens verificados em especial:** renderização em vários navegadores e
   dispositivos, pan e zoom dentro dos limites, posicionamento e clique nos
   hotspots, sincronismo da lista, busca, filtros, conteúdo da ficha e
   responsividade.
3. **Sem CI/CD nesta fase.** Integração contínua e serviço de testes na nuvem
   não estão previstos; podem ser reavaliados depois. O que existe são os
   scripts locais de `testes/`, exigidos pela regra 9.1 — rodam à mão, sem
   infraestrutura, e cobrem regressão de comportamento; **não substituem** a
   verificação manual dos itens 1 e 2.

---

## 9. Regras de trabalho

### 9.1 Todo bug corrigido vem com teste de regressão

Um teste que falha sem a correção e passa com ela. A tarefa **não fecha** sem
ele. Onde o teste vive:

- **Lógica pura** (matemática, formato, conversão, normalização de busca):
  caso de unidade, com valor conferido à mão.
- **Comportamento visual** (renderização, projeção, eventos): verificação
  registrada no diário (checklist + evidência) e, quando reproduzível em
  código, caso automatizado também — é o caso dos scripts CDP em `testes/`.
- **Impossível de automatizar:** o diário registra a verificação manual e o
  motivo.

**Retroativo:** bugs corrigidos antes desta regra não serão reprocessados em
massa — mas quem toca numa área, testa: ao mexer lá de novo, o comportamento
corrigido ganha teste.

### 9.2 Rode antes de reanalisar

Decidiu e documentou? **Execute** (build, teste). Só volte a raciocinar se
algo falhar — e direcionado ao que falhou, com a evidência na mão. Rodadas de
"e se..." sem falha anterior não entram em sessão.

**Exceção:** decisões com trade-off real (formato de dados, arquitetura,
impacto em entrega) pedem conversa antes de qualquer linha de código. Aí o
usuário entra na conversa — o que se evita é reanálise sem rodar, não
pensamento no momento certo.

---

## 10. Decisões pendentes

1. **Estados que o Figma não traz.** A varredura confirmou (Seção 3) que o
   arquivo tem uma única tela, sem mobile e sem estados vazios. Implementamos
   por conta própria: busca sem resultado mostra "Nenhum resultado
   encontrado", área sem textura mostra o aviso de área pendente, e falha de
   WebGL mostra a mensagem de incompatibilidade. Falta validar esses textos e
   esse layout com a equipe.
2. **Comportamento em telas pequenas — provisório.** O design lido é desktop
   de três zonas. Até ≤980px a barra vira gaveta (botão `#abrir-gaveta`) e a
   ficha cobre o mapa; o CSS foi escrito assim como solução temporária e esta
   decisão segue aberta — confirmar ou substituir pelo design mobile, quando
   existir.
3. **Alimentação do sino e dos badges.** Sem backend, o contador é calculado
   das datas futuras do JSON no carregamento. Confirmar se basta — e quem
   mantém as datas.
4. **Fotos:** quem produz, licença, quantidade por órgão e peso máximo. Pode
   virar restrição dura se o desempenho sofrer.
5. **Hierarquia de blocos e unidades — implementada, falta reconhecer.** O
   modelo `tipo: bloco` + `unidades` está no JSON e na ficha (a do Bloco
   lista as unidades), mas o documento de requisitos não o define. Confirmar
   com a equipe antes de tratar como definitivo.
6. **Bolsas e oportunidades:** datadas (com prazo) ou texto permanente?
   Implementado como texto permanente com `prazo` opcional — hoje nenhuma
   bolsa está preenchida com prazo; só os `eventos` do sino têm data. Muda o
   JSON e o comportamento do filtro `Bolsas`, então confirmar antes de
   alimentar de verdade.
7. **Requisitos não funcionais ausentes.** A seção 2.6 do documento promete
   desempenho, usabilidade, compatibilidade e responsividade, mas só há
   histórias funcionais.
8. **Funcionalidades dos slides fora dos requisitos:** ícone de perfil no
   cabeçalho, trilha de "como chegar até lá", categorias "Salas importantes" e
   "Eventos e notícias". Decidir se entram no escopo.
9. **Estilo do mapa.** Os slides sugerem aparência isométrica; o documento de
   requisitos pede 2D ortográfico. Alinhar com quem produzirá a ilustração.
10. **Figma como fonte dos requisitos.** Os `PRJ-WEB-005` a `009` vieram do
    design e do pedido do projeto, não do documento de requisitos v1.1 —
    decidir se o documento é atualizado ou se o Figma passa a valer como
    anexo.
11. **Links externos provisórios.** `prae.ufc.br`, `ufc.br/sobral`,
    `ec.ufc.br` e o site da Coordenação de Engenharia Elétrica estão no JSON
    como marcadores da estrutura — validar com a equipe antes de publicar,
    junto com a licença das fotos.

---

## 11. Estado atual (atualizar a cada sessão)

**Situação:** aplicação implementada e funcionando — as três zonas do design
(barra, mapa, ficha), 8 locais e 2 áreas no `locais.json`, 4 controles
registrados (zoom, bússola, sino, seletor de área) e 7 seções de ficha.
Verificação executada: 40/40 interações passando na suíte e o caminho de falha
de WebGL confere a mensagem sem chegar a baixar o Three.js (`testes/`).

**Para rodar:** `python3 -m http.server 8000` na raiz e abrir
`http://localhost:8000/` — o `fetch` do JSON não funciona em `file://`.
Renderização conferida no Chromium headless (SwiftShader).

**Próxima ação imediata:** decidir os itens 1, 2 e 11 da Seção 10 (estados
sem design, layout pequeno provisório e links provisórios), recalibrar as
`coordenadas` com a ilustração final e trocar a foto provisória do Bloco.

---

## 12. Diário de progresso (acrescentar no fim, nunca reescrever)

- **2026-10-18** — Figma analisado (tela principal). Nova Seção 3 com o
  levantamento da interface; requisitos `PRJ-WEB-005` a `009` (filtros,
  lista sincronizada, ficha completa, troca de área, novidades); modelo de
  conteúdo em JSON (Seção 6.4) com fotos, contatos, eventos e bolsas; 10
  decisões pendentes registradas.
- **2026-10-19** — Aplicação escrita e verificada. Leitura do Figma pela API
  com token local (só o endpoint de imagens responde; sem ele, só a
  thumbnail); render da tela salvo em `docs/figma/` e as 5 sobreposições
  embutidas (pin, sino, zoom, bússola, FAMED) removidas da ilustração — que
  virou `assets/mapa-campus.png` como master e `mapa-campus.webp` de 104 KB
  para execução. A leitura em alta corrigiu conteúdo: endereço 563, datas
  04 e 05/11/2026, e-mails e telefones das Coordenações, placeholder
  "Pesquisar local...". Estrutura real da Seção 6.3 gravada; regra de
  extensão (Seção 6.1, item 4) implementada como `registrarControle()` e
  `registrarSecaoFicha()`. Verificação com Chromium headless via CDP, com
  três scripts guardados em `testes/`: 40/40 interações (lista ⇄ pin ⇄ ficha,
  busca, chips, sino, zoom, bússola, troca de área e fechamento), caminho de
  falha de WebGL com mensagem e sem baixar o mapa, e utilitário de captura.
  Bugs corrigidos e cobertos por regressão: `paraTela()` lia propriedade
  inexistente do renderer e devolvia `NaN`, deixando os pins sem posição;
  a renderização em demanda descartava o quadro antes da composição
  (`preserveDrawingBuffer: true`); abrir a ficha estreitava a área do mapa e
  o local selecionado parava fora do centro. Ficou registrado também que o
  Three r171 é dividido em dois arquivos (`three.module.js` importa
  `three.core.js`) — sem o segundo, o grafo de módulos falha em silêncio.
