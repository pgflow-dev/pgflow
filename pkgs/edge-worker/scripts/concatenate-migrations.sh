#!/bin/bash

#######################################################################
########################### TEMPLATE DB ###############################
#######################################################################
cat <<'SQL' > ./tests/db/migrations/900_init.sql
----------------------------------------------------------------------

CREATE DATABASE test_template;
ALTER DATABASE test_template OWNER TO supabase_admin;
ALTER DATABASE test_template WITH is_template TRUE;
GRANT ALL PRIVILEGES ON DATABASE test_template TO supabase_admin;

----------------------------------------------------------------------
SQL

# Create or clear the target file
target_file="./tests/db/migrations/950_edge_worker.sql"
echo "-- Combined migrations file" > "$target_file"
echo "-- Generated on $(date)" >> "$target_file"
echo "" >> "$target_file"
echo "-- Connect to the test template database" >> "$target_file"
echo '\c test_template;' >> "$target_file"
echo "" >> "$target_file"

# Find all .sql files, sort them alphabetically, and concatenate
for f in $(find ./migrations -name '*.sql' | sort); do
  echo "-- From file: $(basename $f)" >> "$target_file"
  cat "$f" >> "$target_file"
  echo "" >> "$target_file"
  echo "" >> "$target_file"
done
