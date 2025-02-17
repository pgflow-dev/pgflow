#!/bin/bash

#######################################################################
########################### TEMPLATE DB ###############################
#######################################################################
cat <<'SQL' > ./tests/db/init_test_template.sql
----------------------------------------------------------------------

CREATE DATABASE test_template;
ALTER DATABASE test_template OWNER TO postgres;
ALTER DATABASE test_template WITH is_template TRUE;
GRANT ALL PRIVILEGES ON DATABASE test_template TO postgres;

----------------------------------------------------------------------
SQL

# Create or clear the target file
target_file="./tests/db/990_edge_worker_migrations.sql"
echo "-- Combined migrations file" > "$target_file"
echo "-- Generated on $(date)" >> "$target_file"
echo ""
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
