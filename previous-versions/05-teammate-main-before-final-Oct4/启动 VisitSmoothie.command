#!/bin/bash
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$project_dir"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

node_runtime=""
for candidate in "${VISITSMOOTHIE_NODE:-}" "$(command -v node || true)" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
    node_runtime="$candidate"
    break
  fi
done

if [ -z "$node_runtime" ]; then
  echo "未找到 Node.js 24 或更新版本。请安装后再次双击此文件。"
  read -r -p "按回车关闭…" _ || true
  exit 1
fi

export PATH="$(dirname -- "$node_runtime"):$PATH"
if "$node_runtime" "$project_dir/scripts/launch.mjs"; then
  exit 0
else
  echo "启动失败，原因见上方。"
  read -r -p "按回车关闭…" _ || true
  exit 1
fi
