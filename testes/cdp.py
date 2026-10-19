#!/usr/bin/env python3
"""Driver mínimo do Chrome DevTools Protocol: navega, espera em tempo real,
lê o estado da página e tira screenshot. Uso:
   python3 cdp.py <url> <arquivo.png> <segundos_de_espera>
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import urllib.request
from websockets.asyncio.client import connect

PORT = 9333
URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('TOURUFC_URL', 'http://localhost:8000/')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else '/tmp/opencode/cdp.png'
ESPERA = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0
AÇÃO = sys.argv[4] if len(sys.argv) > 4 else None

proc = subprocess.Popen([
    'chromium-browser', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-allow-origins=*', f'--remote-debugging-port={PORT}',
    '--window-size=1440,900', '--hide-scrollbars', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


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
            meu_id = seq
            await ws.send(json.dumps({'id': meu_id, 'method': metodo, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('id') == meu_id:
                    return resp.get('result', {})

        await cmd('Page.enable')
        await cmd('Runtime.enable')
        await cmd('Page.navigate', {'url': URL})
        await asyncio.sleep(ESPERA)

        expressao = """(() => {
            const t = window.__tour;
            const gl = t ? t.mapa.renderer.getContext() : null;
            const d = t ? t.mapa.dimensoes() : null;
            let px = null;
            if (gl) { const b = new Uint8Array(4); gl.readPixels(d.largura >> 1, d.altura >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); px = [...b].join(','); }
            return JSON.stringify({
              pins: document.querySelectorAll('.pin').length,
              comTransform: [...document.querySelectorAll('.pin')].filter((p) => p.style.transform).length,
              itensLista: document.querySelectorAll('.item-lista').length,
              chips: document.querySelectorAll('.chip').length,
              area: t && t.estado.areaAtual ? t.estado.areaAtual.id : null,
              selecao: t && t.estado.selecao ? t.estado.selecao.id : null,
              render: t ? t.mapa.renderer.info.render : null,
              pixelCentroGPU: px,
              erroWebglVisivel: !document.getElementById('erro-webgl').hidden,
              avisoMapaVisivel: !document.getElementById('aviso-mapa').hidden,
              avisoMapaTexto: document.querySelector('#aviso-mapa p').textContent,
              fichaAberta: !document.getElementById('ficha').hidden,
            });
        })()"""
        res = await cmd('Runtime.evaluate', {'expression': expressao, 'returnByValue': True})
        print('ESTADO:', res.get('result', {}).get('value'))

        if AÇÃO:
            r = await cmd('Runtime.evaluate', {'expression': AÇÃO, 'returnByValue': True, 'awaitPromise': True})
            print('AÇÃO:', r.get('result', {}).get('value'))
            await asyncio.sleep(2)

        shot = await cmd('Page.captureScreenshot', {'format': 'png'})
        with open(SAIDA, 'wb') as f:
            f.write(base64.b64decode(shot['data']))
        print('screenshot salvo em', SAIDA)


asyncio.run(main())
proc.terminate()
