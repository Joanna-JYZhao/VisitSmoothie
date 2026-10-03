#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime="${JOURNAL_NODE:-/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
if [ ! -x "$runtime" ]; then
  runtime="$(command -v node)"
fi
exec "$runtime" server.mjs
