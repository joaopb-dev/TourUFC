#!/usr/bin/env python3
"""Física de navegação do TourUFC via CDP — arraste, limites e mola elástica.

Diferente de `suite_interacoes.py` (só DOM), esta suíte dispara gestos reais
com `Input.dispatchMouseEvent` (eventos confiáveis, como um mouse de verdade)
e lê o estado do mapa pelo gancho `window.__tour`. Cobre o que a vista
inclinada alterou na matemática: o eixo Z do mundo é projetado encurtado pelo
cosseno da inclinação — no arraste, no limite de 25% e no zoom sobre o cursor.

Uso: servidor estático de pé na raiz do projeto e `chromium-browser` no PATH.
"""
import asyncio
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.request
from websockets.asyncio.client import connect

# URL do app servido localmente e porta do DevTools (livre por processo)
URL = os.environ.get('TOURUFC_URL', 'http://localhost:8000/')
PORT = int(os.environ.get('TOURUFC_CDP_PORT', '9347'))
proc = subprocess.Popen([
    'chromium-browser', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-allow-origins=*', f'--remote-debugging-port={PORT}',
    '--window-size=1440,900', '--hide-scrollbars', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

resultados = []
erros_js = []


def check(nome, obtido, esperado, extra=''):
    ok = obtido == esperado
    resultados.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {nome}: obtido={obtido!r} esperado={esperado!r} {extra}")


def get(path):
    with urllib.request.urlopen(f'http://localhost:{PORT}{path}') as r:
        return json.loads(r.read())


def xy(transform):
    m = re.search(r'translate3d\(([-\d.]+)px, ([-\d.]+)px', transform or '')
    return (float(m.group(1)), float(m.group(2))) if m else None


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

        def anotar_evento(resp):
            metodo = resp['method']
            par = resp.get('params', {})
            if metodo == 'Runtime.exceptionThrown':
                det = par.get('exceptionDetails', {})
                erros_js.append(det.get('text', 'exceptionThrown'))
            elif metodo == 'Runtime.consoleAPICalled' and par.get('type') == 'error':
                args = ' '.join(str(a.get('value', a.get('description', ''))) for a in par.get('args', []))
                erros_js.append(f'console.error: {args}')

        async def cmd(metodo, params=None):
            nonlocal seq
            seq += 1
            meu = seq
            await ws.send(json.dumps({'id': meu, 'method': metodo, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('id') == meu:
                    return resp.get('result', {})
                if 'method' in resp:          # eventos assíncronos (erros, logs)
                    anotar_evento(resp)

        async def avaliar(js, espera=0.4):
            r = await cmd('Runtime.evaluate', {
                'expression': f'(() => {{ {js} }})()',
                'returnByValue': True,
                'awaitPromise': True,
            })
            await asyncio.sleep(espera)
            res = r.get('result', {})
            return res.get('value', res.get('description'))

        # ------------------------------------------------------ leituras do mapa
        async def info():
            return await avaliar('return window.__tour.mapa.alturaMundoInfo();', espera=0)

        async def posicao():
            return await avaliar('return window.__tour.mapa.posicao();', espera=0)

        async def na_borda():
            return await avaliar('return window.__tour.mapa.naBorda();', espera=0)

        async def zoom():
            return await avaliar('return window.__tour.mapa.zoom();', espera=0)

        async def pin(pid):
            t = await avaliar(
                f'return (document.querySelector(\'.pin[data-id="{pid}"]\') || {{}}).style.transform;',
                espera=0,
            )
            return xy(t)

        async def recentralizar():
            # Reprojeta os pins junto: sem isso o transform fica velho após um
            # reset programático (no app real quem reprojeta é o gesto).
            await avaliar('window.__tour.mapa.recentralizar(); window.__tour.atualizar();', espera=0.25)

        # ------------------------------------------------------------ gestos
        async def mouse(tipo, x, y, button='none', buttons=0, click=1):
            await cmd('Input.dispatchMouseEvent', {
                'type': tipo, 'x': x, 'y': y, 'button': button,
                'buttons': buttons, 'clickCount': click,
            })

        async def pressionar(x, y):
            await mouse('mousePressed', x, y, button='left', buttons=1)

        async def mover(x, y):
            await mouse('mouseMoved', x, y, button='none', buttons=1)

        async def soltar(x, y):
            await mouse('mouseReleased', x, y, button='left', buttons=0)

        async def arrastar(pontos):
            """Pressiona no primeiro ponto, move até o último e solta."""
            await pressionar(*pontos[0])
            for p in pontos[1:]:
                await mover(*p)
            await soltar(*pontos[-1])

        await cmd('Page.enable')
        await cmd('Runtime.enable')
        await cmd('Page.navigate', {'url': URL})
        for _ in range(120):                      # espera o app terminar de subir
            await asyncio.sleep(0.5)
            prontos = await avaliar("return document.querySelectorAll('.pin[style]').length;", espera=0)
            if prontos and prontos >= 8:
                break
        print(f'      (app pronto: {prontos} pins posicionados)')

        quadro = await avaliar(
            "const r = document.getElementById('canvas-mapa').getBoundingClientRect();"
            'return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height};',
            espera=0,
        )
        cx, cy = quadro['x'], quadro['y']
        # Ponto de pressão sem pin nem controle por perto (topo do quadro, à
        # direita do centro): um clique sobre o pin abriria a ficha e mudaria o
        # tamanho do mapa no meio da suíte.
        sx, sy = quadro['x'] + quadro['w'] / 4, quadro['y'] - quadro['h'] / 4

        # ------------------------------------------------- arraste imediato no X
        await recentralizar()
        i = await info()
        # Mesma fórmula de moverPorPixels: (2·aspecto/zoom)/largura em px.
        mpp = (2 * i['aspecto'] / i['zoom']) / quadro['w']
        cosseno = math.cos(i['incl'])
        pin_antes = await pin('nulic')

        dx_total = -400                        # arrasto para a esquerda
        await arrastar([(sx, sy), (sx - 150, sy), (sx - 300, sy), (sx + dx_total, sy)])
        p = await posicao()
        esperado_x = -dx_total * mpp           # x do mapa = -dx·mpp
        check('arraste livre do primeiro gesto é exato no X', abs(p['x'] - esperado_x) < 1e-6, True,
              f"{p['x']:.9f} vs {esperado_x:.9f}")
        check('arraste no X não desloca o Z', abs(p['z']) < 1e-9, True, f"{p['z']:.3e}")
        pin_depois = await pin('nulic')
        desloc = (pin_depois[0] - pin_antes[0], pin_depois[1] - pin_antes[1])
        check('pin acompanha o arraste na tela', (abs(desloc[0] - dx_total) < 0.5, abs(desloc[1]) < 0.5),
              (True, True), f'{pin_antes} -> {pin_depois}')

        # ------------------------------------------------- arraste no Z inclinado
        await recentralizar()
        i = await info()
        mpp = (2 * i['aspecto'] / i['zoom']) / quadro['w']
        cosseno = math.cos(i['incl'])
        dy_total = 300                         # arrasto para baixo
        await arrastar([(sx, sy), (sx, sy + 150), (sx, sy + dy_total)])
        p = await posicao()
        esperado_z = -dy_total * mpp / cosseno  # Z projetado encurtado pelo cosseno
        check('arraste no Z divide pelo cosseno da inclinação', abs(p['z'] - esperado_z) < 1e-6, True,
              f"{p['z']:.9f} vs {esperado_z:.9f} (cos={cosseno:.6f})")
        check('arraste no Z não desloca o X', abs(p['x']) < 1e-9, True, f"{p['x']:.3e}")

        # ------------------------------------------ zoom ancorado no cursor
        await recentralizar()
        i = await info()
        z0 = i['zoom']
        cosseno = math.cos(i['incl'])
        await avaliar('window.__tour.mapa.aplicarZoom(window.__tour.mapa.zoom() * 2, 0.5, 0.5);'
                      'window.__tour.atualizar();', espera=0.25)
        p = await posicao()
        z1 = await zoom()
        fator = 0.5 * (1 / z0 - 1 / z1)         # deslocamento do ancoramento
        check('zoom dobra o zoom mínimo x2', abs(z1 - z0 * 2) < 1e-9, True, f'{z0} -> {z1}')
        check('zoom sobre o cursor mantém o ponto no X', abs(p['x'] - i['aspecto'] * fator) < 1e-6, True,
              f"{p['x']:.9f} vs {i['aspecto'] * fator:.9f}")
        check('zoom sobre o cursor mantém o ponto no Z (inclinado)', abs(p['z'] + fator / cosseno) < 1e-6, True,
              f"{p['z']:.9f} vs {-fator / cosseno:.9f}")

        # ------------------------------------------------------ clique puro
        await recentralizar()
        await pressionar(sx, sy)
        await soltar(sx, sy)
        await asyncio.sleep(0.3)
        p = await posicao()
        check('clique puro não arrasta nem dispara a mola', (round(p['x'], 9), round(p['z'], 9)), (0.0, 0.0))

        # ------------------------------------------- parede do X + mola de volta
        await recentralizar()
        i = await info()
        mvx = i['aspecto'] / i['zoom']                      # meia-largura visível
        minimo_x = min(0.25 * i['larguraMundo'], 2 * mvx)
        alto_x = i['larguraMundo'] / 2 + mvx - minimo_x
        pin_antes = await pin('nulic')

        # arrasta da borda direita até a esquerda do quadro (ultrapassa o limite)
        borda_dir = quadro['x'] + quadro['w'] / 2 - 15      # borda direita do quadro
        borda_esq = quadro['x'] - quadro['w'] / 2 + 15      # borda esquerda do quadro
        await pressionar(borda_dir, cy)
        await mover(borda_dir - 300, cy)
        await mover(borda_dir - 700, cy)
        await mover(borda_esq, cy)
        p_parede = await posicao()
        borda = await na_borda()
        check('parede do X é exata', abs(p_parede['x'] - alto_x) < 1e-6, True,
              f"{p_parede['x']:.9f} vs {alto_x:.9f}")
        check('naBorda true encostado no limite', borda, True)
        visivel = (min(p_parede['x'] + mvx, i['larguraMundo'] / 2)
                   - max(p_parede['x'] - mvx, -i['larguraMundo'] / 2))
        check('parede do X mantém 25% do conteúdo visível',
              visivel >= min(0.25 * i['larguraMundo'], 2 * mvx) - 1e-9, True, f'visível={visivel:.4f}')

        # solta: a mola elástica puxa de volta ao centro
        await soltar(borda_esq, cy)
        t0 = time.monotonic()
        amostras = []
        while time.monotonic() - t0 < 3.0:
            p = await posicao()
            amostras.append((time.monotonic() - t0, p['x'], p['z']))
            if abs(p['x']) < 1e-9 and abs(p['z']) < 1e-9:
                break
            await asyncio.sleep(0.03)

        xs = [x for _, x, _ in amostras]
        zs = [z for _, _, z in amostras]
        check('mola termina no centro exato', (round(xs[-1], 9), round(zs[-1], 9)), (0.0, 0.0))
        check('mola parte da parede', abs(xs[0]) > 0.5 * alto_x, True, f'primeiro x={xs[0]:.4f}')
        check('mola não ultrapassa o centro (sem overshoot)',
              all(x >= -1e-9 for x in xs), True)
        check('mola é monotônica até parar',
              all(abs(xs[k + 1]) <= abs(xs[k]) + 1e-9 for k in range(len(xs) - 1)), True)
        check('mola não desloca o Z', all(abs(z) < 1e-9 for z in zs), True)

        # Em renderização por software (SwiftShader) um quadro da mola pode
        # levar centenas de ms, então a duração e a desaceleração são medidas
        # do voo em si: de quando o mapa sai da parede até parar no centro.
        inicio = next((k for k, x in enumerate(xs) if x < xs[0] - 1e-9), 0)
        t_voo = amostras[inicio][0]
        duracao = amostras[-1][0] - t_voo

        def x_no_tempo(t):
            return abs(min(amostras, key=lambda a: abs(a[0] - t))[1])

        x25 = x_no_tempo(t_voo + duracao * 0.25)
        x75 = x_no_tempo(t_voo + duracao * 0.75)
        check('mola dura entre 0,6 e 1,5 s', 0.6 <= duracao <= 1.5, True, f'{duracao:.3f}s')
        # Desaceleração: em 1/4 do tempo já passou da metade do caminho e, em
        # 3/4, quase chegou — mola que segue em velocidade constante não passa.
        check('mola desacelera até parar',
              (alto_x - x25) > 0.5 * alto_x and (alto_x - x75) > 0.9 * alto_x, True,
              f'x(25%)={x25:.4f} x(75%)={x75:.4f} de {alto_x:.4f}')

        pin_depois = await pin('nulic')
        check('pins voltam ao lugar após a mola',
              pin_antes is not None and pin_depois is not None
              and abs(pin_depois[0] - pin_antes[0]) < 0.5 and abs(pin_depois[1] - pin_antes[1]) < 0.5,
              True, f'{pin_antes} -> {pin_depois}')

        # ------------------------------------------ reagarrar cancela a mola
        await recentralizar()
        await pressionar(borda_dir, cy)
        await mover(borda_dir - 400, cy)
        await mover(borda_esq, cy)
        # solta: espera o primeiro quadro da mola (o render por software pode
        # levar algumas centenas de ms por quadro) antes de reagarrar
        await soltar(borda_esq, cy)
        p_voo = await posicao()
        inicio_voo = time.monotonic()
        while abs(p_voo['x']) >= alto_x - 1e-9 and time.monotonic() - inicio_voo < 5.0:
            await asyncio.sleep(0.02)
            p_voo = await posicao()
        check('mola em voo pelo meio do caminho',
              0.001 < abs(p_voo['x']) < alto_x - 0.05, True, f"x={p_voo['x']:.4f}")
        # reagarra: um arraste miúdo no meio do voo deve congelar o retorno
        await pressionar(sx, sy)
        await mover(sx + 10, sy)
        await soltar(sx + 10, sy)
        p_solto = await posicao()
        await asyncio.sleep(0.35)
        p_fim = await posicao()
        check('reagarrar cancela a mola (parou onde soltou)',
              abs(p_fim['x'] - p_solto['x']) < 1e-9 and abs(p_fim['z'] - p_solto['z']) < 1e-9, True,
              f"soltou em ({p_solto['x']:.6f}, {p_solto['z']:.6f}) -> ({p_fim['x']:.6f}, {p_fim['z']:.6f})")

        # -------------------------------------- centralizar cancela a mola
        await recentralizar()
        await pressionar(borda_dir, cy)
        await mover(borda_dir - 400, cy)
        await mover(borda_esq, cy)
        await soltar(borda_esq, cy)
        await asyncio.sleep(0.15)
        await avaliar('window.__tour.mapa.recentralizar(); window.__tour.atualizar();', espera=0.3)
        p = await posicao()
        await asyncio.sleep(0.35)
        p2 = await posicao()
        check('centralizar cancela a mola e fica parado',
              (round(p['x'], 9), round(p['z'], 9), round(p2['x'], 9), round(p2['z'], 9)),
              (0.0, 0.0, 0.0, 0.0))

        # ------------------------------------------- parede do Z (inclinada)
        await recentralizar()
        i = await info()
        cosseno = math.cos(i['incl'])
        mvz = 1 / (i['zoom'] * cosseno)                     # meia-largura visível em Z
        minimo_z = min(0.25 * i['alturaMundo'], 2 * mvz)
        alto_z = i['alturaMundo'] / 2 + mvz - minimo_z
        await pressionar(cx, cy + quadro['h'] / 2 - 15)     # borda inferior do quadro
        await mover(cx, cy + 150)
        await mover(cx, cy - quadro['h'] / 2 + 15)          # até a borda superior
        p_parede = await posicao()
        borda = await na_borda()
        await soltar(cx, cy - quadro['h'] / 2 + 15)
        check('parede do Z é exata (cosseno da inclinação)', abs(p_parede['z'] - alto_z) < 1e-6, True,
              f"{p_parede['z']:.9f} vs {alto_z:.9f}")
        check('naBorda true no limite em Z', borda, True)
        visivel = (min(p_parede['z'] + mvz, i['alturaMundo'] / 2)
                   - max(p_parede['z'] - mvz, -i['alturaMundo'] / 2))
        check('parede do Z mantém 25% do conteúdo visível',
              visivel >= min(0.25 * i['alturaMundo'], 2 * mvz) - 1e-9, True, f'visível={visivel:.4f}')

        # ------------------------------------------------------- erros de JS
        await avaliar('return 1;', espera=0.3)               # drenagem final de eventos
        check('zero erros de JS', len(erros_js), 0, str(erros_js[:3]))

    print()
    print(f"RESULTADO: {sum(resultados)}/{len(resultados)} verificações passaram")
    return 0 if all(resultados) else 1


codigo = asyncio.run(main())
proc.terminate()
sys.exit(codigo)
