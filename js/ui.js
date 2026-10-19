/**
 * Camada DOM da interface: barra lateral (busca, chips, lista) e ficha.
 * A ficha não conhece as seções — elas vêm do registro
 * (js/registry.js), então acrescentar informação nova não mexe aqui.
 */

import { montarFicha } from './registry.js';

const MAX_CHIPS_ANTES_DO_MAIS = 3;   // "Todos", "Serviços", "Bolsas" + "›"

export function criarUI({ elems, aoSelecionar, aoTrocarFiltro, aoFechar }) {
  const { lista, chips, avisoVazio, avisoErro, ficha, fichaCorpo, botaoFechar } = elems;
  let mostrandoTodosChips = false;

  function montarChips(categorias) {
    chips.textContent = '';
    const visiveis = mostrandoTodosChips
      ? categorias
      : categorias.slice(0, MAX_CHIPS_ANTES_DO_MAIS);
    const restantes = categorias.length - visiveis.length;

    for (const cat of visiveis) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = cat.nome;
      b.dataset.categoria = cat.id;
      b.setAttribute('aria-pressed', String(cat.id === 'todos'));
      b.addEventListener('click', () => aoTrocarFiltro(cat.id));
      chips.appendChild(b);
    }

    if (restantes > 0 || mostrandoTodosChips) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip mais';
      b.textContent = mostrandoTodosChips ? '‹' : '›';
      b.setAttribute('aria-label', mostrandoTodosChips ? 'Mostrar menos categorias' : 'Mostrar mais categorias');
      b.addEventListener('click', () => {
        mostrandoTodosChips = !mostrandoTodosChips;
        montarChips(categorias);
        aoTrocarFiltro(null);   // só redesenha, mantém o filtro atual
      });
      chips.appendChild(b);
    }
    marcarChip(atualCategoria);
  }

  let atualCategoria = 'todos';

  function marcarChip(id) {
    atualCategoria = id || atualCategoria;
    for (const c of chips.querySelectorAll('.chip[data-categoria]')) {
      c.setAttribute('aria-pressed', String(c.dataset.categoria === atualCategoria));
    }
  }

  function renderizarLista(locais, idSelecionado) {
    lista.textContent = '';
    for (const local of locais) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item-lista';
      b.dataset.id = local.id;
      b.setAttribute('aria-current', String(local.id === idSelecionado));

      const texto = document.createElement('span');
      texto.className = 'texto';
      const nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = local.nome;
      const end = document.createElement('span');
      end.className = 'endereco';
      end.textContent = local.resumo || '';
      texto.append(nome, end);

      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.setAttribute('aria-hidden', 'true');

      b.append(texto, chevron);
      b.addEventListener('click', () => aoSelecionar(local));
      li.appendChild(b);
      lista.appendChild(li);
    }

    avisoVazio.hidden = locais.length > 0;
  }

  function sincronizarSelecao(id, locaisVisiveis) {
    for (const item of lista.querySelectorAll('.item-lista')) {
      item.setAttribute('aria-current', String(item.dataset.id === id));
    }
    if (!id) return;
    const item = lista.querySelector(`.item-lista[data-id="${CSS.escape(id)}"]`);
    if (item && locaisVisiveis) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  function mostrarErroLista(mensagem) {
    avisoErro.textContent = mensagem || '';
    avisoErro.hidden = !mensagem;
  }

  function abrirFicha(local, ctx) {
    ficha.hidden = false;
    montarFicha(local, fichaCorpo, ctx);
    ficha.scrollTop = 0;
  }

  function fecharFicha() {
    ficha.hidden = true;
    fichaCorpo.textContent = '';
    aoFechar();
  }

  botaoFechar.addEventListener('click', fecharFicha);

  return {
    montarChips,
    marcarChip,
    renderizarLista,
    sincronizarSelecao,
    mostrarErroLista,
    abrirFicha,
    fecharFicha,
  };
}
