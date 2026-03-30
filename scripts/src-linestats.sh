#!/usr/bin/env bash
# Reports total source lines and top-N largest files under `src` and `backend/src`.
# Extensions: .ts .tsx .js .jsx .mjs .cjs .css .scss .sass .less .rs
# Skips node_modules, dist, build, coverage, target, .git, __pycache__, and any path segment starting with '.'.
#
# Usage:
#   ./scripts/src-linestats.sh [TOP_N]
#   TOP_N defaults to 20.

set -euo pipefail

TOP_N="${1:-20}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

is_excluded_path() {
  local path="$1"
  case "/${path}/" in
    */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/target/*|*/.git/*|*/__pycache__/*)
      return 0
      ;;
  esac
  local IFS='/'
  local -a parts
  read -r -a parts <<< "${path}"
  local p
  for p in "${parts[@]}"; do
    [[ -z "$p" ]] && continue
    [[ "$p" == .* ]] && return 0
  done
  return 1
}

section_stats() {
  local label="$1"
  local rel="$2"
  local dir="${REPO_ROOT}/${rel}"

  echo ""
  echo "=== ${label} (${rel}) ==="

  if [[ ! -d "$dir" ]]; then
    echo "Directory not found: ${dir}"
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  : >"$tmp"

  local f
  local repo_prefix="${REPO_ROOT}/"
  while IFS= read -r -d '' f; do
    local rp="${f#"$repo_prefix"}"
    if is_excluded_path "$rp"; then
      continue
    fi
    local ext
    ext=".$(basename "$f" | sed 's/^.*\.//')"
    ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
    case "$ext" in
      .ts|.tsx|.js|.jsx|.mjs|.cjs|.css|.scss|.sass|.less|.rs)
        ;;
      *)
        continue
        ;;
    esac
    local n
    n="$(wc -l < "$f" | tr -d ' ')"
    printf '%s\t%s\n' "$n" "$rp" >>"$tmp"
  done < <(find "$dir" -type f -print0 2>/dev/null)

  local total files
  total="$(awk -F'\t' '{s+=$1} END {print s+0}' "$tmp")"
  files="$(wc -l < "$tmp" | tr -d ' ')"

  echo "Total lines: ${total}"
  echo "File count:  ${files}"
  echo ""
  echo "Top ${TOP_N} by line count:"
  if [[ "$files" -gt 0 ]]; then
    sort -t$'\t' -nr -k1,1 "$tmp" | head -n "$TOP_N" | while IFS=$'\t' read -r lines relpath; do
      printf '%8s  %s\n' "$lines" "$relpath"
    done
  fi

  rm -f "$tmp"
}

echo "Repository: ${REPO_ROOT}"
section_stats "Frontend / app sources" "src"
section_stats "Backend sources" "backend/src"
echo ""
