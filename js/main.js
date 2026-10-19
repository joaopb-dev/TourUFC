/**
 * Boot da aplicação (Seção 6.2 do plano).
 *
 * Ordem: verifica WebGL -> só então carrega mapa, JSON e hotspots. Falha vira
 * mensagem, nunca tela quebrada (regra 7 da Seção 2.1).
 */

import { carregarConteudo, eventoFuturo } from './data.js';
import { criarControlesDeCamera } from './camera.js';
import { criarHotspots } from './hotspots.js';
import { criarUI } from './ui.js';
import { filtrar } from './search.js';
import { montarControles } from './registry.js';
import './modulos/index.js';          // registra botões e seções da ficha

const $ = (sel) => document.querySelector(sel);

function temWebGL() {
  try {
    const teste = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext
      && (teste.getContext('webgl2') || teste.getContext('webgl') || teste.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

if (!temWebGL()) {
  $('#erro-webgl').hidden = false;                 // nada mais é carregado
} else {
  iniciar().catch((erro) => {
    console.error(erro);
    $('#erro-webgl p').textContent = 'Não foi possível iniciar o Tour UFC.';
    $('#erro-webgl').hidden = false;
  });
}

async function iniciar() {
  // O mapa (e o Three.js junto) só é carregado depois da checagem de WebGL.
  const { criarMapa } = await import('./map.js');

  const canvas = $('#canvas-mapa');
  const estado = {
    areas: [],
    locais: [],
    categorias: [],
    areaAtual: null,
    selecao: null,
    categoria: 'todos',
    termo: '',
    novidades: 0,
    novidadesBrutas: 0,
  };

  // Pontos de extensão: módulos registrados em js/modulos/ encaixam aqui.
  const hooks = {
    aposCarregamento: [],
    aposTrocarArea: [],
    aposMudarNovidades: [],
  };

  const mapa = criarMapa({ canvas });
  mapa.ajustarTamanho();

  const aviso = {
    mapa(mensagem, { botao = false } = {}) {
      const caixa = $('#aviso-mapa');
      caixa.querySelector('p').textContent = mensagem;
      caixa.querySelector('button').hidden = !botao;
      caixa.hidden = false;
      clearTimeout(aviso._t);
      if (!botao) aviso._t = setTimeout(() => { caixa.hidden = true; }, 4000);
    },
    esconder() { $('#aviso-mapa').hidden = true; },
  };
  $('#recarregar').addEventListener('click', () => location.reload());

  const hotspots = criarHotspots({
    camada: $('#camada-pins'),
    mapa,
    aoClicar: (local) => selecionar(local),
  });

  const ui = criarUI({
    elems: {
      lista: $('#lista-locais'),
      chips: $('#chips'),
      avisoVazio: $('#lista-vazia'),
      avisoErro: $('#lista-erro'),
      ficha: $('#ficha'),
      fichaCorpo: $('#ficha-corpo'),
      botaoFechar: $('#fechar-ficha'),
    },
    aoSelecionar: (local) => { selecionar(local); fecharGaveta(); },
    aoTrocarFiltro: (categoria) => {
      if (categoria) { estado.categoria = categoria; ui.marcarChip(categoria); }
      aplicarFiltro();
    },
    aoFechar: () => {
      estado.selecao = null;
      hotspots.destacar(null);
      ui.sincronizarSelecao(null, false);
      atualizar();
    },
  });

  const camera = criarControlesDeCamera({ canvas, mapa, aoMudar: atualizar });

  const ctx = {
    estado,
    hooks,
    aviso,
    mapa: {
      aumentar: camera.aumentar,
      diminuir: camera.diminuir,
      recentralizar: camera.recentralizar,
      centralizar: (local) => selecionar(local),
      trocarArea,
      zoom: () => mapa.zoom(),
      limites: () => mapa.limitesZoom(),
    },
    ui: {
      abrirFicha: (local) => selecionar(local),
      fecharFicha: () => ui.fecharFicha(),
      abrirProximaNovidade,
      fecharGaveta,
    },
  };

  // Botões do mapa e seções da ficha vêm do registro (js/registry.js).
  montarControles({
    controles: $('#controles-mapa'),
    notificacoes: $('#notificacoes'),
    seletor: $('#seletor-area'),
  }, ctx);

  // ------------------------------------------------------------------ helpers

  function locaisDaArea() {
    const id = estado.areaAtual && estado.areaAtual.id;
    return estado.locais.filter((l) => l.area === id);
  }

  function visiveis() {
    return filtrar(locaisDaArea(), { termo: estado.termo, categoria: estado.categoria });
  }

  function atualizar() {
    mapa.render();
    hotspots.atualizar();
  }

  function aplicarFiltro() {
    const lista = visiveis();
    ui.renderizarLista(lista, estado.selecao && estado.selecao.id);
    ui.sincronizarSelecao(estado.selecao && estado.selecao.id, false);
    hotspots.sincronizar(lista);
    hotspots.destacar(estado.selecao && estado.selecao.id);
    atualizar();
  }

  function selecionar(local) {
    estado.selecao = local;
    hotspots.destacar(local.id);
    ui.sincronizarSelecao(local.id, true);
    ui.abrirFicha(local, ctx);

    // Abrir a ficha estreita a área do mapa; o tamanho é relido antes de
    // centralizar, senão o local selecionado acaba fora do centro (PRJ-WEB-004).
    mapa.ajustarTamanho();
    mapa.centralizarEm(local.coordenada.x, local.coordenada.y, Math.max(mapa.zoom(), 1.8));
    atualizar();
  }

  function contarNovidades() {
    let brutas = 0;
    for (const local of locaisDaArea()) {
      const n = local.eventos.filter(eventoFuturo).length;
      hotspots.definirNovidades(local.id, n);
      brutas += n;
    }
    estado.novidadesBrutas = brutas;
    estado.novidades = estado.novidadesLidas ? 0 : brutas;
    for (const fn of hooks.aposMudarNovidades) fn(estado);
  }

  function abrirProximaNovidade() {
    const comEvento = locaisDaArea()
      .flatMap((local) => local.eventos.filter(eventoFuturo).map(() => local))
      .sort((a, b) => String(a.eventos[0].inicio).localeCompare(String(b.eventos[0].inicio)));
    if (!comEvento.length) {
      aviso.mapa('Nenhuma novidade no momento.');
      return;
    }
    estado.novidadesLidas = true;
    estado.novidades = 0;
    for (const fn of hooks.aposMudarNovidades) fn(estado);
    selecionar(comEvento[0]);
  }

  async function trocarArea(areaId, { silencioso = false } = {}) {
    const area = estado.areas.find((a) => a.id === areaId);
    if (!area || area === estado.areaAtual) return false;

    if (!area.textura) {
      if (!silencioso) aviso.mapa(`A textura da área "${area.nome}" ainda não foi exportada.`);
      return false;
    }

    estado.areaAtual = area;
    estado.selecao = null;
    ui.fecharFicha();

    try {
      await mapa.carregarTextura(area.textura);
    } catch (erro) {
      console.error(erro);
      aviso.mapa('Não foi possível carregar o mapa do campus.', { botao: true });
      return false;
    }

    aplicarFiltro();
    contarNovidades();
    for (const fn of hooks.aposTrocarArea) fn(area);
    atualizar();
    return true;
  }

  function fecharGaveta() { $('#app').classList.remove('gaveta-aberta'); }
  $('#abrir-gaveta').addEventListener('click', () => $('#app').classList.toggle('gaveta-aberta'));

  $('#campo-busca').addEventListener('input', (evento) => {
    estado.termo = evento.target.value;
    aplicarFiltro();
  });

  new ResizeObserver(() => { mapa.ajustarTamanho(); hotspots.atualizar(); }).observe($('#zona-mapa'));

  // ------------------------------------------------------------------ carga

  try {
    const conteudo = await carregarConteudo();
    estado.areas = conteudo.areas;
    estado.locais = conteudo.locais;
    estado.categorias = conteudo.categorias;
    ui.mostrarErroLista('');
    if (conteudo.categorias.length) ui.montarChips(conteudo.categorias);

    await trocarArea(conteudo.areas[0].id, { silencioso: true });
    for (const fn of hooks.aposCarregamento) fn(conteudo);
    aplicarFiltro();
    contarNovidades();
  } catch (erro) {
    console.error(erro);
    ui.mostrarErroLista('Não foi possível carregar os locais do campus.');
    aviso.mapa('Não foi possível carregar os dados do mapa.', { botao: true });
  }

  atualizar();
}
