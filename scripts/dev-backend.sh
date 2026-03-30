#!/usr/bin/env bash
set -euo pipefail

bind="127.0.0.1:48888"
db_path=""
bootstrap_admin_email="admin@example.local"
bootstrap_admin_password="change-this-password"
dev_admin_login="false"
cookie_secure="false"
ollama_url="http://localhost:11434"
ollama_model="deepseek-r1:8b-llama-distill-q8_0"
cors_origin="http://localhost:5173"
csrf_allowed_origin="http://localhost:5173"
ollama_timeout_secs="600"
release="0"
print_only="0"
no_collab="0"
collab_host="127.0.0.1"
collab_port="48889"
collab_path="/api/wiki/collab/ws"

usage() {
  cat <<'EOF'
Usage: scripts/dev-backend.sh [options]

Options:
  --bind <ip:port>              (default: 127.0.0.1:48888)
  --db-path <path>              (default: <repoRoot>/data/keel.demo.sqlite3)
  --bootstrap-admin-email <s>   (default: admin@example.local)
  --bootstrap-admin-password <s> (default: change-this-password)
  --dev-admin-login [true|false] (default: false; omit value for true, like ps1 -DevAdminLogin)
  --cookie-secure <true|false>  (default: false)
  --ollama-url <url>            (default: http://localhost:11434)
  --ollama-model <model>        (default: deepseek-r1:8b-llama-distill-q8_0)
  --cors-origin <origin>        (default: http://localhost:5173)
  --csrf-allowed-origin <origin> (default: http://localhost:5173)
  --ollama-timeout-secs <n>     (default: 600)
  --no-collab                   Do not start collab WebSocket server
  --collab-host <host>          (default: 127.0.0.1)
  --collab-port <port>          (default: 48889)
  --collab-path <path>          (default: /api/wiki/collab/ws)
  --release                     Run cargo in release mode
  --print-only                  Print commands and exit
  -h, --help                    Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bind) bind="${2:-}"; shift 2 ;;
    --db-path) db_path="${2:-}"; shift 2 ;;
    --bootstrap-admin-email) bootstrap_admin_email="${2:-}"; shift 2 ;;
    --bootstrap-admin-password) bootstrap_admin_password="${2:-}"; shift 2 ;;
    --dev-admin-login)
      if [[ -z "${2:-}" || "$2" == -* ]]; then
        dev_admin_login="true"
        shift
      else
        dev_admin_login="$2"
        shift 2
      fi
      ;;
    --cookie-secure) cookie_secure="${2:-}"; shift 2 ;;
    --ollama-url) ollama_url="${2:-}"; shift 2 ;;
    --ollama-model) ollama_model="${2:-}"; shift 2 ;;
    --cors-origin) cors_origin="${2:-}"; shift 2 ;;
    --csrf-allowed-origin) csrf_allowed_origin="${2:-}"; shift 2 ;;
    --ollama-timeout-secs) ollama_timeout_secs="${2:-}"; shift 2 ;;
    --no-collab) no_collab="1"; shift ;;
    --collab-host) collab_host="${2:-}"; shift 2 ;;
    --collab-port) collab_port="${2:-}"; shift 2 ;;
    --collab-path) collab_path="${2:-}"; shift 2 ;;
    --release) release="1"; shift ;;
    --print-only) print_only="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env from repo root (same behavior as dev-backend.ps1)
if [[ -f "$repo_root/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    if [[ "$line" == *"="* ]]; then
      key="${line%%=*}"
      key="${key%"${key##*[![:space:]]}"}"
      key="${key#"${key%%[![:space:]]*}"}"
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ ( "$value" == \"*\" && "${#value}" -ge 2 ) || ( "$value" == \'*\' && "${#value}" -ge 2 ) ]]; then
        value="${value:1:-1}"
      fi
      export "$key=$value"
    fi
  done < "$repo_root/.env"
fi

if [[ -z "$db_path" ]]; then
  db_path="$repo_root/data/keel.demo.sqlite3"
fi

manifest_path="$repo_root/backend/Cargo.toml"
if [[ ! -f "$manifest_path" ]]; then
  echo "backend/Cargo.toml not found: $manifest_path" >&2
  exit 1
fi

echo "[keel] dev backend starting..."
echo "  repoRoot:  $repo_root"
echo "  manifest:  $manifest_path"
echo "  bind:      $bind"
echo "  db:        $db_path"
if [[ "$no_collab" != "1" ]]; then
  echo "  collab:   ws://${collab_host}:${collab_port}${collab_path}"
fi

export KEEL_BIND="$bind"
export KEEL_DB_PATH="$db_path"
export KEEL_BOOTSTRAP_ADMIN_EMAIL="$bootstrap_admin_email"
export KEEL_BOOTSTRAP_ADMIN_PASSWORD="$bootstrap_admin_password"
export KEEL_DEV_ADMIN_LOGIN="$dev_admin_login"
export KEEL_COOKIE_SECURE="$cookie_secure"
export KEEL_OLLAMA_URL="$ollama_url"
export KEEL_OLLAMA_MODEL="$ollama_model"
export KEEL_CORS_ORIGIN="$cors_origin"
export KEEL_CSRF_ALLOWED_ORIGIN="$csrf_allowed_origin"
export KEEL_OLLAMA_TIMEOUT_SECS="$ollama_timeout_secs"

# Logging (opt-in override): show AIT progress logs by default in dev.
if [[ -z "${RUST_LOG:-}" ]]; then
  export RUST_LOG="info"
fi
echo "  RUST_LOG:   ${RUST_LOG}"

args=(run --bin keel_backend --manifest-path "$manifest_path")
if [[ "$release" == "1" ]]; then
  args+=(--release)
fi

echo
echo "  cargo ${args[*]}"
echo

if [[ "$print_only" == "1" ]]; then
  echo "[keel] PrintOnly: skipping execution."
  exit 0
fi

collab_pid=""
cleanup_collab() {
  if [[ -n "$collab_pid" ]] && kill -0 "$collab_pid" 2>/dev/null; then
    kill "$collab_pid" 2>/dev/null || true
  fi
}

if [[ "$no_collab" != "1" ]]; then
  collab_script="$repo_root/scripts/dev-collab.mjs"
  if [[ ! -f "$collab_script" ]]; then
    echo "collab script not found: $collab_script" >&2
    exit 1
  fi
  node "$collab_script" --host "$collab_host" --port "$collab_port" --path "$collab_path" &
  collab_pid=$!
  trap cleanup_collab EXIT
  sleep 0.4
  echo "  collab pid: $collab_pid"
fi

cargo "${args[@]}"
exit $?

