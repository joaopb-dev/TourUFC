/**
 * Seções de informação da ficha do órgão (PRJ-WEB-007).
 *
 * Cada seção recebe `{ local, ctx }` e devolve um elemento — ou `null` quando
 * o local não tem esse dado, caso em que nada é exibido (seções vazias não
 * aparecem). Para criar uma seção nova, copie um destes blocos para um arquivo
 * próprio e chame `registrarSecaoFicha()`.
 */

import { registrarSecaoFicha } from '../registry.js';

const el = (rotulo, classe, texto) => {
  const n = document.createElement(rotulo);
  if (classe) n.className = classe;
  if (texto != null) n.textContent = texto;
  return n;
};

function blocoCabecalho(titulo) {
  const b = el('section', 'bloco');
  b.appendChild(el('h3', null, titulo));
  return b;
}

/** Links de ação em linha própria, para não encostar no texto acima. */
function acoes(links) {
  if (!links.length) return null;
  const caixa = el('div', 'acoes');
  for (const link of links) caixa.appendChild(link);
  return caixa;
}

function linkExterno(rotulo, url) {
  const a = document.createElement('a');
  a.className = 'link-externo';
  a.href = url;
  a.target = '_blank';                     // links abrem em nova aba (regra 5)
  a.rel = 'noopener noreferrer';
  a.textContent = rotulo;
  return a;
}

/* ------------------------------------------------------------------ nome */

registrarSecaoFicha({
  id: 'nome',
  ordem: 10,
  render({ local }) {
    const b = el('section', 'bloco');
    b.appendChild(el('h2', 'ficha-titulo', local.nome));
    return b;
  },
});

/* ------------------------------------------------------------------ foto */

registrarSecaoFicha({
  id: 'foto',
  ordem: 20,
  render({ local }) {
    const foto = local.fotos[0];
    if (!foto) return null;
    const bloco = el('figure', 'ficha-foto');
    const img = document.createElement('img');
    img.src = foto.src;
    img.alt = local.nome;
    img.loading = 'lazy';
    bloco.appendChild(img);
    if (foto.legenda) bloco.appendChild(el('figcaption', 'ficha-legenda', foto.legenda));
    return bloco;
  },
});

/* -------------------------------------------------------------- endereço */

registrarSecaoFicha({
  id: 'endereco',
  ordem: 30,
  render({ local }) {
    if (!local.endereco) return null;
    const b = blocoCabecalho('Endereço');
    b.appendChild(el('p', null, local.endereco));
    return b;
  },
});

/* -------------------------------------------------------------- contatos */

registrarSecaoFicha({
  id: 'contatos',
  ordem: 40,
  render({ local }) {
    if (!local.contatos.length) return null;
    const b = blocoCabecalho('Contatos:');
    for (const c of local.contatos) {
      const grupo = el('div', 'contato-orgao');
      if (c.orgao) grupo.appendChild(el('strong', null, c.orgao));
      if (c.email) {
        const a = document.createElement('a');
        a.href = `mailto:${c.email}`;
        a.textContent = c.email;
        grupo.appendChild(a);
      }
      if (c.site) {
        const a = document.createElement('a');
        a.href = /^https?:\/\//i.test(c.site) ? c.site : `https://${c.site}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = c.site;
        grupo.appendChild(a);
      }
      if (c.telefone) grupo.appendChild(el('span', null, c.telefone));
      b.appendChild(grupo);
    }
    return b;
  },
});

/* ------------------------------------------------- bolsas e oportunidades */

registrarSecaoFicha({
  id: 'bolsas',
  ordem: 50,
  render({ local }) {
    if (!local.bolsas.length) return null;
    const area = document.createElement('section');
    area.appendChild(el('h3', 'ficha-titulo-faixa', 'Bolsas e oportunidades'));

    const b = el('section', 'bloco');
    const lista = el('ul', 'lista-simples');
    for (const bolsa of local.bolsas) {
      const item = document.createElement('li');
      item.appendChild(el('strong', null, bolsa.nome));
      if (bolsa.descricao) item.appendChild(document.createTextNode(` — ${bolsa.descricao}`));
      if (bolsa.prazo) item.appendChild(el('div', 'evento', `Prazo: ${bolsa.prazo}`));
      const ligacoes = acoes(bolsa.url ? [linkExterno('Acessar página', bolsa.url)] : []);
      if (ligacoes) item.appendChild(ligacoes);
      lista.appendChild(item);
    }
    b.appendChild(lista);
    area.appendChild(b);
    return area;
  },
});

/* --------------------------------------------------- novidades e eventos */

registrarSecaoFicha({
  id: 'novidades',
  ordem: 60,
  render({ local }) {
    if (!local.eventos.length) return null;
    const area = document.createElement('section');
    area.appendChild(el('h3', 'ficha-titulo-faixa', `Novidades no ${local.nome}`));

    const b = el('section', 'bloco');
    for (const evento of local.eventos) {
      const item = el('div', 'evento');
      item.appendChild(el('strong', null, evento.titulo));
      if (evento.inicio) {
        const periodo = evento.fim && evento.fim !== evento.inicio
          ? `${dataBR(evento.inicio)} — ${dataBR(evento.fim)}`
          : dataBR(evento.inicio);
        item.appendChild(el('span', null, periodo));
      }
      const ligacoes = acoes(evento.url ? [linkExterno('Saiba mais', evento.url)] : []);
      if (ligacoes) item.appendChild(ligacoes);
      b.appendChild(item);
    }
    area.appendChild(b);
    return area;
  },
});

/* ------------------------------------------------------------- links ext. */

registrarSecaoFicha({
  id: 'links',
  ordem: 70,
  render({ local }) {
    if (!local.links.length) return null;
    const b = blocoCabecalho('Links');
    const ligacoes = acoes(local.links.map((link) => linkExterno(link.rotulo, link.url)));
    if (ligacoes) b.appendChild(ligacoes);
    return b;
  },
});

function dataBR(iso) {
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}
