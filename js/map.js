/**
 * Camada de renderização: o modelo 3D do campus (`UFC.obj`) visto de cima,
 * como um mapa de satélite.
 *
 * A câmera é ortográfica e olha para baixo (vista superior), então a leitura é
 * a de um mapa 2D — mas com relevo e sombra projetada dados pela luz
 * direcional, que é o que faz prédios e árvores saltarem do terreno.
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

  // Vista superior: câmera no alto apontando para o chão, "norte" para cima.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, ALTURA_SOL, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

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
    const enquadramento = Math.min(aspecto, 2 / alturaMundo);
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
    const eixoX = travarEixo(camera.position.x, LARGURA_MUNDO, aspecto / camera.zoom);
    const eixoZ = travarEixo(camera.position.z, alturaMundo, 1 / camera.zoom);
    naBorda = eixoX.naBorda || eixoZ.naBorda;
    camera.position.x = eixoX.pos;
    camera.position.z = eixoZ.pos;
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
    if (camera.position.x === 0 && camera.position.z === 0) return;
    // Amortecimento crítico (ζ = 1): puxão elástico que dispara de uma vez e
    // chega suave, sem oscilação. w = √rigidez define o quão rápido "puxa".
    const w = Math.sqrt(RIGIDEZ_MOLA);
    const estado = {
      x: camera.position.x,
      z: camera.position.z,
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
      camera.position.x = estado.x;
      camera.position.z = estado.z;
      aoAnimar();
      const parou = Math.abs(estado.x) < 0.003 && Math.abs(estado.vx) < 0.08
        && Math.abs(estado.z) < 0.003 && Math.abs(estado.vz) < 0.08;
      if (parou) {
        pararMola();
        camera.position.x = 0;
        camera.position.z = 0;
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
    camera.position.x -= dxPx * mundoPorPx;
    // A tela "sobe" no sentido -Z, então arrastar para baixo move a câmera
    // para -Z (o conteúdo desce junto com o dedo).
    camera.position.z -= dyPx * mundoPorPx;
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
    const mundoX = camera.position.x + ndcX * (aspecto / antes);
    const mundoZ = camera.position.z - ndcY * (1 / antes);
    camera.zoom = alvo;
    camera.position.x = mundoX - ndcX * (aspecto / alvo);
    camera.position.z = mundoZ + ndcY * (1 / alvo);
    limitarPosicao();
    camera.updateProjectionMatrix();
    return alvo;
  }

  function centralizarEm(nx, ny, novoZoom) {
    pararMola();
    if (Number.isFinite(novoZoom)) camera.zoom = limitar(novoZoom, zoomMin, zoomMax);
    camera.position.x = (nx - 0.5) * LARGURA_MUNDO;
    camera.position.z = (ny - 0.5) * alturaMundo;
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

  function alturaMundoInfo() { return { alturaMundo, larguraMundo: LARGURA_MUNDO, aspecto, zoom: camera.zoom, zoomMin, zoomMax }; }

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
    posicao: () => ({ x: camera.position.x, z: camera.position.z }),
    recentralizarComMola,
    __scene: scene,   // TEMP: depuração
    zoom: () => camera.zoom,
    limitesZoom: () => ({ min: zoomMin, max: zoomMax }),
    larguraMundo: () => LARGURA_MUNDO,
    alturaMundo: () => alturaMundo,
    camera,
    renderer,
  };
}
