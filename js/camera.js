/**
 * Navegação e câmera (PRJ-WEB-002): arraste por mouse/Toque, rolagem e
 * pinça para zoom — mais os gestos de rotação e inclinação no estilo do
 * Google Maps: Ctrl+arrastar (ou botão direito) orbita a vista e, com dois
 * dedos, o twist gira, o arraste paralelo inclina na vertical e move na
 * horizontal. Os botões registrados por js/modulos/controles-mapa.js
 * completam o resto (zoom, bússola, 2D/3D).
 *
 * Os limites de deslocamento, de aproximação, de rotação e de inclinação
 * vivem em map.js; aqui só se traduz gesto em movimento e se avisa a UI
 * (`aoMudar`) para reprojetar os pins (ponto de atenção 1 da Seção 6.5:
 * só durante o movimento).
 */

// Sensibilidade da orbita (Ctrl/botão direito): rotação e inclinação em
// graus por pixel arrastado — inclinar passa de 0° a 45° em ~300 px.
const GRAUS_ROTACAO = 0.25;
const GRAUS_INCLINACAO = 0.15;
// Gates dos gestos de dois dedos. A pinça acumulada fica em torno de zero
// durante um arraste paralelo (os dedos oscilam lado a lado) e cresce
// monotonicamente ao zoomar; o giro acumulado cresce só no twist. Com
// isso, zoomar não arrasta/inclina o mapa e, enquanto o giro não for
// encerrado (dedos levantados), só a rotação vale — a decomposição
// dedo-a-dedo do twist não vira zoom/arraste fantasma.
const LIMITE_PINCA = Math.log(1.15);   // pinça variou ≤15% no total
const LIMITE_TWIST = 15 * Math.PI / 180;
// Folga do twist: ruído subpixel do par de dedos não vira giro da vista.
const FOLGA_TWIST = 0.004;   // rad

