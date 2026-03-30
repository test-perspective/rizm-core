#!/usr/bin/env bash
set -euo pipefail

host="localhost"
port="5173"
backend_url="http://localhost:48888"
collab_url="ws://localhost:48889/api/wiki/collab/ws"
presets_only="0"
print_only="0"

usage() {
  cat <<'EOF'
Usage: scripts/dev-frontend.sh [options]

Options:
  --host <host>          (default: localhost)
  --port <port>          (default: 5173)
  --backend-url <url>    (default: http://localhost:48888)
  --collab-url <url>     (default: ws://localhost:48889/api/wiki/collab/ws)
  --presets-only         Force preset fallback (disable LLM transform)
  --print-only           Print commands and exit
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) host="${2:-}"; shift 2 ;;
    --port) port="${2:-}"; shift 2 ;;
    --backend-url) backend_url="${2:-}"; shift 2 ;;
    --collab-url) collab_url="${2:-}"; shift 2 ;;
    --presets-only) presets_only="1"; shift ;;
    --print-only) print_only="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$repo_root/package.json" ]]; then
  echo "package.json not found: $repo_root/package.json" >&2
  exit 1
fi

echo "[keel] dev frontend starting..."
echo "  repoRoot:  $repo_root"
echo "  host:      $host"
echo "  port:      $port"
export VITE_KEEL_BACKEND_URL="$backend_url"
export VITE_KEEL_COLLAB_URL="$collab_url"
echo "  backend:   $backend_url"
echo "  collab:    $collab_url"

if [[ "$presets_only" == "1" ]]; then
  export VITE_KEEL_AI_FORCE_FALLBACK="true"
  echo "  ai: presets-only (VITE_KEEL_AI_FORCE_FALLBACK=true)"
else
  unset VITE_KEEL_AI_FORCE_FALLBACK || true
fi

args=(run dev -- --host "$host" --port "$port")

echo
echo "  npm ${args[*]}"
echo

if [[ "$print_only" == "1" ]]; then
  echo "[keel] PrintOnly: skipping execution."
  exit 0
fi

cd "$repo_root"
exec npm "${args[@]}"

