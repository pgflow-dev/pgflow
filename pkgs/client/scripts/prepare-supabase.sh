#!/bin/bash
# Prepares Supabase for client package by copying migrations and seed from core.
# Called automatically by scripts/supabase-start.sh before starting Supabase.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"

echo "Preparing Supabase for client..."
mkdir -p "$PKG_DIR/supabase/migrations/"
rm -f "$PKG_DIR/supabase/migrations/"*.sql
cp "$PKG_DIR/../core/supabase/migrations/"*.sql "$PKG_DIR/supabase/migrations/"
cp "$PKG_DIR/../core/supabase/seed.sql" "$PKG_DIR/supabase/"
echo "Migrations and seed copied from core"
