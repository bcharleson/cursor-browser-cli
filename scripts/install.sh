#!/usr/bin/env bash
# Thin wrapper — prefer: npm install -g cursor-browser-cli
# Git clone fallback: ./scripts/install.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/setup.js"
