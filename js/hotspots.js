/**
 * Marcadores interativos (PRJ-WEB-003 e 006).
 *
 * Os pins são elementos HTML/CSS sobre o canvas: a posição vem da coordenada
 * do mundo convertida para tela com `Vector3.project()` (regra 2 da Seção
 * 2.1 — raycasting é proibido aqui) e o clique é evento nativo do DOM.
 * O posicionamento usa `transform`, nunca `top`/`left` (ponto de atenção 1).
 */

export function criarHotspots({ camada, mapa, aoClicar }) {
  const pins = new Map();   // id -> { el, corpo, badge, local }
  let visiveis = [];

  function criar(local) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin';
    el.dataset.id = local.id;
    el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', local.nome);

    const corpo = document.createElement('span');
    corpo.className = 'pin-corpo';

    const badge = document.createElement('span');
    badge.className = 'pin-badge';
    badge.hidden = true;

    el.append(corpo, badge);
    el.addEventListener('click', () => aoClicar(local));
    camada.appendChild(el);
    return { el, corpo, badge };
  }

  /** Cria/apaga pins conforme os locais da área em exibição. */
  function sincronizar(locais) {
    const desejados = new Map(locais.map((l) => [l.id, l]));
    for (const [id, pin] of [...pins]) {
      if (!desejados.has(id)) {
        pin.el.remove();
        pins.delete(id);
      }
    }
    for (const [id, local] of desejados) {
      if (!pins.has(id)) pins.set(id, { ...criar(local), local });
    }
    visiveis = locais.map((l) => pins.get(l.id)).filter(Boolean);
    atualizar();
  }

  function definirNovidades(id, quantidade) {
    const pin = pins.get(id);
    if (!pin) return;
    pin.badge.hidden = !quantidade;
    pin.badge.textContent = quantidade ? String(quantidade) : '';
  }

  function destacar(id) {
    for (const [key, pin] of pins) {
      pin.el.setAttribute('aria-pressed', String(key === id));
    }
  }

  function atualizar() {
    for (const pin of visiveis) {
      const { x, y } = mapa.paraTela(pin.local.coordenada.x, pin.local.coordenada.y);
      pin.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  /** Garante que o local apareça na tela depois de centralizar (PRJ-WEB-004). */
  function garantirVisivel(local, margem = 60) {
    const r = mapa.paraTela(local.coordenada.x, local.coordenada.y);
    const { largura, altura } = mapa.dimensoes();
    if (r.x >= margem && r.x <= largura - margem && r.y >= margem && r.y <= altura - margem) {
      return false;
    }
    mapa.centralizarEm(local.coordenada.x, local.coordenada.y, Math.max(mapa.zoom(), 2));
    atualizar();
    return true;
  }

  return { sincronizar, atualizar, destacar, definirNovidades, garantirVisivel };
}
