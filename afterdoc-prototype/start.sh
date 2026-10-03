#!/bin/sh
set -eu
cd "$(dirname "$0")"
NODE_BIN=/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
if [ -x "$NODE_BIN" ]; then
  exec "$NODE_BIN" server.mjs
fi
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
fi
echo 'Node.js is required to run AfterDoc.' >&2
exit 1
