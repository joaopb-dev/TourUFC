/**
 * Registro de extensões do TourUFC.
 *
 * Regra de arquitetura (plano, Seção 6): acrescentar botão no mapa ou seção
 * de informação na ficha não pode exigir mexer no núcleo. Basta criar um
 * arquivo em `js/modulos/` e chamar `registrarControle()` ou
 * `registrarSecaoFicha()` — depois importar o arquivo em
 * `js/modulos/index.js`.
 *
 *   import { registrarControle } from '../registry.js';
 *
 *   registrarControle({
 *     id: 'medir-distancia',
 *     local: 'controles',
 *     ordem: 50,
 *     titulo: 'Medir distância',
 *     render: (ctx) => { ... retorna um HTMLElement },
 *     aoMontar: (el, ctx) => { ... opcional, liga eventos },
 *   });
 *
 * `ctx` é o contexto do aplicativo (Seção 6.2 do plano):
 *   ctx.mapa      → aumentar, diminuir, recentralizar, centralizar, trocarArea
 *   ctx.estado    → locais, areas, areaAtual, localSelecionado
 *   ctx.ui        → abrirFicha, fecharFicha, selecionarLocal, atualizarNovidades
 *   ctx.aviso     → mapa(mensagem, comBotaoRecarregar)
 */

const controles = new Map();
const secoes = new Map();

function validar(def, tipo) {
  if (!def || typeof def !== 'object') {
    throw new TypeError(`${tipo}: definição precisa ser um objeto`);
  }
  if (!def.id || typeof def.id !== 'string') {
    throw new TypeError(`${tipo}: "id" (string) é obrigatório`);
  }
  if (typeof def.render !== 'function') {
    throw new TypeError(`${tipo} "${def.id}": "render" precisa ser função`);
  }
}

/** Registra um botão/controle sobre o mapa. */
export function registrarControle(def) {
  validar(def, 'registrarControle');
  if (controles.has(def.id)) {
    throw new Error(`registrarControle: id duplicado "${def.id}"`);
  }
  controles.set(def.id, { ordem: 100, ...def });
  return def.id;
}

/** Registra uma seção de informação da ficha do órgão. */
export function registrarSecaoFicha(def) {
  validar(def, 'registrarSecaoFicha');
  if (secoes.has(def.id)) {
    throw new Error(`registrarSecaoFicha: id duplicado "${def.id}"`);
  }
  secoes.set(def.id, { ordem: 100, ...def });
  return def.id;
}

function ordenados(mapa) {
  return [...mapa.values()].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

/** Monta todos os controles registrados dentro do contêiner indicado. */
export function montarControles(controlesPorLocal, ctx) {
  for (const def of ordenados(controles)) {
    const alvo = controlesPorLocal[def.local];
    if (!alvo) {
      console.warn(`controle "${def.id}": local "${def.local}" não existe no DOM`);
      continue;
    }
    const el = def.render(ctx);
    if (!(el instanceof HTMLElement)) {
      console.warn(`controle "${def.id}": render não retornou elemento`);
      continue;
    }
    alvo.appendChild(el);
    if (typeof def.aoMontar === 'function') def.aoMontar(el, ctx);
  }
}

/**
 * Renderiza a ficha de um órgão: cada seção registrada decide o que mostrar.
 * Seção que retorna `null` (dado ausente) não é exibida — regra "seção vazia
 * não aparece" do PRJ-WEB-007.
 */
export function montarFicha(local, alvo, ctx) {
  alvo.textContent = '';
  for (const def of ordenados(secoes)) {
    let el = null;
    try {
      el = def.render({ local, ctx });
    } catch (erro) {
      console.error(`seção "${def.id}" falhou para "${local.id}":`, erro);
    }
    if (el instanceof HTMLElement) alvo.appendChild(el);
  }
  return alvo;
}

/** Consultas usadas pelos testes e pela UI. */
export function listarControles() { return ordenados(controles); }
export function listarSecoesFicha() { return ordenados(secoes); }
