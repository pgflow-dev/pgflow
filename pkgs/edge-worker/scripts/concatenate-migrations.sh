#!/bin/bash

# Create or clear the target file
target_file="./tests/db/990_edge_worker_migrations.sql"
echo "-- Combined migrations file" > "$target_file"
echo "-- Generated on $(date)" >> "$target_file"
echo "" >> "$target_file"

# Find all .sql files, sort them alphabetically, and concatenate
for f in $(find ./migrations -name '*.sql' | sort); do
  echo "-- From file: $(basename $f)" >> "$target_file"
  cat "$f" >> "$target_file"
  echo "" >> "$target_file"
  echo "" >> "$target_file"
done

#######################################################################
########################### TEMPLATE DB ###############################
#######################################################################
cat <<'SQL' > ./tests/db/995_create_templatedb.sql
----------------------------------------------------------------------

-- Terminate application connections but keep system connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'postgres' 
  AND pid <> pg_backend_pid()
  AND usename NOT IN ('postgres', 'supabase_admin')
  AND backend_type = 'client backend';

-- Create template database
CREATE DATABASE test_template WITH TEMPLATE postgres;

----------------------------------------------------------------------
SQL
