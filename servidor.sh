#!/usr/bin/env bash
# Sobe o servidor estático do TourUFC para testar o app no navegador.
#
# Uso:  ./servidor.sh          (porta 8000)
#       ./servidor.sh 8080     (outra porta)
#
# O servidor roda em primeiro plano de propósito: fechar o terminal (ou
# Ctrl+C) encerra o processo junto, sem deixar servidor órfão na máquina.
set -euo pipefail

PORTA="${1:-8000}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "TourUFC em http://localhost:${PORTA}/  (Ctrl+C para derrubar)"
cd "$RAIZ"
exec python3 -m http.server "$PORTA"
