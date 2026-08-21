#!/usr/bin/env bash
# src/engine/ is the only module allowed to import @wllama/wllama (P3-T3).
# Fails CI if any other file under src/ imports it directly.
set -euo pipefail

cd "$(dirname "$0")/.."

matches=$(grep -rn "from '@wllama/wllama" src/ --include="*.ts" --include="*.tsx" | grep -v "^src/engine/" || true)

if [ -n "$matches" ]; then
  echo "ERROR: @wllama/wllama imported outside src/engine/:" >&2
  echo "$matches" >&2
  exit 1
fi

echo "OK: @wllama/wllama imports are confined to src/engine/"
