/**
 * Busca e filtros (PRJ-WEB-004 e PRJ-WEB-005).
 * Sem distinção de caixa nem de acentos — o termo é normalizado antes de
 * comparar, e a mesma função alimenta a lista lateral e os pins do mapa.
 */

export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Campos cobertos pela busca, incluindo palavras-chave do JSON. */
function textoBuscavel(local) {
  return normalizar([
    local.nome,
    local.endereco,
    local.palavrasChave,
    local.categorias.join(' '),
  ].join(' '));
}

export function filtrar(locais, { termo = '', categoria = 'todos' } = {}) {
  const alvo = normalizar(termo);
  const cat = normalizar(categoria);

  return locais.filter((local) => {
    if (cat && cat !== 'todos' && !local.categorias.some((c) => normalizar(c) === cat)) {
      return false;
    }
    if (!alvo) return true;
    return textoBuscavel(local).includes(alvo);
  });
}
