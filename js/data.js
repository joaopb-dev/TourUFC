/**
 * Carga e validação da base de conteúdo (regra 3 da Seção 2.1: nada de texto
 * institucional no código — tudo vem do JSON).
 *
 * Entradas inválidas são ignoradas em vez de quebrar a página
 * (ponto de atenção 2 da Seção 6.5).
 */

const PADRAO = 'data/locais.json';

export async function carregarConteudo(url = PADRAO) {
  const resposta = await fetch(url, { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`locais.json: HTTP ${resposta.status}`);
  const bruto = await resposta.json();
  return validar(bruto);
}

function texto(valor, max = 400) {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : null;
}

function validar(bruto) {
  const erros = [];

  const categorias = (Array.isArray(bruto.categorias) ? bruto.categorias : [])
    .map((c) => ({ id: texto(c.id, 40), nome: texto(c.nome, 40) }))
    .filter((c) => c.id && c.nome);

  const areas = (Array.isArray(bruto.areas) ? bruto.areas : [])
    .map((a, i) => ({
      id: texto(a.id, 40) || `area-${i}`,
      nome: texto(a.nome, 60) || `Área ${i + 1}`,
      modelo: texto(a.modelo, 300),
      textura: texto(a.textura, 300),
      miniatura: texto(a.miniatura, 300),
      zoomMax: Number.isFinite(a.zoomMax) ? a.zoomMax : null,
    }))
    .map((a, i) => {
      if (!a.modelo && !a.textura) erros.push(`área "${a.id}" sem mapa`);
      return a;
    });

  const locais = [];
  for (const [i, l] of (Array.isArray(bruto.locais) ? bruto.locais : []).entries()) {
    const id = texto(l.id, 60);
    const nome = texto(l.nome, 120);
    const x = l.coordenada && l.coordenada.x;
    const y = l.coordenada && l.coordenada.y;
    const dentroDaTextura = typeof x === 'number' && typeof y === 'number'
      && x >= 0 && x <= 1 && y >= 0 && y <= 1;

    if (!id || !nome || !dentroDaTextura) {
      erros.push(`local #${i} inválido (${l.id || 'sem id'}) — ignorado`);
      continue;
    }

    locais.push({
      id,
      nome,
      area: texto(l.area, 40) || (areas[0] && areas[0].id) || null,
      tipo: texto(l.tipo, 20) || 'unidade',
      categorias: Array.isArray(l.categorias) ? l.categorias.filter((c) => typeof c === 'string') : [],
      endereco: texto(l.endereco, 200),
      resumo: texto(l.resumo, 90) || (texto(l.endereco, 90) ?? ''),
      palavrasChave: texto(l.palavrasChave, 300),
      coordenada: { x, y },
      unidades: Array.isArray(l.unidades) ? l.unidades.filter((u) => typeof u === 'string') : [],
      contatos: (Array.isArray(l.contatos) ? l.contatos : []).map((c) => ({
        orgao: texto(c.orgao, 90),
        email: texto(c.email, 120),
        site: texto(c.site, 200),
        telefone: texto(c.telefone, 40),
      })).filter((c) => c.orgao || c.email || c.site || c.telefone),
      fotos: (Array.isArray(l.fotos) ? l.fotos : []).map((f) => ({
        src: typeof f === 'string' ? texto(f, 300) : texto(f.src, 300),
        legenda: texto(f.legenda, 160),
      })).filter((f) => f.src),
      eventos: (Array.isArray(l.eventos) ? l.eventos : []).map((e) => ({
        titulo: texto(e.titulo, 140),
        inicio: texto(e.inicio, 20),
        fim: texto(e.fim, 20),
        url: texto(e.url, 300),
      })).filter((e) => e.titulo),
      bolsas: (Array.isArray(l.bolsas) ? l.bolsas : []).map((b) => ({
        nome: texto(b.nome, 120),
        prazo: texto(b.prazo, 40),
        descricao: texto(b.descricao, 300),
        url: texto(b.url, 300),
      })).filter((b) => b.nome),
      links: (Array.isArray(l.links) ? l.links : []).map((k) => ({
        rotulo: texto(k.rotulo, 80),
        url: texto(k.url, 300),
      })).filter((k) => k.rotulo && /^https?:\/\//i.test(k.url || '')),
    });
  }

  if (erros.length) console.warn('locais.json:', erros);
  if (!areas.length) erros.push('nenhuma área válida');
  if (erros.length && (!areas.length)) {
    const e = new Error('base de conteúdo inválida');
    e.detalhes = erros;
    throw e;
  }

  return { areas, locais, categorias };
}

/** Evento ainda não ocorrido (para o contador de novidades — PRJ-WEB-009). */
export function eventoFuturo(evento) {
  if (!evento || !evento.inicio) return false;
  const fim = evento.fim || evento.inicio;
  const d = new Date(`${fim}T23:59:59`);
  return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now();
}
