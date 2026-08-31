#!/usr/bin/env bash
set -euo pipefail

env_file=".env.local"

if [[ -f "$env_file" ]]; then
  echo ".env.local already exists; leaving it unchanged."
  exit 0
fi

touch "$env_file"
wrote=0

append_secret() {
  local name="$1"
  local value="${!name:-}"

  if [[ -n "$value" ]]; then
    printf "%s=%s\n" "$name" "$value" >> "$env_file"
    wrote=1
  fi
}

append_secret "DATABASE_URL"
append_secret "NEON_AUTH_BASE_URL"
append_secret "NEON_AUTH_JWKS_URL"
append_secret "NEON_AUTH_COOKIE_SECRET"
append_secret "TMDB_API_READ_ACCESS_TOKEN"
append_secret "MDB_API_KEY"

if [[ "$wrote" -eq 1 ]]; then
  echo "Created .env.local from Codespaces secrets."
else
  rm "$env_file"
  echo "No Codespaces secrets found. Copy .env.example to .env.local and fill in values before running migrations or the app."
fi
