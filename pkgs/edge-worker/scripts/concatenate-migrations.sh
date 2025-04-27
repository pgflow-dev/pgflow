#!/bin/bash

# Create or clear the target file
target_file="./tests/db/migrations/pgflow.sql"
mkdir -p $(dirname "$target_file")
echo "-- Combined migrations file" > "$target_file"
echo "-- Generated on $(date)" >> "$target_file"
echo "" >> "$target_file"

# Also add core migrations
for f in $(find ../core/supabase/migrations -name '*.sql' | sort); do
  echo "-- From file: $(basename $f)" >> "$target_file"
  cat "$f" >> "$target_file"
  echo "" >> "$target_file"
  echo "" >> "$target_file"
done

# And copy the pgflow_tests
echo "-- From file: seed.sql" >> "$target_file"
cat "../core/supabase/seed.sql" >> "$target_file"
echo "" >> "$target_file"
echo "" >> "$target_file"
