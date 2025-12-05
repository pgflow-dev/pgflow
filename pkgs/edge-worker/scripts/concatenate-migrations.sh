#!/bin/bash
set -e

# Create or clear the target file
target_file="./tests/db/migrations/pgflow.sql"
mkdir -p $(dirname "$target_file")
echo "-- Combined migrations file" > "$target_file"
echo "-- Generated on $(date)" >> "$target_file"
echo "" >> "$target_file"

# First add realtime schema if it exists
realtime_schema_file="../core/atlas/supabase-baseline-schema.sql"
if [ -f "$realtime_schema_file" ]; then
  echo "-- Including realtime schema from atlas dump" >> "$target_file"
  cat "$realtime_schema_file" >> "$target_file"
  echo "" >> "$target_file"
  echo "" >> "$target_file"
else
  echo -e "\e[31mERROR: Realtime schema file not found at $realtime_schema_file\e[0m"
  echo -e "\e[31mRun 'cd pkgs/core/atlas && ./dump-fresh-baseline.sh' to generate it\e[0m"
  exit 1
fi

# Then add core migrations
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

# Configure local JWT secret for is_local() detection in tests
echo "-- Configure local JWT secret for is_local() detection" >> "$target_file"
echo "ALTER DATABASE postgres SET app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';" >> "$target_file"
echo "" >> "$target_file"
