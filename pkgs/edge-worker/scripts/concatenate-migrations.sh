#!/bin/bash

# Create or clear the target file
target_file="./tests/db/migrations/edge_worker.sql"
mkdir -p $(dirname "$target_file")
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
