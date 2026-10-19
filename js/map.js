/**
 * Camada de renderização (Seção 6.1 do plano): a textura da área num plano,
 * vista de frente por uma OrthographicCamera. Sem objetos 3D, sem luzes,
 * sem raycasting.
 *
 * Unidades de mundo: largura de referência = 2; a altura acompanha a
 * proporção da textura. Coordenadas de conteúdo entram normalizadas
 * (0..1, origem no canto superior esquerdo da textura).
 */

import * as THREE from '../vendor/three.module.js';

const COR_FUNDO = 0xdfdfdf;

export function criarMapa({ canvas }) {
  // Renderização em demanda (um quadro estático). `preserveDrawingBuffer`
  // mantém o último quadro disponível para o compositor — sem ele, prints e
  // capturas de tela podem mostrar o canvas vazio.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COR_FUNDO);

  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  plano.scale.set(2, 2, 1);
  scene.add(plano);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const LARGURA_MUNDO = 2;
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

  /** Mínimo = textura inteira visível; máximo = definido pela área (Seção 2.1, regra 4). */
  function recalcularZoom(ajustarZoom = true) {
    const enquadramento = Math.min(aspecto, 2 / alturaMundo);
    zoomMin = enquadramento;
    if (ajustarZoom) camera.zoom = limitar(camera.zoom, zoomMin, zoomMax);
  }

  function limitarPosicao() {
    const metadeVisivelX = aspecto / camera.zoom;
    const metadeVisivelY = 1 / camera.zoom;
    const folgaX = LARGURA_MUNDO / 2 - metadeVisivelX;
    const folgaY = alturaMundo / 2 - metadeVisivelY;
    camera.position.x = folgaX > 0 ? limitar(camera.position.x, -folgaX, folgaX) : 0;
    camera.position.y = folgaY > 0 ? limitar(camera.position.y, -folgaY, folgaY) : 0;
  }

  function ajustarTamanho() {
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

  function moverPorPixels(dxPx, dyPx, larguraPx, alturaPx) {
    if (!larguraPx || !alturaPx) return;
    const mundoPorPx = (2 * aspecto / camera.zoom) / larguraPx;
    camera.position.x -= dxPx * mundoPorPx;
    camera.position.y += dyPx * mundoPorPx;   // eixo Y do mundo sobe, tela desce
    limitarPosicao();
    camera.updateProjectionMatrix();
  }

  /**
   * Zoom sobre um ponto da tela (coordenada normalizada -1..1): o mundo sob o
   * cursor permanece parado — o excedente além dos limites é descartado.
   */
  function aplicarZoom(novoZoom, ndcX = 0, ndcY = 0) {
    const antes = camera.zoom;
    const alvo = limitar(novoZoom, zoomMin, zoomMax);
    const mundoX = camera.position.x + ndcX * (aspecto / antes);
    const mundoY = camera.position.y + ndcY * (1 / antes);
    camera.zoom = alvo;
    camera.position.x = mundoX - ndcX * (aspecto / alvo);
    camera.position.y = mundoY - ndcY * (1 / alvo);
    limitarPosicao();
    camera.updateProjectionMatrix();
    return alvo;
  }

  function centralizarEm(nx, ny, novoZoom) {
    if (Number.isFinite(novoZoom)) camera.zoom = limitar(novoZoom, zoomMin, zoomMax);
    camera.position.x = (nx - 0.5) * LARGURA_MUNDO;
    camera.position.y = -(ny - 0.5) * alturaMundo;
    limitarPosicao();
    camera.updateProjectionMatrix();
  }

  function recentralizar() {
    camera.zoom = zoomMin;
    centralizarEm(0.5, 0.5);
  }

  /** Coordenada normalizada (0..1) -> pixel CSS do canvas. */
  function paraTela(nx, ny) {
    const mundo = new THREE.Vector3(
      (nx - 0.5) * LARGURA_MUNDO,
      -(ny - 0.5) * alturaMundo,
      0,
    ).project(camera);
    return {
      x: (mundo.x * 0.5 + 0.5) * larguraPx,
      y: (-mundo.y * 0.5 + 0.5) * alturaPx,
      dentro: mundo.x >= -1 && mundo.x <= 1 && mundo.y >= -1 && mundo.y <= 1,
    };
  }

  function dimensoes() {
    return { largura: larguraPx, altura: alturaPx };
  }

  function carregarTextura(url) {
    return new Promise((resolver, rejeitar) => {
      carregador.load(
        url,
        (textura) => {
          textura.colorSpace = THREE.SRGBColorSpace;
          textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
          if (material.map) material.map.dispose();
          material.map = textura;
          material.color.set(0xffffff);
          material.needsUpdate = true;

          const iw = textura.image.width;
          const ih = textura.image.height;
          alturaMundo = 2 * (ih / iw);
          plano.scale.set(LARGURA_MUNDO, alturaMundo, 1);
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

  return {
    render,
    ajustarTamanho,
    moverPorPixels,
    aplicarZoom,
    centralizarEm,
    recentralizar,
    carregarTextura,
    paraTela,
    dimensoes,
    zoom: () => camera.zoom,
    limitesZoom: () => ({ min: zoomMin, max: zoomMax }),
    larguraMundo: () => LARGURA_MUNDO,
    alturaMundo: () => alturaMundo,
    camera,
    renderer,
  };
}
