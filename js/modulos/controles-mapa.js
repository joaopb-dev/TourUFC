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
// A bússola tem o aro fixo e o ponteiro (agulha) girando junto com a vista:
// o ponteiro aponta sempre para o norte do conteúdo no quadro.
const SVG_BUSSOLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><g class="ponteiro"><path d="M12 6l3 9-3 3-3-3z"/></g></svg>';

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
  aoMontar(el, ctx) {
    const ponteiro = el.querySelector('.ponteiro');
    let ultimoGraus = null;
    ctx.hooks.aoNavegar.push(() => {
      const graus = Math.round(ctx.mapa.rotacao());
      if (graus === ultimoGraus) return;   // não reescreve o DOM à toa
      ultimoGraus = graus;
      // A vista girou θ no sentido anti-horário? A agulha (que aponta para
      // o norte) gira o mesmo ângulo no sentido horário (rotate(−θ)).
      ponteiro.style.transform = `rotate(${-graus}deg)`;
      const incl = Math.round(ctx.mapa.inclinacao());
      const rotulo = `Recentralizar a vista — norte a ${graus}°, inclinação ${incl}°`;
      el.title = rotulo;
      el.setAttribute('aria-label', rotulo);
    });
  },
});

/* ------------------------------------------------- ângulo e rotação */

/** Uma linha do painel: rótulo + leitura em graus + deslizante. */
function linhaDeslize({ rotulo, classe, min, max, valor, aplicar }) {
  const caixa = document.createElement('div');
  caixa.className = `linha-deslize ${classe}`;

  const topo = document.createElement('div');
  topo.className = 'topo';
  const nome = document.createElement('span');
  nome.textContent = rotulo;
  const leitura = document.createElement('output');
  leitura.className = `leitura ${classe}`;
  topo.append(nome, leitura);

  const deslize = document.createElement('input');
  deslize.type = 'range';
  deslize.className = `deslize ${classe}`;
  deslize.min = String(min);
  deslize.max = String(max);
  deslize.step = '1';
  deslize.value = String(valor);
  deslize.setAttribute('aria-label', `${rotulo} do mapa, em graus`);
  deslize.addEventListener('input', () => aplicar(Number(deslize.value)));

  caixa.append(topo, deslize);
  return { caixa, leitura, deslize };
}

registrarControle({
  id: 'angulo-e-rotacao',
  local: 'controles',
  ordem: 5,                    // acima do zoom: os botões ficam onde estavam
  titulo: 'Ângulo e rotação do mapa',
  render() {
    return document.createElement('div');
  },
  aoMontar(painel, ctx) {
    painel.className = 'painel-angulo';

    const angulo = linhaDeslize({
      rotulo: 'Ângulo',
      classe: 'inclinacao',
      min: 0,
      max: Math.round(ctx.mapa.limitesInclinacao().max),   // 45° — sem deitar
      valor: Math.round(ctx.mapa.inclinacao()),
      aplicar: (graus) => ctx.mapa.definirInclinacao(graus),
    });
    const rotacao = linhaDeslize({
      rotulo: 'Rotação',
      classe: 'rotacao',
      min: -180,
      max: 180,
      valor: Math.round(ctx.mapa.rotacao()),
      aplicar: (graus) => ctx.mapa.definirRotacao(graus),
    });
    painel.append(angulo.caixa, rotacao.caixa);

    // A vista muda por qualquer caminho (bússola, arraste, twist, gestos)?
    // os deslizantes e as leituras acompanham.
    function desenhar() {
      const inc = Math.round(ctx.mapa.inclinacao());
      const rot = Math.round(ctx.mapa.rotacao());
      angulo.leitura.textContent = `${inc}°`;
      rotacao.leitura.textContent = `${rot}°`;
      angulo.deslize.value = String(inc);
      rotacao.deslize.value = String(rot);
    }
    desenhar();
    ctx.hooks.aoNavegar.push(desenhar);
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
