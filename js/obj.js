/**
 * Parser do modelo 3D do campus (`UFC.obj`).
 *
 * O arquivo vem do Blender no formato indexado `f v/vt/vn`, com normais
 * suaves (`vn`) e faces que podem ser triângulos, quads ou n-gons. Preservamos
 * a indexação e as normais originais: sem elas, as esferas das árvores viram
 * facetas duras e o relevo de satélite escorrega.
 *
 * O modelo é separado em três categorias de superfície — terreno (`Plane`),
 * construções (`Cube`) e vegetação (o resto) — para o chamador aplicar a
 * paleta de satélite. As posições saem escaladas para a largura de mundo
 * pedida e centradas na origem; o enquadramento usa só o conteúdo do campus,
 * senão o terreno (bem maior) empurraria os prédios para o miolo da tela.
 */

import * as THREE from '../vendor/three.module.js';

const CATEGORIA_PADRAO = 'construcao';

/** Categoria da superfície, deduzida do nome do objeto no Blender (`o ...`). */
function categoriaDe(nome) {
  const n = String(nome || '').toLowerCase();
  if (n.startsWith('plane')) return 'chao';        // terreno do campus
  if (n.startsWith('cube')) return 'construcao';   // prédios
  return 'vegetacao';                              // árvores e arbustos
}

/**
 * Lê o texto de um `.obj` e devolve uma geometria por categoria, já posicionada
 * no mundo (largura do conteúdo = `larguraMundo`, centro na origem).
 *
 * @param {string} texto conteúdo do arquivo .obj
 * @param {number} larguraMundo largura desejada no conteúdo (o restante acompanha)
 * @returns {{ geometrias: Array<{categoria: string, geo: THREE.BufferGeometry}>, alturaMundo: number }}
 */
export function montarGeometrias(texto, larguraMundo = 2) {
  const posicoes = [];      // x, y, z planos, na ordem do arquivo
  const normais = [];       // normais suaves do arquivo
  const grupos = new Map(); // categoria -> vértices deduplicados

  const grupoDe = (categoria) => {
    let g = grupos.get(categoria);
    if (!g) { g = { categoria, pos: [], nor: [], ind: [], mapa: new Map() }; grupos.set(categoria, g); }
    return g;
  };

  // Duas passadas: neste OBJ as faces `f` vêm ANTES das posições `v` (o
  // arquivo começa com `mtllib`), então só montamos os vértices depois de ter
  // lido tudo — referenciar `posicoes` durante a leitura daria NaN.
  const faces = [];          // { categoria, refs: [[vi, ni], ...] }
  let categoriaAtual = CATEGORIA_PADRAO;

  for (const bruta of texto.split('\n')) {
    const espaco = bruta.indexOf(' ');
    if (espaco < 0) continue;
    const rotulo = bruta.slice(0, espaco);
    const resto = bruta.slice(espaco + 1).trim();

    if (rotulo === 'v') {
      const p = resto.split(/\s+/);
      posicoes.push(+p[0], +p[1], +p[2]);
    } else if (rotulo === 'vn') {
      const p = resto.split(/\s+/);
      normais.push(+p[0], +p[1], +p[2]);
    } else if (rotulo === 'o') {
      categoriaAtual = categoriaDe(resto);
    } else if (rotulo === 'f') {
      const refs = resto.split(/\s+/).map((ref) => {
        const partes = ref.split('/');
        return [+partes[0] - 1, partes[2] ? +partes[2] - 1 : -1];
      });
      faces.push({ categoria: categoriaAtual, refs });
    }
  }

  if (!posicoes.length) throw new Error('OBJ sem vértices');

  for (const { categoria, refs } of faces) {
    const g = grupoDe(categoria);
    const cantos = refs.map(([vi, ni]) => vertice(g, posicoes, normais, vi, ni));
    // fan triangulation: (0,1,2), (0,2,3), ... cobre triângulos, quads e n-gons
    for (let i = 1; i < cantos.length - 1; i++) {
      g.ind.push(cantos[0], cantos[i], cantos[i + 1]);
    }
  }

  // Enquadramento: o campus é plano (X = largura, Z = profundidade, Y = altura),
  // então a "altura do mundo" da vista superior é a profundidade Z do conteúdo.
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  const anotar = (x, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  };

  const soConteudo = grupos.size > 1 && grupos.has('chao');
  if (soConteudo) {
    for (const g of grupos.values()) {
      if (g.categoria === 'chao') continue;
      for (let i = 0; i < g.pos.length; i += 3) anotar(g.pos[i], g.pos[i + 2]);
    }
  }
  if (minX > maxX) {                       // nada sobrou: usa o modelo inteiro
    for (const g of grupos.values()) {
      for (let i = 0; i < g.pos.length; i += 3) anotar(g.pos[i], g.pos[i + 2]);
    }
  }

  const escala = larguraMundo / Math.max(maxX - minX, 1e-4);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const geometrias = [];
  for (const [categoria, g] of grupos) {
    if (!g.ind.length) continue;
    for (let i = 0; i < g.pos.length; i += 3) {
      g.pos[i] = (g.pos[i] - cx) * escala;
      g.pos[i + 1] = g.pos[i + 1] * escala;   // altura: só escala, sem centrar
      g.pos[i + 2] = (g.pos[i + 2] - cz) * escala;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setIndex(g.ind.length > 65535
      ? new THREE.Uint32BufferAttribute(g.ind, 1)
      : new THREE.Uint16BufferAttribute(g.ind, 1));
    geometrias.push({ categoria, geo });
  }
  if (!geometrias.length) throw new Error('OBJ sem faces');

  return { geometrias, alturaMundo: (maxZ - minZ) * escala };
}

/**
 * Deduplica um vértice pela dupla posição/normal: o modelo reaproveita o mesmo
 * canto em várias faces, e separá-los infla a geometria sem ganho.
 */
function vertice(g, posicoes, normais, vi, ni) {
  const chave = ni < 0 ? `v${vi}` : `v${vi}n${ni}`;
  const existente = g.mapa.get(chave);
  if (existente !== undefined) return existente;

  const i = g.pos.length / 3;
  g.pos.push(posicoes[vi * 3], posicoes[vi * 3 + 1], posicoes[vi * 3 + 2]);
  if (ni >= 0 && normais.length) {
    g.nor.push(normais[ni * 3], normais[ni * 3 + 1], normais[ni * 3 + 2]);
  } else {
    g.nor.push(0, 1, 0);
  }
  g.mapa.set(chave, i);
  return i;
}
