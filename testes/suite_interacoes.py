#!/usr/bin/env python3
"""Testes de interação do TourUFC via CDP — só asserções de DOM (nada de estado interno)."""
import asyncio
import json
import os
import re
import subprocess
import urllib.request
from websockets.asyncio.client import connect

# URL do app servido localmente e porta do DevTools (livre por processo)
URL = os.environ.get('TOURUFC_URL', 'http://localhost:8000/')
PORT = int(os.environ.get('TOURUFC_CDP_PORT', '9336'))
proc = subprocess.Popen([
    'chromium-browser', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-allow-origins=*', f'--remote-debugging-port={PORT}',
    '--window-size=1440,900', '--hide-scrollbars', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

resultados = []


def check(nome, obtido, esperado, extra=''):
    ok = obtido == esperado
    resultados.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {nome}: obtido={obtido!r} esperado={esperado!r} {extra}")


def xy(transform):
    m = re.search(r'translate3d\(([-\d.]+)px, ([-\d.]+)px', transform or '')
    return (round(float(m.group(1))), round(float(m.group(2)))) if m else None


def get(path):
    with urllib.request.urlopen(f'http://localhost:{PORT}{path}') as r:
        return json.loads(r.read())


async def main():
    alvos = []
    for _ in range(60):
        try:
            alvos = get('/json/list')
            break
        except Exception:
            await asyncio.sleep(0.25)
    alvo = next(a for a in alvos if a['type'] == 'page')

    async with connect(alvo['webSocketDebuggerUrl'], max_size=128 * 1024 * 1024) as ws:
        seq = 0

        async def cmd(metodo, params=None):
            nonlocal seq
            seq += 1
            meu = seq
            await ws.send(json.dumps({'id': meu, 'method': metodo, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('id') == meu:
                    return resp.get('result', {})

        async def avaliar(js, espera=0.4):
            r = await cmd('Runtime.evaluate', {'expression': f'(() => {{ {js} }})()', 'returnByValue': True, 'awaitPromise': True})
            await asyncio.sleep(espera)
            res = r.get('result', {})
            return res.get('value', res.get('description'))

        def pin_js(pid):
            return f"return document.querySelector('.pin[data-id=\"{pid}\"]').style.transform;"

        centro_js = "(function(){const r=document.getElementById('canvas-mapa').getBoundingClientRect();return [Math.round(r.width/2), Math.round(r.height/2)];})()"
        await cmd('Page.enable')
        await cmd('Runtime.enable')
        await cmd('Page.navigate', {'url': URL})
        for _ in range(120):                      # espera o app terminar de subir
            await asyncio.sleep(0.5)
            prontos = await avaliar("return document.querySelectorAll('.pin[style]').length;", espera=0)
            if prontos and prontos >= 8:
                break
        print(f'      (app pronto: {prontos} pins posicionados)')

        # ---------------------------------------------------------- estado inicial
        st = json.loads(await avaliar("return JSON.stringify({pins: document.querySelectorAll('.pin').length, lista: document.querySelectorAll('.item-lista').length, chips: document.querySelectorAll('.chip').length, ficha: !document.getElementById('ficha').hidden, sino: document.querySelector('.btn-sino .badge').textContent, mapa: document.getElementById('canvas-mapa').width + 'x' + document.getElementById('canvas-mapa').height});"))
        check('pins iniciais', st['pins'], 8)
        check('itens da lista', st['lista'], 8)
        check('chips (3 + mais)', st['chips'], 4)
        check('ficha fechada no início', st['ficha'], False)
        check('badge do sino', st['sino'], '1')
        centro = await avaliar(f"return {centro_js};")
        largura_canvas, altura_canvas = (int(v) for v in st['mapa'].split('x'))
        check('canvas cobre a área do mapa', (abs(largura_canvas - centro[0] * 2) <= 1, abs(altura_canvas - centro[1] * 2) <= 1), (True, True), f"{st['mapa']} vs centro {tuple(centro)}")

        pos_inicial = xy(await avaliar(pin_js('nulic')))
        check('pin do NUCLIC posicionado no carregamento', pos_inicial is not None, True, f'{pos_inicial}')

        # ------------------------------------------------------ clique na lista
        await avaliar("document.querySelector('.item-lista').click();")
        st = json.loads(await avaliar("return JSON.stringify({ficha: !document.getElementById('ficha').hidden, texto: document.getElementById('ficha-corpo').textContent, pin: document.querySelector('.pin[data-id=\"bloco-engenharias\"]').getAttribute('aria-pressed'), item: document.querySelector('.item-lista').getAttribute('aria-current'), titulo: document.querySelector('.ficha-titulo').textContent});"))
        check('ficha abre ao clicar', st['ficha'], True)
        check('título da ficha', st['titulo'], 'Bloco das Engenharias')
        check('endereço correto (563)', 'R. Cel. Estanislau Frota, 563' in st['texto'], True)
        check('e-mail na ficha', 'ec@sobral.ufc.br' in st['texto'], True)
        check('telefone na ficha', '(88) 3695-4608' in st['texto'], True)
        check('evento na ficha', 'Encontros Universitários 2026' in st['texto'], True)
        check('período do evento', '04/11/2026 — 05/11/2026' in st['texto'], True)
        check('seção de bolsas', 'Auxílio Moradia' in st['texto'], True)
        check('legenda da foto', 'Em Breve: Encontros Universitários 2026' in st['texto'], True)
        check('pin selecionado', st['pin'], 'true')
        check('item da lista selecionado', st['item'], 'true')

        # PRJ-WEB-004: o local selecionado vai para o centro do mapa
        centro_depois = await avaliar(f"return {centro_js};")     # ficha já aberta
        no_centro = xy(await avaliar(pin_js('bloco-engenharias')))
        dentro = no_centro is not None and abs(no_centro[0] - centro_depois[0]) <= 1 and abs(no_centro[1] - centro_depois[1]) <= 1
        check('pin centralizado no mapa (com ficha aberta)', dentro, True, f'{no_centro} vs centro {tuple(centro_depois)}')

        # --------------------------------------------------------- clique no pin
        await avaliar("document.querySelector('.pin[data-id=\"nulic\"]').querySelector('.pin-corpo').click();")
        st = json.loads(await avaliar("return JSON.stringify({titulo: document.querySelector('.ficha-titulo').textContent, nulic: document.querySelector('.pin[data-id=\"nulic\"]').getAttribute('aria-pressed'), bloco: document.querySelector('.pin[data-id=\"bloco-engenharias\"]').getAttribute('aria-pressed')});"))
        check('pin abre a ficha', st['titulo'], 'NUCLIC')
        check('destaque migra para o pin clicado', (st['nulic'], st['bloco']), ('true', 'false'))

        # --------------------------------------------------------------- busca
        await avaliar("const c=document.getElementById('campo-busca'); c.value='restaur'; c.dispatchEvent(new Event('input',{bubbles:true}));")
        st = json.loads(await avaliar("return JSON.stringify({lista: [...document.querySelectorAll('.item-lista .nome')].map(n=>n.textContent), pins: document.querySelectorAll('.pin').length});"))
        check('busca "restaur" -> 1 resultado', len(st['lista']), 1)
        check('resultado é o RU', st['lista'][0], 'Restaurante Universitário (RU)')
        check('pins sincronizados com a lista', st['pins'], 1)

        st = json.loads(await avaliar("const c=document.getElementById('campo-busca'); c.value='COMP'; c.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify([...document.querySelectorAll('.item-lista .nome')].map(n=>n.textContent));"))
        check('busca sem caixa/acento "COMP"', len(st), 5, str(st))

        await avaliar("const c=document.getElementById('campo-busca'); c.value='zzz'; c.dispatchEvent(new Event('input',{bubbles:true}));")
        st = json.loads(await avaliar("return JSON.stringify({vazio: !document.getElementById('lista-vazia').hidden, lista: document.querySelectorAll('.item-lista').length, pins: document.querySelectorAll('.pin').length});"))
        check('sem resultado -> aviso', (st['lista'], st['vazio']), (0, True))
        check('sem resultado -> mapa limpo', st['pins'], 0)

        await avaliar("const c=document.getElementById('campo-busca'); c.value=''; c.dispatchEvent(new Event('input',{bubbles:true}));")

        # ------------------------------------------------------------ filtros
        await avaliar("[...document.querySelectorAll('.chip')].find(c=>c.textContent==='Bolsas').click();")
        st = json.loads(await avaliar("return JSON.stringify({n: document.querySelectorAll('.item-lista').length, ativo: [...document.querySelectorAll('.chip')].find(c=>c.getAttribute('aria-pressed')==='true').textContent});"))
        check('filtro Bolsas -> 2 locais', st['n'], 2)
        check('chip ativo é Bolsas', st['ativo'], 'Bolsas')

        await avaliar("[...document.querySelectorAll('.chip')].find(c=>c.textContent==='Todos').click();")
        st = await avaliar("return document.querySelectorAll('.item-lista').length;")
        check('volta para Todos -> 8', st, 8)

        # ------------------------------------------------------- novidades (sino)
        await avaliar("document.querySelector('.btn-sino').click();")
        st = json.loads(await avaliar("return JSON.stringify({titulo: document.querySelector('.ficha-titulo').textContent, badge: document.querySelector('.btn-sino .badge').hidden});"))
        check('sino abre a próxima novidade', st['titulo'], 'Bloco das Engenharias')
        check('badge some após ler', st['badge'], True)

        # ------------------------------------------------------------- zoom
        await avaliar("document.querySelector('.bussola').click();")   # garante o estado base
        pos_base = xy(await avaliar(pin_js('nulic')))
        await avaliar("document.querySelector('.zoom-mais').click();")
        pos_mais = xy(await avaliar(pin_js('nulic')))
        await avaliar("document.querySelector('.zoom-menos').click(); document.querySelector('.zoom-menos').click();")
        pos_menos = xy(await avaliar(pin_js('nulic')))
        await avaliar("document.querySelector('.bussola').click();")
        pos_volta = xy(await avaliar(pin_js('nulic')))
        check('zoom + aproxima o pin do centro', abs(pos_mais[0] - centro[0]) > abs(pos_base[0] - centro[0]), True, f'{pos_base} -> {pos_mais}')
        check('zoom - afasta o pin do centro', abs(pos_menos[0] - centro[0]) < abs(pos_mais[0] - centro[0]), True, f'{pos_mais} -> {pos_menos}')
        check('bússola recentraliza e afasta (zoom mínimo)', (abs(pos_volta[0] - pos_base[0]), abs(pos_volta[1] - pos_base[1])), (0, 0), f'{pos_volta} vs {pos_base}')

        # ------------------------------------------------------ troca de área
        await avaliar("document.querySelector('.btn-area').click();")
        st = await avaliar("return [...document.querySelectorAll('.menu-areas button')].map(b=>b.textContent);")
        check('menu de áreas lista Engenharias e FAMED', st, ['Engenharias', 'FAMED'])

        await avaliar("[...document.querySelectorAll('.menu-areas button')].find(b=>b.textContent==='FAMED').click();")
        st = json.loads(await avaliar("return JSON.stringify({aviso: !document.getElementById('aviso-mapa').hidden, texto: document.querySelector('#aviso-mapa p').textContent, rotulo: document.querySelector('.btn-area .rotulo').textContent, botao: !document.querySelector('#aviso-mapa button').hidden});"))
        check('FAMED sem textura -> avisa', st['aviso'], True)
        check('mensagem da área pendente', 'ainda não foi exportada' in st['texto'], True)
        check('seletor mantém a área atual', st['rotulo'], 'Engenharias')

        # ------------------------------------------------------- fechar ficha
        await avaliar("document.getElementById('fechar-ficha').click();")
        st = json.loads(await avaliar("return JSON.stringify({ficha: !document.getElementById('ficha').hidden, pressed: document.querySelectorAll('.pin[aria-pressed=\"true\"]').length, itens: document.querySelectorAll('.item-lista[aria-current=\"true\"]').length});"))
        check('fechar ficha', (st['ficha'], st['pressed'], st['itens']), (False, 0, 0))

    print()
    print(f"RESULTADO: {sum(resultados)}/{len(resultados)} verificações passaram")
    return 0 if all(resultados) else 1


codigo = asyncio.run(main())
proc.terminate()
