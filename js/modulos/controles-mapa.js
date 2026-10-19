/**
 * Controles do mapa: zoom, recentralização, novidades e troca de área.
 * Cada bloco abaixo é um candidato a virar arquivo próprio — o registro é o
 * contrato, não a localização do código.
 */

import { registrarControle } from '../registry.js';

function botao({ classe, rotulo, aoClicar, svg }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn-mapa ${classe}`.trim();
  b.setAttribute('aria-label', rotulo);
  b.title = rotulo;
  if (svg) b.innerHTML = svg;
  else b.textContent = '';
  b.addEventListener('click', aoClicar);
  return b;
}

const SVG_SINO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const SVG_BUSSOLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6l3 9-3 3-3-3z"/></svg>';

/* ------------------------------------------------------------------ zoom */

registrarControle({
  id: 'zoom',
  local: 'controles',
  ordem: 10,
  titulo: 'Zoom',
  render(ctx) {
    const pilha = document.createElement('div');
    pilha.className = 'pilha-zoom';
    pilha.append(
      botao({ classe: 'zoom-mais', rotulo: 'Aumentar o zoom', svg: '+', aoClicar: () => ctx.mapa.aumentar() }),
      botao({ classe: 'zoom-menos', rotulo: 'Diminuir o zoom', svg: '−', aoClicar: () => ctx.mapa.diminuir() }),
    );
    return pilha;
  },
});

/* -------------------------------------------------------- recentralizar */

registrarControle({
  id: 'recentralizar',
  local: 'controles',
  ordem: 20,
  titulo: 'Recentralizar a vista',
  render(ctx) {
    return botao({
      classe: 'bussola',
      rotulo: 'Recentralizar a vista',
      svg: SVG_BUSSOLA,
      aoClicar: () => ctx.mapa.recentralizar(),
    });
  },
});

/* ----------------------------------------------------------- novidades */

registrarControle({
  id: 'novidades',
  local: 'notificacoes',
  ordem: 10,
  titulo: 'Novidades e eventos',
  render(ctx) {
    const el = botao({
      classe: 'btn-sino',
      rotulo: 'Ver novidades',
      svg: SVG_SINO,
      aoClicar: () => ctx.ui.abrirProximaNovidade(),
    });
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.hidden = true;
    el.appendChild(badge);
    return el;
  },
  aoMontar(el, ctx) {
    const badge = el.querySelector('.badge');
    ctx.hooks.aposMudarNovidades.push((estado) => {
      badge.hidden = !estado.novidades;
      badge.textContent = estado.novidades ? String(estado.novidades) : '';
    });
  },
});

/* --------------------------------------------------------- troca de área */

registrarControle({
  id: 'seletor-de-area',
  local: 'seletor',
  ordem: 10,
  titulo: 'Escolher área do campus',
  render() {
    return document.createElement('div');
  },
  aoMontar(caixa, ctx) {
    caixa.className = 'seletor-interno';

    function desenhar() {
      const area = ctx.estado.areaAtual;
      caixa.textContent = '';
      if (!area) return;

      const botaoArea = document.createElement('button');
      botaoArea.type = 'button';
      botaoArea.className = 'btn-area';
      botaoArea.setAttribute('aria-haspopup', 'true');
      botaoArea.setAttribute('aria-expanded', 'false');

      const img = document.createElement('img');
      img.src = area.miniatura || '';
      img.alt = '';
      const rotulo = document.createElement('span');
      rotulo.className = 'rotulo';
      rotulo.textContent = area.nome;
      botaoArea.append(img, rotulo);

      botaoArea.addEventListener('click', () => {
        const aberto = caixa.querySelector('.menu-areas');
        if (aberto) { aberto.remove(); botaoArea.setAttribute('aria-expanded', 'false'); return; }

        const menu = document.createElement('ul');
        menu.className = 'menu-areas';
        for (const a of ctx.estado.areas) {
          const li = document.createElement('li');
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = a.nome;
          item.setAttribute('aria-current', String(a.id === ctx.estado.areaAtual.id));
          item.addEventListener('click', () => { menu.remove(); ctx.mapa.trocarArea(a.id); });
          li.appendChild(item);
          menu.appendChild(li);
        }
        caixa.appendChild(menu);
        botaoArea.setAttribute('aria-expanded', 'true');
      });

      caixa.appendChild(botaoArea);
    }

    desenhar();
    ctx.hooks.aposTrocarArea.push(desenhar);
    ctx.hooks.aposCarregamento.push(desenhar);
  },
});
