#!/usr/bin/env bash
set -euo pipefail

env_file=".env.local"

if [[ -f "$env_file" ]]; then
  echo ".env.local already exists; leaving it unchanged."
  exit 0
fi

if [[ -n "${SHORTLIST_ENV_BUNDLE:-}" ]]; then
  printf '%s' "$SHORTLIST_ENV_BUNDLE" | .devcontainer/env-bundle.sh decode
else
  echo "No Codespaces secrets found. Copy .env.example to .env.local and fill in values before running migrations or the app."
fi
