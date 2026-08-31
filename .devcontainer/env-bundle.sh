#!/usr/bin/env bash
set -euo pipefail

env_file=".env.local"

decode_base64() {
  if base64 --decode </dev/null >/dev/null 2>&1; then
    base64 --decode
  else
    base64 -D
  fi
}

usage() {
  echo "Usage: $0 encode [--repo OWNER/REPO] | decode" >&2
  exit 2
}

command="${1:-}"
shift || true

case "$command" in
  encode)
    base64 < "$env_file" | tr -d '\n'
    ;;
  decode)
    if [[ -e "$env_file" ]]; then
      echo "$env_file already exists; refusing to overwrite it" >&2
      exit 1
    fi

    umask 077
    temp_file="$(mktemp "${TMPDIR:-/tmp}/shortlist-env.XXXXXX")"
    trap 'rm -f "$temp_file"' EXIT
    decode_base64 > "$temp_file"
    mv "$temp_file" "$env_file"
    trap - EXIT
    echo "Created $env_file."
    ;;
  *)
    usage
    ;;
esac
