#!/usr/bin/env bash
# Serve NIGHT CITY: COMMANDOS (v3) — three.js edition
cd "$(dirname "$0")"
echo "http://0.0.0.0:35464/"
exec python3 -m http.server 35464 --bind 0.0.0.0
