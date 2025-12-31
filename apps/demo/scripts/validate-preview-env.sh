#!/usr/bin/env bash
set -euo pipefail

# Validate .env.preview has all required variables

cd "$(dirname "$0")/.."

if [[ ! -f .env.preview ]]; then
  echo "❌ .env.preview not found"
  exit 1
fi

# Source the env file
set -a; source .env.preview; set +a

ERRORS=()

# Website build vars
if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  ERRORS+=("VITE_SUPABASE_URL is missing")
elif [[ ! "$VITE_SUPABASE_URL" =~ ^https:// ]]; then
  ERRORS+=("VITE_SUPABASE_URL must use https://")
fi

if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  ERRORS+=("VITE_SUPABASE_ANON_KEY is missing")
fi

# Supabase CLI vars
if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  ERRORS+=("SUPABASE_PROJECT_REF is missing")
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  ERRORS+=("SUPABASE_DB_URL is missing")
elif [[ ! "$SUPABASE_DB_URL" =~ ^postgresql:// ]]; then
  ERRORS+=("SUPABASE_DB_URL must start with postgresql://")
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  ERRORS+=("SUPABASE_ACCESS_TOKEN is missing")
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  ERRORS+=("SUPABASE_SERVICE_ROLE_KEY is missing")
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "❌ .env.preview validation failed:"
  for err in "${ERRORS[@]}"; do
    echo "   - $err"
  done
  exit 1
fi

echo "✅ .env.preview validated"
