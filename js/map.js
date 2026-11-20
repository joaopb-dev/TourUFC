/**
 * Camada de renderização: o modelo 3D do campus (`UFC.obj`) visto de cima,
 * como um mapa de satélite.
 *
 * A câmera é ortográfica e olha de leve para baixo (vista superior
 * inclinada): a leitura continua a de um mapa 2D, mas a inclinação mostra as
 * laterais dos blocos — volume reforçado pelo relevo e pela sombra projetada
 * da luz direcional.
 *
 * Unidades de mundo: largura de referência = 2; a altura acompanha a proporção
 * do conteúdo do modelo. Coordenadas de conteúdo entram normalizadas
 * (0..1, origem no canto superior esquerdo da vista).
 */

import * as THREE from '../vendor/three.module.js';
import { montarGeometrias } from './obj.js';

const COR_FUNDO = 0xdfdfdf;
const LARGURA_MUNDO = 2;
// Fração do quadro ocupada pelo conteúdo: sobra margem de terreno nas bordas
// (como no mapa ilustrado original) e espaço para a sombra cair sem cortar.
const MARGEM = 0.88;
const ALTURA_SOL = 18;   // altura do "sol": quanto mais alto, mais curta a sombra
// Inclinação da vista: em vez de olhar reto para baixo, a câmera recua um
// pouco para trás (0 = vista de cima pura; 25° = leve — os blocos mostram as
// laterais e o campus ganha volume sem virar 3D pleno).
const INCLINACAO = 25 * Math.PI / 180;
const DISTANCIA_CAMERA = 18;   // distância da câmera até o centro da vista
// Parcela mínima do conteúdo que precisa continuar no quadro depois de um
// arraste: dá folga de verdade para o mapa sair do lugar (sem parecer
// engessado), mas nunca some ele de vez da tela.
const FRACAO_VISIVEL = 0.25;
// Rigidez da mola de retorno elástico (o amortecimento é o crítico, 2√K).
const RIGIDEZ_MOLA = 110;

// Paleta de satélite por categoria de superfície (terreno, prédio, árvore).
const CORES = {
  chao: 0xb9cba4,
  construcao: 0xeef1f6,
  vegetacao: 0x8fb479,
};