export function criarControlesDeCamera({ canvas, mapa, aoMudar }) {
  const ponteiros = new Map();
  let arrastando = false;
  let moveu = false;          // o gesto atual arrastou de verdade (não foi clique)
  let orbitando = false;      // Ctrl/botão direito: orbita em vez de arrastar o mapa
  let distancaiaAnterior = 0;
  let anguloAnterior = 0;     // orientação do par de dedos (twist)
  let centroAnterior = null;  // centro do par de dedos (arraste paralelo)
  let pincaAcumulada = 0;     // Σ log(variação da pinça) — gate do pan/inclinação
  let twistAcumulado = 0;     // Σ giro do par de dedos — idem

  const ndc = (evento) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((evento.clientX - r.left) / r.width) * 2 - 1,
      y: -(((evento.clientY - r.top) / r.height) * 2 - 1),
    };
  };

  function aoEncostar(evento) {
    canvas.setPointerCapture?.(evento.pointerId);
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (ponteiros.size === 1) {
      arrastando = true;
      moveu = false;
      orbitando = Boolean(evento.ctrlKey || evento.metaKey || evento.button === 2);
      canvas.classList.add('arrastando');
    }
    if (ponteiros.size === 2) {
      // A ordem de inserção dos dedos é estável durante o gesto; todos os
      // ângulos são medidos nela (p1 -> p2) para o twist não trocar de sinal.
      const [a, b] = [...ponteiros.values()];
      distancaiaAnterior = Math.hypot(a.x - b.x, a.y - b.y);
      anguloAnterior = Math.atan2(b.y - a.y, b.x - a.x);
      centroAnterior = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pincaAcumulada = 0;
      twistAcumulado = 0;
    }
  }

  function aoMover(evento) {
    const anterior = ponteiros.get(evento.pointerId);
    if (!anterior) return;

    if (ponteiros.size === 2) {
      // Dois dedos, como no Google Maps: pinça -> zoom; twist -> rotação;
      // arraste paralelo -> inclinação na vertical e pan na horizontal. O
      // giro acumulado "trava" o resto do gesto (zoom/pan/inclinação) e a
      // pinça acumulada trava pan/inclinação — assim girar não vira zoom
      // fantasma e zoomar não arrasta o mapa junto.
      ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
      const [p1, p2] = [...ponteiros.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const angulo = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const r = canvas.getBoundingClientRect();
      const ndcCentro = {
        x: ((centro.x - r.left) / r.width) * 2 - 1,
        y: -(((centro.y - r.top) / r.height) * 2 - 1),
      };

      // Twist primeiro: ele decide se o resto do gesto vale. Normaliza o
      // salto de ±180° do atan2 para o gesto cruzar o zero sem um giroço.
      let giro = angulo - anguloAnterior;
      giro = Math.atan2(Math.sin(giro), Math.cos(giro));
      anguloAnterior = angulo;
      if (Math.abs(giro) > FOLGA_TWIST) twistAcumulado += giro;
      const girando = Math.abs(twistAcumulado) > LIMITE_TWIST;

      if (!girando && distancaiaAnterior > 0 && dist > 0) {
        const razao = dist / distancaiaAnterior;
        pincaAcumulada += Math.log(razao);
        mapa.aplicarZoom(mapa.zoom() * razao, ndcCentro.x, ndcCentro.y);
      }
      distancaiaAnterior = dist;

      if (Math.abs(giro) > FOLGA_TWIST) mapa.girar(-giro * 180 / Math.PI);

      const dcx = centro.x - centroAnterior.x;
      const dcy = centro.y - centroAnterior.y;
      centroAnterior = centro;

      if (!girando && Math.abs(pincaAcumulada) <= LIMITE_PINCA) {
        if (dcx) { mapa.moverPorPixels(dcx, 0); moveu = true; }
        // Arrastar para cima aproxima do horizonte (mais inclinação), como
        // no Maps; para baixo a vista volta a ser de cima.
        if (dcy) mapa.definirInclinacao(mapa.inclinacao() - dcy * GRAUS_INCLINACAO);
      }
      aoMudar();
      return;
    }

    const dx = evento.clientX - anterior.x;
    const dy = evento.clientY - anterior.y;
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (arrastando && (dx || dy)) {
      moveu = true;
      if (orbitando) {
        // Ctrl/botão direito: horizontal gira a vista, vertical inclina.
        if (dx) mapa.girar(-dx * GRAUS_ROTACAO);
        if (dy) mapa.definirInclinacao(mapa.inclinacao() - dy * GRAUS_INCLINACAO);
      } else {
        mapa.moverPorPixels(dx, dy, canvas.clientWidth, canvas.clientHeight);
      }
      aoMudar();
    }
  }

  function aoSair(evento) {
    ponteiros.delete(evento.pointerId);
    if (ponteiros.size < 2) {
      distancaiaAnterior = 0;
      centroAnterior = null;
      pincaAcumulada = 0;
      twistAcumulado = 0;
    }
    if (ponteiros.size === 0) {
      arrastando = false;
      canvas.classList.remove('arrastando');
      // Arrastou até o limite (mapa saindo do quadro)? Solta e a mola
      // elástica puxa tudo de volta para o centro.
      if (moveu && mapa.naBorda?.()) mapa.recentralizarComMola?.();
      moveu = false;
    }
  }

  function aoRolar(evento) {
    evento.preventDefault();
    const fator = Math.exp(-evento.deltaY * 0.0016);   // rolagem contínua
    const p = ndc(evento);
    mapa.aplicarZoom(mapa.zoom() * fator, p.x, p.y);
    aoMudar();
  }

  // Arrastar com o botão direito é orbitar (como no Maps): sem isto o
  // navegador abriria o menu de contexto no meio do gesto.
  const impedirMenu = (evento) => evento.preventDefault();

  canvas.addEventListener('pointerdown', aoEncostar);
  canvas.addEventListener('pointermove', aoMover);
  canvas.addEventListener('pointerup', aoSair);
  canvas.addEventListener('pointercancel', aoSair);
  canvas.addEventListener('wheel', aoRolar, { passive: false });
  canvas.addEventListener('contextmenu', impedirMenu);

  const passo = 1.35;
  return {
    aumentar: () => { mapa.aplicarZoom(mapa.zoom() * passo); aoMudar(); },
    diminuir: () => { mapa.aplicarZoom(mapa.zoom() / passo); aoMudar(); },
    recentralizar: () => { mapa.recentralizar(); aoMudar(); },
    destruir() {
      canvas.removeEventListener('pointerdown', aoEncostar);
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerup', aoSair);
      canvas.removeEventListener('pointercancel', aoSair);
      canvas.removeEventListener('wheel', aoRolar);
      canvas.removeEventListener('contextmenu', impedirMenu);
    },
  };
}
