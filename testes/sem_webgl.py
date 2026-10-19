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

PORT = int(os.environ.get('TOURUFC_CDP_PORT', '9335'))
URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('TOURUFC_URL', 'http://localhost:8000/')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else '/tmp/opencode/cdp.png'
ESPERA = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0

proc = subprocess.Popen([
    'chromium-browser', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-allow-origins=*', f'--remote-debugging-port={PORT}',
    '--window-size=1440,900', '--hide-scrollbars', '--disable-webgl', '--disable-webgl2', 'about:blank',
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
            return JSON.stringify({
              erroWebglVisivel: !document.getElementById('erro-webgl').hidden,
              mensagem: document.querySelector('#erro-webgl p').textContent.trim(),
              pins: document.querySelectorAll('.pin').length,
              itensLista: document.querySelectorAll('.item-lista').length,
              canvasComContexto: !!document.getElementById('canvas-mapa').getContext('webgl2'),
              recursos: performance.getEntriesByType('resource').map((r) => r.name.split('/').slice(3).join('/')),
            });
        })()"""
        res = await cmd('Runtime.evaluate', {'expression': expressao, 'returnByValue': True})
        print('ESTADO:', res.get('result', {}).get('value'))

        shot = await cmd('Page.captureScreenshot', {'format': 'png'})
        with open(SAIDA, 'wb') as f:
            f.write(base64.b64decode(shot['data']))
        print('screenshot salvo em', SAIDA)


asyncio.run(main())
proc.terminate()

