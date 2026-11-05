#!/bin/sh
# Starship Aurora - host the bridge on this Mac / Linux computer
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js (LTS) from https://nodejs.org first."; exit 1; }
[ -d node_modules/ws ] || npm install --no-audit --no-fund
( sleep 2; open http://localhost:8737/ 2>/dev/null || xdg-open http://localhost:8737/ 2>/dev/null ) &
node server/dev-server.mjs