export function criarMapa({ canvas, aoAnimar = () => {} }) {
  // `preserveDrawingBuffer` mantém o último quadro disponível para o
  // compositor — sem ele, prints e capturas de tela mostram o canvas vazio.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COR_FUNDO);

  // Luz do "sol": vem da direita e de cima, como no mapa ilustrado original,
  // para a sombra dos prédios cair para baixo-e-esquerda e saltar o relevo.
  const sol = new THREE.DirectionalLight(0xffffff, 2.6);
  sol.position.set(5, ALTURA_SOL, -4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0015;
  // `normalBias` empurra o ponto testado ao longo da normal da superfície: é o
  // que evita o "acne" (faixas escuras de sombra dentro do próprio prédio).
  sol.shadow.normalBias = 0.03;
  sol.target.position.set(0, 0, 0);
  scene.add(sol, sol.target);
  // Preenche as sombras para o campus não ficar com breu ilegível.
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));

  // Vista superior inclinada: a câmera recua atrás do ponto central do
  // terreno e o encara de leve — é o que dá volume aos blocos.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.up.set(0, 0, -1);
  const foco = { x: 0, z: 0 };   // ponto do terreno no centro do quadro

  function posicionarCamera() {
    camera.position.set(
      foco.x,
      DISTANCIA_CAMERA * Math.cos(INCLINACAO),
      foco.z + DISTANCIA_CAMERA * Math.sin(INCLINACAO),
    );
    camera.lookAt(foco.x, 0, foco.z);
  }
  posicionarCamera();

  const mundo = new THREE.Group();   // modelo carregado, centrado na origem
  scene.add(mundo);

  let alturaMundo = 2;
  let aspecto = 1;
  let larguraPx = 1;            // tamanho em pixels CSS (o buffer pode ser 2x)
  let alturaPx = 1;
  let zoomMin = 0.25;
  let zoomMax = 4;
  const carregador = new THREE.TextureLoader();

  const limitar = (v, min, max) => Math.min(Math.max(v, min), max);

  function aplicarFrustum() {
    camera.left = -aspecto;
    camera.right = aspecto;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
  }

  /** Mínimo = conteúdo inteiro visível; máximo = definido pela área. */
  function recalcularZoom(ajustarZoom = true) {
    // Na inclinação o conteúdo encolhe na vertical (foreshortening pelo
    // cosseno), então o enquadramento mínimo acompanha para o quadro
    // continuar cheio de terreno.
    const enquadramento = Math.min(aspecto, 2 / (alturaMundo * Math.cos(INCLINACAO)));
    zoomMin = enquadramento;
    if (ajustarZoom) camera.zoom = limitar(camera.zoom, zoomMin, zoomMax);
  }

  let naBorda = false;   // a vista está encostada no limite do arraste
  let mola = null;       // retorno elástico em andamento (identidade da animação)

  /**
   * Converte a posição desejada de um eixo na posição possível, mantendo
   * `FRACAO_VISIVEL` do conteúdo visível (nunca mais que o próprio quadro
   * comporta). No zoom inicial, em que o quadro é maior que o conteúdo, isso
   * dá folga real para arrastar; com zoom forte o conteúdo passa a cobrir o
   * quadro inteiro, como mapa de verdade.
   */
  function travarEixo(posicao, tamanho, metadeVisivel) {
    const minimo = Math.min(FRACAO_VISIVEL * tamanho, 2 * metadeVisivel);
    const baixo = minimo - metadeVisivel - tamanho / 2;
    const alto = tamanho / 2 + metadeVisivel - minimo;
    if (baixo > alto) return { pos: 0, naBorda: false };
    return {
      pos: limitar(posicao, baixo, alto),
      naBorda: posicao <= baixo || posicao >= alto,
    };
  }

  function limitarPosicao() {
    // Na inclinação o eixo Z do mundo aparece encurtado na tela pelo cosseno
    // da inclinação: o mesmo quadro cobre mais terreno em profundidade.
    const cosseno = Math.cos(INCLINACAO);
    const eixoX = travarEixo(foco.x, LARGURA_MUNDO, aspecto / camera.zoom);
    const eixoZ = travarEixo(foco.z, alturaMundo, 1 / (camera.zoom * cosseno));
    naBorda = eixoX.naBorda || eixoZ.naBorda;
    foco.x = eixoX.pos;
    foco.z = eixoZ.pos;
    posicionarCamera();
  }

  /** Cancela o retorno elástico: o toque do usuário assume o controle. */
  function pararMola() { mola = null; }

  /**
   * Solta o mapa encostado no limite: ele volta ao centro na marra de uma
   * mola amortecida (crítica) — dispara de uma vez, chega suave e não
   * oscila. Enquanto anima, `aoAnimar` reprojeta os pins a cada quadro.
   */
  function recentralizarComMola() {
    pararMola();
    if (foco.x === 0 && foco.z === 0) return;
    // Amortecimento crítico (ζ = 1): puxão elástico que dispara de uma vez e
    // chega suave, sem oscilação. w = √rigidez define o quão rápido "puxa".
    const w = Math.sqrt(RIGIDEZ_MOLA);
    const estado = {
      x: foco.x,
      z: foco.z,
      vx: 0,
      vz: 0,
      anterior: performance.now(),
    };
    mola = estado;

    const passo = (agora) => {
      if (mola !== estado) return;   // reagarraram o mapa no meio do voo
      // Solução exata da mola amortecida crítica em função de dt, não um
      // integrador passo-a-passo: qualquer atraso de quadro (aba em segundo
      // plano, máquina lenta) avança o estado exatamente até onde o relógio
      // manda — estável por construção e com a duração do puxão constante.
      const dt = Math.min((agora - estado.anterior) / 1000, 0.5);
      estado.anterior = agora;
      const decaimento = Math.exp(-w * dt);
      const comumX = (estado.vx + w * estado.x) * dt;
      const comumZ = (estado.vz + w * estado.z) * dt;
      estado.x = (estado.x + comumX) * decaimento;
      estado.z = (estado.z + comumZ) * decaimento;
      estado.vx = (estado.vx - comumX * w) * decaimento;
      estado.vz = (estado.vz - comumZ * w) * decaimento;
      foco.x = estado.x;
      foco.z = estado.z;
      limitarPosicao();
      aoAnimar();
      const parou = Math.abs(estado.x) < 0.003 && Math.abs(estado.vx) < 0.08
        && Math.abs(estado.z) < 0.003 && Math.abs(estado.vz) < 0.08;
      if (parou) {
        pararMola();
        foco.x = 0;
        foco.z = 0;
        limitarPosicao();
        aoAnimar();
        return;
      }
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function ajustarTamanho() {
    pararMola();
    const pai = canvas.parentElement;
    larguraPx = Math.max(1, pai.clientWidth);
    alturaPx = Math.max(1, pai.clientHeight);
    aspecto = larguraPx / alturaPx;
    renderer.setSize(larguraPx, alturaPx, false);
    aplicarFrustum();
    recalcularZoom();
    limitarPosicao();
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function moverPorPixels(dxPx, dyPx) {
    pararMola();
    if (!larguraPx || !alturaPx) return;
    const mundoPorPx = (2 * aspecto / camera.zoom) / larguraPx;
    foco.x -= dxPx * mundoPorPx;
    // A tela "sobe" no sentido -Z; na inclinação o eixo Z também é projetado
    // encurtado pelo cosseno — por px percorrido na tela, o foco anda mais.
    foco.z -= dyPx * (mundoPorPx / Math.cos(INCLINACAO));
    limitarPosicao();
    camera.updateProjectionMatrix();
  }

  /**
   * Zoom sobre um ponto da tela (coordenada normalizada -1..1): o mundo sob o
   * cursor permanece parado — o excedente além dos limites é descartado.
   */
  function aplicarZoom(novoZoom, ndcX = 0, ndcY = 0) {
    pararMola();
    const antes = camera.zoom;
    const alvo = limitar(novoZoom, zoomMin, zoomMax);
    // O ponto do terreno sob o cursor: em Z ele sai dividido pelo cosseno da
    // inclinação (mesma razão de projecção usada no arraste).
    const cosseno = Math.cos(INCLINACAO);
    const mundoX = foco.x + ndcX * (aspecto / antes);
    const mundoZ = foco.z - ndcY / (antes * cosseno);
    camera.zoom = alvo;
    foco.x = mundoX - ndcX * (aspecto / alvo);
    foco.z = mundoZ + ndcY / (alvo * cosseno);
    limitarPosicao();
    camera.updateProjectionMatrix();
    return alvo;
  }

  function centralizarEm(nx, ny, novoZoom) {
    pararMola();
    if (Number.isFinite(novoZoom)) camera.zoom = limitar(novoZoom, zoomMin, zoomMax);
    foco.x = (nx - 0.5) * LARGURA_MUNDO;
    foco.z = (ny - 0.5) * alturaMundo;
    limitarPosicao();
    camera.updateProjectionMatrix();
  }

  function recentralizar() {
    pararMola();
    camera.zoom = zoomMin;
    centralizarEm(0.5, 0.5);
  }

  /** Coordenada normalizada (0..1) -> pixel CSS do canvas. */
  function paraTela(nx, ny) {
    const ponto = new THREE.Vector3(
      (nx - 0.5) * LARGURA_MUNDO,
      0,
      (ny - 0.5) * alturaMundo,
    ).project(camera);
    return {
      x: (ponto.x * 0.5 + 0.5) * larguraPx,
      y: (-ponto.y * 0.5 + 0.5) * alturaPx,
      dentro: ponto.x >= -1 && ponto.x <= 1 && ponto.y >= -1 && ponto.y <= 1,
    };
  }

  function dimensoes() {
    return { largura: larguraPx, altura: alturaPx };
  }

  /** Enquadra o modelo recém-carregado e ajusta os limites de zoom. */
  function aplicarModelo(geometrias, alturaConteudo) {
    mundo.clear();
    for (const { categoria, geo } of geometrias) {
      const malha = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: CORES[categoria] ?? 0xcccccc,
        roughness: 0.95,
        metalness: 0,
      }));
      malha.castShadow = categoria !== 'chao';   // só prédios e árvores projetam
      malha.receiveShadow = true;
      mundo.add(malha);
    }

    // O enquadramento da sombra cobre o conteúdo mais a distância que a
    // própria sombra anda (sol inclinado); sem isso ela corta na borda.
    const raio = LARGURA_MUNDO * 0.85;
    const camSombra = sol.shadow.camera;
    camSombra.left = -raio;
    camSombra.right = raio;
    camSombra.top = raio;
    camSombra.bottom = -raio;
    camSombra.updateProjectionMatrix();

    // As coordenadas (0..1) dos locais cobrem o quadro inteiro; o conteúdo do
    // campus ocupa `MARGEM` dele, deixando terreno livre nas bordas.
    alturaMundo = Math.max(alturaConteudo / MARGEM, 0.01);
    recalcularZoom(false);
    zoomMax = Math.max(4, zoomMin * 6);
    recentralizar();
  }

  /**
   * Carrega o modelo 3D do campus e o devolve pronto para vista de satélite.
   * A largura do conteúdo vira `LARGURA_MUNDO * MARGEM`; a altura acompanha a
   * proporção do próprio modelo.
   */
  async function carregarModelo(url) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao buscar "${url}"`);
    const texto = await resposta.text();
    const { geometrias, alturaMundo: altura } = montarGeometrias(texto, LARGURA_MUNDO * MARGEM);
    aplicarModelo(geometrias, altura);
    render();
    return { largura: LARGURA_MUNDO, altura };
  }

  /** Troca o conteúdo por uma imagem plana (áreas ainda sem modelo 3D). */
  function carregarTextura(url) {
    return new Promise((resolver, rejeitar) => {
      carregador.load(
        url,
        (textura) => {
          textura.colorSpace = THREE.SRGBColorSpace;
          textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
          const iw = textura.image.width;
          const ih = textura.image.height;
          alturaMundo = 2 * (ih / iw);
          recalcularZoom(false);
          zoomMax = Math.max(4, zoomMin * 6);
          recentralizar();
          render();
          resolver({ largura: iw, altura: ih });
        },
        undefined,
        () => rejeitar(new Error(`não foi possível carregar "${url}"`)),
      );
    });
  }

  function alturaMundoInfo() { return { alturaMundo, larguraMundo: LARGURA_MUNDO, aspecto, zoom: camera.zoom, zoomMin, zoomMax, incl: INCLINACAO }; }

  return {
    render,
    ajustarTamanho,
    moverPorPixels,
    aplicarZoom,
    centralizarEm,
    recentralizar,
    carregarModelo,
    carregarTextura,
    paraTela,
    dimensoes,
    alturaMundoInfo,
    naBorda: () => naBorda,
    posicao: () => ({ x: foco.x, z: foco.z }),
    recentralizarComMola,
    zoom: () => camera.zoom,
    limitesZoom: () => ({ min: zoomMin, max: zoomMax }),
    larguraMundo: () => LARGURA_MUNDO,
    alturaMundo: () => alturaMundo,
    camera,
    renderer,
  };
}
