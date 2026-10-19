/**
 * Navegação e câmera (PRJ-WEB-002): arraste por mouse/Toque, rolagem e
 * pinça para zoom, mais os botões registrados por js/modulos/controles-mapa.js.
 *
 * Os limites de deslocamento e de aproximação vivem em map.js; aqui só se
 * traduz gesto em movimento e se avisa a UI (`aoMudar`) para reprojetar os
 * pins (ponto de atenção 1 da Seção 6.5: só durante o movimento).
 */

export function criarControlesDeCamera({ canvas, mapa, aoMudar }) {
  const ponteiros = new Map();
  let arrastando = false;
  let distancaiaAnterior = 0;

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
      canvas.classList.add('arrastando');
    }
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      distancaiaAnterior = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function aoMover(evento) {
    const anterior = ponteiros.get(evento.pointerId);
    if (!anterior) return;

    if (ponteiros.size === 2) {
      // pinça: distância entre dedos -> zoom, arraste conjunto -> pan
      const atual = { x: evento.clientX, y: evento.clientY };
      const lista = [...ponteiros.values()];
      const outro = lista.find((p) => p !== anterior) || atual;
      ponteiros.set(evento.pointerId, atual);

      const dist = Math.hypot(outro.x - atual.x, outro.y - atual.y);
      const r = canvas.getBoundingClientRect();
      const centro = { x: (outro.x + atual.x) / 2, y: (outro.y + atual.y) / 2 };
      const ndcCentro = {
        x: ((centro.x - r.left) / r.width) * 2 - 1,
        y: -(((centro.y - r.top) / r.height) * 2 - 1),
      };

      if (distancaiaAnterior > 0 && dist > 0) {
        mapa.aplicarZoom(mapa.zoom() * (dist / distancaiaAnterior), ndcCentro.x, ndcCentro.y);
      }
      distancaiaAnterior = dist;
      aoMudar();
      return;
    }

    const dx = evento.clientX - anterior.x;
    const dy = evento.clientY - anterior.y;
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (arrastando && (dx || dy)) {
      mapa.moverPorPixels(dx, dy, canvas.clientWidth, canvas.clientHeight);
      aoMudar();
    }
  }

  function aoSair(evento) {
    ponteiros.delete(evento.pointerId);
    if (ponteiros.size < 2) distancaiaAnterior = 0;
    if (ponteiros.size === 0) {
      arrastando = false;
      canvas.classList.remove('arrastando');
    }
  }

  function aoRolar(evento) {
    evento.preventDefault();
    const fator = Math.exp(-evento.deltaY * 0.0016);   // rolagem contínua
    const p = ndc(evento);
    mapa.aplicarZoom(mapa.zoom() * fator, p.x, p.y);
    aoMudar();
  }

  canvas.addEventListener('pointerdown', aoEncostar);
  canvas.addEventListener('pointermove', aoMover);
  canvas.addEventListener('pointerup', aoSair);
  canvas.addEventListener('pointercancel', aoSair);
  canvas.addEventListener('wheel', aoRolar, { passive: false });

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
    },
  };
}
